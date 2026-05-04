const https = require("https");
const { URL } = require("url");
const { Pool } = require("pg");

const YEAR_RE = /\b(20[0-3][0-9])\b/g;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const TAG_RE = /<[^>]+>/g;
const SCRIPT_STYLE_RE = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi;
const WS_RE = /\s+/g;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function parseArgs(argv) {
  const out = {
    limit: 200,
    apply: false,
    minConfidence: 70,
    sleepMs: 250,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") out.apply = true;
    else if (arg === "--limit") out.limit = Number(argv[++i]);
    else if (arg === "--min-confidence") out.minConfidence = Number(argv[++i]);
    else if (arg === "--sleep-ms") out.sleepMs = Number(argv[++i]);
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchText(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "en-US,en;q=0.8",
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString("utf8");
        });
        res.on("end", () => resolve(data));
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

function extractYears(text) {
  const counts = new Map();
  if (!text) return counts;
  for (const match of text.matchAll(YEAR_RE)) {
    const year = Number(match[1]);
    counts.set(year, (counts.get(year) || 0) + 1);
  }
  return counts;
}

function cleanHtml(html) {
  const titleMatch = html.match(TITLE_RE);
  const title = titleMatch ? titleMatch[1].replace(TAG_RE, " ").replace(WS_RE, " ").trim() : "";
  const stripped = html.replace(SCRIPT_STYLE_RE, " ").replace(TAG_RE, " ").replace(WS_RE, " ").trim();
  return { title, text: stripped };
}

function fromName(name) {
  const years = [...name.matchAll(YEAR_RE)].map((m) => Number(m[1]));
  if (!years.length) return null;
  return {
    year: Math.max(...years),
    confidence: 95,
    source: "canonical_name",
    evidenceUrl: null,
    evidenceText: `name:${name}`,
  };
}

function fromPage(url, html, sourceTag) {
  if (!html) return null;
  const { title, text } = cleanHtml(html);
  const titleCounts = extractYears(title);
  const bodyCounts = extractYears(text);
  if (titleCounts.size === 0 && bodyCounts.size === 0) return null;

  const combined = new Map();
  for (const [y, c] of bodyCounts.entries()) combined.set(y, (combined.get(y) || 0) + c);
  for (const [y, c] of titleCounts.entries()) combined.set(y, (combined.get(y) || 0) + c * 2);

  let bestYear = null;
  let bestScore = -1;
  for (const [y, c] of combined.entries()) {
    if (c > bestScore || (c === bestScore && y > bestYear)) {
      bestYear = y;
      bestScore = c;
    }
  }
  if (!bestYear) return null;
  const confidence = bestScore >= 4 ? 88 : bestScore >= 3 ? 82 : bestScore >= 2 ? 76 : 68;
  return {
    year: bestYear,
    confidence,
    source: sourceTag,
    evidenceUrl: url,
    evidenceText: `mentions=${bestScore}; title=${title.slice(0, 120)}`,
  };
}

function extractDdgUrls(html, officialDomain, maxUrls = 3) {
  const urls = [];
  const hrefRe = /href="([^"]+)"/g;
  for (const m of html.matchAll(hrefRe)) {
    const href = m[1];
    if (!href.includes("duckduckgo.com/l/?")) continue;
    try {
      const u = new URL(href);
      const ddg = u.searchParams.get("uddg");
      if (!ddg) continue;
      const decoded = decodeURIComponent(ddg);
      const host = (new URL(decoded)).hostname.toLowerCase();
      if (host === officialDomain || host.endsWith(`.${officialDomain}`)) {
        if (!urls.includes(decoded)) urls.push(decoded);
      }
      if (urls.length >= maxUrls) break;
    } catch {
      continue;
    }
  }
  return urls;
}

async function fromOfficialDomain(officialDomain, brandName, modelName, sleepMs) {
  const q = `site:${officialDomain} "${modelName}" ${brandName} padel`;
  const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const ddgHtml = await fetchText(ddgUrl);
  if (!ddgHtml) return null;
  const candidateUrls = extractDdgUrls(ddgHtml, officialDomain, 3);
  let best = null;
  for (const url of candidateUrls) {
    await sleep(sleepMs);
    const html = await fetchText(url);
    const cand = fromPage(url, html, "official_domain_search");
    if (!cand) continue;
    if (!best || cand.confidence > best.confidence || (cand.confidence === best.confidence && cand.year > best.year)) {
      best = cand;
    }
  }
  return best;
}

function pickBest(candidates) {
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.confidence - a.confidence || b.year - a.year);
  return candidates[0];
}

async function ensureLogTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app.racket_year_enrichment_log (
      id BIGSERIAL PRIMARY KEY,
      racket_id BIGINT NOT NULL REFERENCES app.rackets(id) ON DELETE CASCADE,
      unified_id TEXT NOT NULL,
      previous_year INTEGER,
      proposed_year INTEGER,
      accepted BOOLEAN NOT NULL,
      confidence_score SMALLINT NOT NULL,
      source_method TEXT NOT NULL,
      evidence_url TEXT,
      evidence_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function processRow(row, options) {
  const candidates = [];
  const byName = fromName(row.canonical_name);
  if (byName) candidates.push(byName);

  const urls = Object.values(row.source_urls_json || {}).filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, 5);
  for (const url of urls) {
    await sleep(options.sleepMs);
    const html = await fetchText(url);
    const cand = fromPage(url, html, "source_page");
    if (cand) candidates.push(cand);
  }

  if (!candidates.length && row.official_domain) {
    const cand = await fromOfficialDomain(
      row.official_domain,
      row.brand_name,
      row.canonical_name,
      options.sleepMs,
    );
    if (cand) candidates.push(cand);
  }

  const best = pickBest(candidates);
  if (!best || best.confidence < options.minConfidence) return null;
  return best;
}

async function main() {
  const opts = parseArgs(process.argv);
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || "postgres://padel:padel@localhost:5432/padel",
  });

  await ensureLogTable(pool);
  const { rows } = await pool.query(
    `
      SELECT
        r.id,
        r.unified_id,
        r.canonical_name,
        r.year,
        r.source_urls_json,
        b.name AS brand_name,
        d.official_domain
      FROM app.rackets r
      JOIN app.brands b ON b.id = r.brand_id
      LEFT JOIN app.brand_official_domains d ON d.brand_id = b.id
      WHERE r.year IS NULL
      ORDER BY r.reliability_score DESC, r.source_count DESC, r.canonical_name ASC
      LIMIT $1
    `,
    [opts.limit],
  );

  let processed = 0;
  let proposed = 0;
  let applied = 0;
  let noCandidate = 0;

  for (const row of rows) {
    processed += 1;
    const best = await processRow(row, opts);
    if (!best) {
      noCandidate += 1;
      await pool.query(
        `
          INSERT INTO app.racket_year_enrichment_log (
            racket_id, unified_id, previous_year, proposed_year,
            accepted, confidence_score, source_method, evidence_url, evidence_text
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [row.id, row.unified_id, row.year, null, false, 0, "none", null, "no_candidate"],
      );
      continue;
    }

    proposed += 1;
    if (opts.apply) {
      await pool.query("UPDATE app.rackets SET year = $1 WHERE id = $2", [best.year, row.id]);
      applied += 1;
    }

    await pool.query(
      `
        INSERT INTO app.racket_year_enrichment_log (
          racket_id, unified_id, previous_year, proposed_year,
          accepted, confidence_score, source_method, evidence_url, evidence_text
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        row.id,
        row.unified_id,
        row.year,
        best.year,
        opts.apply,
        best.confidence,
        best.source,
        best.evidenceUrl,
        best.evidenceText,
      ],
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: opts.apply ? "apply" : "dry-run",
        processed_missing_rows: processed,
        proposed_years: proposed,
        applied_updates: applied,
        no_candidate_rows: noCandidate,
        min_confidence: opts.minConfidence,
        limit: opts.limit,
      },
      null,
      2,
    ),
  );

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
