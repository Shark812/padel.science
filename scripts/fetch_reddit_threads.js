const { Pool } = require("pg");

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://padel:padel@localhost:5432/padel";

const pool = new Pool({ connectionString });

const USER_AGENT =
  "padel-portal-reddit-thread-scraper/0.1 (+https://localhost)";
const SEARCH_SORTS = ["relevance", "new", "comments", "top"];
const TARGET_SUBREDDIT = "Padelracket";
const REQUEST_TIMEOUT_MS = 25000;
const MAX_PAGES_PER_QUERY = 5;
const LIMIT_PER_PAGE = 100;
const DEFAULT_DELAY_MS = 350;
const PULLPUSH_SORT_TYPES = ["score"];
const PULLPUSH_MAX_PAGES_PER_SCOPE = 1;
const MODEL_STOPWORDS = new Set([
  "racket",
  "rackets",
  "padel",
  "review",
  "ale",
  "galan",
  "normal",
  "new",
]);
const SIGNATURE_TOKENS = new Set(["ale", "galan"]);
const VARIANT_GROUPS = [
  { key: "carbon", tokens: ["carbon"] },
  { key: "hrd", tokens: ["hrd"] },
  { key: "control", tokens: ["ctrl", "control"] },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toUtcIso(epochSeconds) {
  if (!Number.isFinite(epochSeconds)) {
    return null;
  }
  return new Date(epochSeconds * 1000).toISOString();
}

function normalizeSpace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value) {
  return normalizeSpace(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ");
}

function tokenizeForMatch(value) {
  return normalizeForMatch(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function variantTokens(token) {
  const variants = new Set([token]);
  if (/^\d+\.\d+$/.test(token)) {
    variants.add(token.replace(".", ""));
  } else if (/^\d{2,}$/.test(token)) {
    variants.add(`${token[0]}.${token.slice(1)}`);
  }
  return [...variants];
}

function removeYear(value) {
  return normalizeSpace(value).replace(/\b20\d{2}\b/g, "").replace(/\s+/g, " ").trim();
}

function addVersionVariants(value) {
  const variants = new Set();
  const normalized = normalizeSpace(value);
  if (!normalized) {
    return variants;
  }
  variants.add(normalized);
  variants.add(normalized.replace(/(\d)\.(\d)/g, "$1$2"));
  variants.add(normalized.replace(/(\d)(\d)\b/g, "$1.$2"));
  return variants;
}

function toPullpushQuery(value) {
  return normalizeSpace(value.replace(/"/g, " ").replace(/[^a-zA-Z0-9.\s]/g, " "));
}

function removeSignatureTokens(value) {
  const tokens = tokenizeForMatch(value).filter((token) => !SIGNATURE_TOKENS.has(token));
  return normalizeSpace(tokens.join(" "));
}

function buildQueryVariants(canonicalName, brandName) {
  const queries = new Set();
  const normalizedName = normalizeSpace(canonicalName);
  const noYear = removeYear(normalizedName);
  const noYearWithoutSignature = removeSignatureTokens(noYear);
  const nameBases = [noYearWithoutSignature, noYear].filter(Boolean);

  for (const nameBase of nameBases) {
    for (const nameVariant of addVersionVariants(nameBase)) {
      if (!nameVariant) {
        continue;
      }
      queries.add(`"${nameVariant}" padel`);
      queries.add(`"${nameVariant}"`);
      queries.add(`${nameVariant} review padel`);
    }
  }

  const brand = normalizeSpace(brandName);
  if (brand) {
    for (const nameBase of nameBases) {
      if (!nameBase.toLowerCase().startsWith(brand.toLowerCase())) {
        continue;
      }
      const withoutBrand = normalizeSpace(nameBase.slice(brand.length));
      for (const variant of addVersionVariants(withoutBrand)) {
        if (!variant) {
          continue;
        }
        queries.add(`"${brand} ${variant}" padel`);
        queries.add(`"${variant}" padel`);
      }
    }
  }

  return [...queries].filter(Boolean);
}

function isPadelSubreddit(subreddit) {
  return normalizeForMatch(subreddit) === normalizeForMatch(TARGET_SUBREDDIT);
}

function buildRacketMatcher(canonicalName, brandName) {
  const noYear = removeYear(canonicalName);
  const normalizedBrand = normalizeSpace(brandName);
  let noYearNoBrand = noYear;
  if (
    normalizedBrand &&
    noYear.toLowerCase().startsWith(normalizedBrand.toLowerCase())
  ) {
    noYearNoBrand = normalizeSpace(noYear.slice(normalizedBrand.length));
  }

  const brandTokens = tokenizeForMatch(normalizedBrand).filter((token) => token.length >= 2);
  const canonicalTokens = new Set(tokenizeForMatch(noYear));
  const rawModelTokens = tokenizeForMatch(noYearNoBrand).filter((token) => token.length >= 2);
  const modelTokens = rawModelTokens.filter((token) => !MODEL_STOPWORDS.has(token));
  const requiredModelTokens = modelTokens.length > 0 ? modelTokens : rawModelTokens;
  const requiredVariantGroups = [];
  const forbiddenVariantTokens = new Set();

  for (const group of VARIANT_GROUPS) {
    const hasGroupInCanonical = group.tokens.some((token) => canonicalTokens.has(token));
    if (hasGroupInCanonical) {
      requiredVariantGroups.push(group.tokens);
      continue;
    }
    for (const token of group.tokens) {
      forbiddenVariantTokens.add(token);
    }
  }

  return {
    brandTokens,
    requiredModelTokens,
    modelPhrase: normalizeForMatch(removeSignatureTokens(noYearNoBrand)),
    requiredVariantGroups,
    forbiddenVariantTokens: [...forbiddenVariantTokens],
  };
}

function titleMatchesRacket(title, matcher) {
  const normalizedTitle = normalizeForMatch(title);
  const titleTokens = new Set(tokenizeForMatch(title));

  const brandMatched =
    matcher.brandTokens.length === 0 ||
    matcher.brandTokens.every((brandToken) =>
      variantTokens(brandToken).some((candidate) => titleTokens.has(candidate)),
    );
  if (!brandMatched) {
    return false;
  }

  for (const requiredGroup of matcher.requiredVariantGroups) {
    const groupMatched = requiredGroup.some((token) => titleTokens.has(token));
    if (!groupMatched) {
      return false;
    }
  }

  for (const forbiddenToken of matcher.forbiddenVariantTokens) {
    if (titleTokens.has(forbiddenToken)) {
      return false;
    }
  }

  const requiredThreshold = Math.min(2, matcher.requiredModelTokens.length || 1);
  let modelHits = 0;
  for (const modelToken of matcher.requiredModelTokens) {
    const hit = variantTokens(modelToken).some((candidate) => titleTokens.has(candidate));
    if (hit) {
      modelHits += 1;
    }
  }

  if (modelHits >= requiredThreshold) {
    return true;
  }
  return matcher.modelPhrase.length > 0 && normalizedTitle.includes(matcher.modelPhrase);
}

function isRedditThreadCandidate(post) {
  if (!post || post.kind !== "t3") {
    return false;
  }
  const data = post.data || {};
  if (!data.id || !data.title || !data.permalink) {
    return false;
  }
  return true;
}

function normalizePost(post, queryUsed) {
  const data = post.data;
  return {
    reddit_post_id: String(data.id),
    title: normalizeSpace(data.title),
    upvotes: Number.isFinite(data.score) ? data.score : 0,
    comment_count: Number.isFinite(data.num_comments) ? data.num_comments : 0,
    thread_created_at: toUtcIso(data.created_utc),
    thread_url: `https://www.reddit.com${data.permalink}`,
    subreddit: String(data.subreddit || "unknown"),
    search_query: queryUsed,
  };
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchRedditPage({
  query,
  sort,
  after,
  subreddit,
}) {
  const endpoint = subreddit
    ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`
    : "https://www.reddit.com/search.json";
  const params = new URLSearchParams({
    q: query,
    sort,
    t: "all",
    type: "link",
    limit: String(LIMIT_PER_PAGE),
    raw_json: "1",
    show: "all",
  });
  if (subreddit) {
    params.set("restrict_sr", "1");
  }
  if (after) {
    params.set("after", after);
  }
  const url = `${endpoint}?${params.toString()}`;
  const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
  if (!response.ok) {
    const bodyPreview = await response.text().catch(() => "");
    const error = new Error(`Reddit search failed (${response.status}) for URL: ${url}`);
    error.statusCode = response.status;
    error.bodyPreview = bodyPreview.slice(0, 200);
    throw error;
  }
  return response.json();
}

async function searchPullpushPage({ query, subreddit, sortType, before }) {
  const pushQuery = toPullpushQuery(query);
  const params = new URLSearchParams({
    q: pushQuery,
    size: String(LIMIT_PER_PAGE),
    sort: "desc",
    sort_type: sortType,
  });
  if (subreddit) {
    params.set("subreddit", subreddit);
  }
  if (before) {
    params.set("before", String(before));
  }

  const url = `https://api.pullpush.io/reddit/search/submission/?${params.toString()}`;
  const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
  if (!response.ok) {
    const bodyPreview = await response.text().catch(() => "");
    const error = new Error(`PullPush search failed (${response.status}) ${bodyPreview.slice(0, 120)}`);
    error.statusCode = response.status;
    throw error;
  }
  return response.json();
}

async function fetchThreadsForQueryFromPullpush(query, delayMs, matcher) {
  const map = new Map();
  const scopes = [TARGET_SUBREDDIT];

  for (const subreddit of scopes) {
    for (const sortType of PULLPUSH_SORT_TYPES) {
      let before = null;
      for (let page = 1; page <= PULLPUSH_MAX_PAGES_PER_SCOPE; page += 1) {
        let payload;
        try {
          payload = await searchPullpushPage({
            query,
            subreddit,
            sortType,
            before,
          });
        } catch (error) {
          if (error?.statusCode === 429) {
            await sleep(2500);
            break;
          }
          throw error;
        }
        const posts = payload?.data || [];
        if (!Array.isArray(posts) || posts.length === 0) {
          break;
        }

        for (const data of posts) {
          if (!data || !data.id || !data.title) {
            continue;
          }
          const normalized = {
            reddit_post_id: String(data.id),
            title: normalizeSpace(data.title),
            upvotes: Number.isFinite(data.score) ? data.score : 0,
            comment_count: Number.isFinite(data.num_comments) ? data.num_comments : 0,
            thread_created_at: toUtcIso(data.created_utc),
            thread_url:
              data.url && String(data.url).startsWith("http")
                ? String(data.url)
                : `https://www.reddit.com${data.permalink || `/comments/${data.id}`}`,
            subreddit: String(data.subreddit || "unknown"),
            search_query: query,
          };
          if (!isPadelSubreddit(normalized.subreddit)) {
            continue;
          }
          if (!titleMatchesRacket(normalized.title, matcher)) {
            continue;
          }

          const existing = map.get(normalized.reddit_post_id);
          if (!existing || existing.upvotes < normalized.upvotes) {
            map.set(normalized.reddit_post_id, normalized);
          }
        }

        const oldest = posts.reduce((min, post) => {
          if (!post || !Number.isFinite(post.created_utc)) {
            return min;
          }
          return min === null ? post.created_utc : Math.min(min, post.created_utc);
        }, null);
        if (!Number.isFinite(oldest)) {
          break;
        }
        before = Number(oldest) - 1;
        await sleep(delayMs);
      }
      await sleep(delayMs);
    }
  }

  return [...map.values()];
}

async function fetchThreadsForQuery(query, delayMs, matcher) {
  const map = new Map();
  const scopes = [TARGET_SUBREDDIT];
  let shouldFallbackToPullpush = false;

  for (const subreddit of scopes) {
    for (const sort of SEARCH_SORTS) {
      let after = null;
      for (let page = 1; page <= MAX_PAGES_PER_QUERY; page += 1) {
        let payload;
        try {
          payload = await searchRedditPage({ query, sort, after, subreddit });
        } catch (error) {
          if (error?.statusCode === 403 || error?.statusCode === 429) {
            shouldFallbackToPullpush = true;
            break;
          }
          throw error;
        }
        const children = payload?.data?.children || [];
        for (const post of children) {
          if (!isRedditThreadCandidate(post)) {
            continue;
          }
          const normalized = normalizePost(post, query);
          if (!isPadelSubreddit(normalized.subreddit)) {
            continue;
          }
          if (!titleMatchesRacket(normalized.title, matcher)) {
            continue;
          }
          const existing = map.get(normalized.reddit_post_id);
          if (!existing || existing.upvotes < normalized.upvotes) {
            map.set(normalized.reddit_post_id, normalized);
          }
        }
        after = payload?.data?.after || null;
        if (!after) {
          break;
        }
        await sleep(delayMs);
      }
      if (shouldFallbackToPullpush) {
        break;
      }
      await sleep(delayMs);
    }
    if (shouldFallbackToPullpush) {
      break;
    }
  }

  if (shouldFallbackToPullpush) {
    const pullpushThreads = await fetchThreadsForQueryFromPullpush(
      query,
      delayMs,
      matcher,
    );
    for (const thread of pullpushThreads) {
      const existing = map.get(thread.reddit_post_id);
      if (!existing || existing.upvotes < thread.upvotes) {
        map.set(thread.reddit_post_id, thread);
      }
    }
  }

  return [...map.values()];
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app.racket_reddit_threads (
      id BIGSERIAL PRIMARY KEY,
      racket_id BIGINT NOT NULL REFERENCES app.rackets(id) ON DELETE CASCADE,
      reddit_post_id TEXT NOT NULL,
      title TEXT NOT NULL,
      upvotes INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      thread_created_at TIMESTAMPTZ,
      thread_url TEXT NOT NULL,
      subreddit TEXT NOT NULL,
      search_query TEXT,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (racket_id, reddit_post_id)
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_racket_reddit_threads_racket_id
    ON app.racket_reddit_threads(racket_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_racket_reddit_threads_subreddit
    ON app.racket_reddit_threads(subreddit);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_racket_reddit_threads_created_at
    ON app.racket_reddit_threads(thread_created_at DESC);
  `);

}

async function loadRackets(client, requestedModel) {
  if (requestedModel) {
    const { rows } = await client.query(
      `
        SELECT
          r.id,
          r.canonical_name,
          b.name AS brand_name
        FROM app.rackets r
        JOIN app.brands b
          ON b.id = r.brand_id
        WHERE r.canonical_name ILIKE '%' || $1 || '%'
           OR (b.name || ' ' || r.canonical_name) ILIKE '%' || $1 || '%'
        ORDER BY
          CASE WHEN LOWER(r.canonical_name) = LOWER($1) THEN 0 ELSE 1 END,
          r.reliability_score DESC,
          r.source_count DESC,
          r.canonical_name ASC
      `,
      [requestedModel],
    );
    return rows;
  }

  const { rows } = await client.query(`
    SELECT
      r.id,
      r.canonical_name,
      b.name AS brand_name
    FROM app.rackets r
    JOIN app.brands b
      ON b.id = r.brand_id
    ORDER BY r.id ASC
  `);
  return rows;
}

async function upsertThread(client, racketId, thread) {
  await client.query(
    `
      INSERT INTO app.racket_reddit_threads (
        racket_id,
        reddit_post_id,
        title,
        upvotes,
        comment_count,
        thread_created_at,
        thread_url,
        subreddit,
        search_query
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (racket_id, reddit_post_id) DO UPDATE
      SET
        title = EXCLUDED.title,
        upvotes = EXCLUDED.upvotes,
        comment_count = EXCLUDED.comment_count,
        thread_created_at = EXCLUDED.thread_created_at,
        thread_url = EXCLUDED.thread_url,
        subreddit = EXCLUDED.subreddit,
        search_query = EXCLUDED.search_query,
        updated_at = NOW()
    `,
    [
      racketId,
      thread.reddit_post_id,
      thread.title,
      thread.upvotes,
      thread.comment_count,
      thread.thread_created_at,
      thread.thread_url,
      thread.subreddit,
      thread.search_query,
    ],
  );
}

function parseArgs(argv) {
  const args = {
    model: null,
    delayMs: DEFAULT_DELAY_MS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--model") {
      args.model = argv[i + 1] || null;
      i += 1;
    } else if (token === "--delay-ms") {
      const parsed = Number.parseInt(argv[i + 1] || "", 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        args.delayMs = parsed;
      }
      i += 1;
    }
  }
  return args;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const client = await pool.connect();
  const summary = {
    requested_model: options.model,
    rackets_processed: 0,
    rackets_found: 0,
    inserted_or_updated_threads: 0,
    per_racket: [],
  };

  try {
    await ensureTable(client);

    const rackets = await loadRackets(client, options.model);
    summary.rackets_found = rackets.length;
    if (rackets.length === 0) {
      console.log(JSON.stringify({ ...summary, warning: "No matching racket found." }, null, 2));
      return;
    }

    for (const racket of rackets) {
      const queries = buildQueryVariants(racket.canonical_name, racket.brand_name);
      const matcher = buildRacketMatcher(racket.canonical_name, racket.brand_name);
      const threadMap = new Map();

      for (const query of queries) {
        const foundThreads = await fetchThreadsForQuery(
          query,
          options.delayMs,
          matcher,
        );
        for (const thread of foundThreads) {
          const existing = threadMap.get(thread.reddit_post_id);
          if (!existing || existing.upvotes < thread.upvotes) {
            threadMap.set(thread.reddit_post_id, thread);
          }
        }
      }

      const threads = [...threadMap.values()].sort((a, b) => {
        if (b.upvotes !== a.upvotes) {
          return b.upvotes - a.upvotes;
        }
        return b.comment_count - a.comment_count;
      });

      await client.query("BEGIN");
      try {
        await client.query(
          `
            DELETE FROM app.racket_reddit_threads
            WHERE racket_id = $1
          `,
          [racket.id],
        );

        for (const thread of threads) {
          await upsertThread(client, racket.id, thread);
          summary.inserted_or_updated_threads += 1;
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      summary.rackets_processed += 1;
      summary.per_racket.push({
        racket_id: racket.id,
        canonical_name: racket.canonical_name,
        queries_used: queries.length,
        stored_threads: threads.length,
      });
      console.log(
        `[racket ${racket.id}] ${racket.canonical_name} -> stored ${threads.length} Reddit threads`,
      );
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    client.release();
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
