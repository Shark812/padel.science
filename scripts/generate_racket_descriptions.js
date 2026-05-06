const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const PROMPT_PATH = path.join(ROOT, "llm_racket_prompt.md");
const ENV_EXAMPLE_PATH = path.join(ROOT, ".env.example");
const ENV_LOCAL_PATH = path.join(ROOT, ".env.local");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PROMPT_VERSION = "llm_racket_prompt_v1";
const DEFAULT_OPENROUTER_PRESET = "@preset/padel-desc";

function loadDotEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!override && process.env[key] !== undefined) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadEnvFiles() {
  loadDotEnvFile(ENV_EXAMPLE_PATH);
  loadDotEnvFile(ENV_LOCAL_PATH, { override: true });
}

function parseArgs() {
  const args = {
    limit: null,
    sleepMs: 500,
    concurrency: 4,
    dryRun: false,
    force: false,
    unifiedId: null,
  };

  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    const next = process.argv[index + 1];

    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--limit" && next) {
      args.limit = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--sleep-ms" && next) {
      args.sleepMs = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--concurrency" && next) {
      args.concurrency = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--unified-id" && next) {
      args.unifiedId = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error("--limit must be a positive integer.");
  }
  if (!Number.isInteger(args.sleepMs) || args.sleepMs < 0) {
    throw new Error("--sleep-ms must be a non-negative integer.");
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer.");
  }

  return args;
}

function connectionStringFromEnv() {
  return (
    process.env.DATABASE_URL ||
    `postgres://${process.env.POSTGRES_USER || "padel"}:${process.env.POSTGRES_PASSWORD || "padel"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || "5432"}/${process.env.POSTGRES_DB || "padel"}`
  );
}

function openRouterModelFromEnv() {
  const presetName =
    process.env.OPENROUTER_PRESET_NAME ||
    process.env.OPENROUTER_PRESET ||
    DEFAULT_OPENROUTER_PRESET;
  const model = process.env.OPENROUTER_MODEL;

  if (presetName) {
    if (presetName.startsWith("@preset/") || presetName.includes("@preset/")) {
      return presetName;
    }
    return `@preset/${presetName}`;
  }

  if (model) return model;

  throw new Error(
    "Missing OpenRouter preset/model. Set OPENROUTER_PRESET_NAME in .env.local, or OPENROUTER_MODEL as a fallback.",
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function secondsSince(startedAt) {
  return Number(((Date.now() - startedAt) / 1000).toFixed(2));
}

function average(values) {
  if (values.length === 0) return null;
  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2));
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function clipText(text, maxChars) {
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  const lastBoundary = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf("\n"));
  if (lastBoundary > maxChars * 0.65) return `${clipped.slice(0, lastBoundary + 1)} [truncated]`;
  return `${clipped.trimEnd()} [truncated]`;
}

function buildUserInput(racket, sources) {
  const specs = [
    ["shape", racket.shape],
    ["balance", racket.balance],
    ["surface", racket.surface],
    ["level", racket.level],
    ["feel", racket.feel],
    ["weight_raw", racket.weight_raw],
    ["core_material", racket.core_material],
    ["face_material", racket.face_material],
    ["frame_material", racket.frame_material],
    ["overall_rating_avg", racket.overall_rating_avg],
    ["power_avg", racket.power_avg],
    ["control_avg", racket.control_avg],
    ["maneuverability_avg", racket.maneuverability_avg],
    ["sweet_spot_avg", racket.sweet_spot_avg],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  const sourceBlocks = sources.map((source) => ({
    source_portal: source.source_portal,
    source_url: source.source_url,
    source_name: source.source_name,
    source_description: clipText(source.source_description, 6000),
  }));

  return JSON.stringify(
    {
      racket: {
        unified_id: racket.unified_id,
        name: racket.canonical_name,
        brand: racket.brand_name,
        year: racket.year,
      },
      structured_specs: Object.fromEntries(specs),
      source_descriptions: sourceBlocks,
    },
    null,
    2,
  );
}

function extractJsonObject(content) {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`Model response did not contain JSON: ${content.slice(0, 300)}`);
    }
    return JSON.parse(withoutFence.slice(start, end + 1));
  }
}

function validateDescriptions(payload) {
  const shortDescription = cleanText(payload.short_description);
  const longDescription = cleanText(payload.long_description);

  if (!shortDescription) throw new Error("Missing short_description in model response.");
  if (!longDescription) throw new Error("Missing long_description in model response.");

  return {
    short_description: shortDescription,
    long_description: longDescription,
  };
}

async function callOpenRouter({ apiKey, model, prompt, userInput }) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "http://localhost",
      "X-Title": process.env.OPENROUTER_APP_TITLE || "Padel Racket Descriptions",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userInput },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "racket_descriptions",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["short_description", "long_description"],
            properties: {
              short_description: { type: "string" },
              long_description: { type: "string" },
            },
          },
        },
      },
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter request failed ${response.status}: ${body.slice(0, 1000)}`);
  }

  const parsed = JSON.parse(body);
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`OpenRouter response missing choices[0].message.content: ${body.slice(0, 1000)}`);
  }

  return validateDescriptions(extractJsonObject(content));
}

async function fetchPendingRackets(client, { limit, force, unifiedId }) {
  const params = [];
  const conditions = [
    `EXISTS (
      SELECT 1
      FROM app.racket_sources rs
      WHERE rs.racket_id = r.id
        AND NULLIF(TRIM(rs.source_description), '') IS NOT NULL
    )`,
  ];

  if (!force) {
    conditions.push("(r.short_description IS NULL OR r.long_description IS NULL)");
  }

  if (unifiedId) {
    params.push(unifiedId);
    conditions.push(`r.unified_id = $${params.length}`);
  }

  let limitClause = "";
  if (limit !== null) {
    params.push(limit);
    limitClause = `LIMIT $${params.length}`;
  }

  const result = await client.query(
    `
      SELECT
        r.id,
        r.unified_id,
        r.canonical_name,
        b.name AS brand_name,
        r.year,
        r.shape,
        r.balance,
        r.surface,
        r.level,
        r.feel,
        r.weight_raw,
        r.core_material,
        r.face_material,
        r.frame_material,
        r.overall_rating_avg,
        r.power_avg,
        r.control_avg,
        r.maneuverability_avg,
        r.sweet_spot_avg
      FROM app.rackets r
      JOIN app.brands b
        ON b.id = r.brand_id
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY
        r.source_count DESC,
        r.reliability_score DESC,
        r.canonical_name ASC
      ${limitClause}
    `,
    params,
  );

  return result.rows;
}

async function fetchSources(client, racketId) {
  const result = await client.query(
    `
      SELECT source_portal, source_url, source_name, source_description
      FROM app.racket_sources
      WHERE racket_id = $1
        AND NULLIF(TRIM(source_description), '') IS NOT NULL
      ORDER BY source_portal
    `,
    [racketId],
  );

  return result.rows;
}

async function saveDescriptions(client, { racket, sources, model, descriptions }) {
  const sourceDescriptionsJson = sources.map((source) => ({
    source_portal: source.source_portal,
    source_url: source.source_url,
    source_name: source.source_name,
    source_description: source.source_description,
  }));

  await client.query("BEGIN");
  try {
    await client.query(
      `
        INSERT INTO app.racket_unified_descriptions (
          unified_id,
          short_description,
          long_description,
          model,
          source_descriptions_json,
          prompt_version,
          generated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
        ON CONFLICT (unified_id)
        DO UPDATE SET
          short_description = EXCLUDED.short_description,
          long_description = EXCLUDED.long_description,
          model = EXCLUDED.model,
          source_descriptions_json = EXCLUDED.source_descriptions_json,
          prompt_version = EXCLUDED.prompt_version,
          generated_at = EXCLUDED.generated_at
      `,
      [
        racket.unified_id,
        descriptions.short_description,
        descriptions.long_description,
        model,
        JSON.stringify(sourceDescriptionsJson),
        PROMPT_VERSION,
      ],
    );

    await client.query(
      `
        UPDATE app.rackets
        SET
          short_description = $2,
          long_description = $3,
          description_generated_at = NOW(),
          description_model = $4
        WHERE unified_id = $1
      `,
      [
        racket.unified_id,
        descriptions.short_description,
        descriptions.long_description,
        model,
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function processRacket({
  pool,
  apiKey,
  model,
  prompt,
  racket,
  index,
  total,
  dryRun,
}) {
  const startedAt = Date.now();
  const client = await pool.connect();
  try {
    const sources = await fetchSources(client, racket.id);
    const userInput = buildUserInput(racket, sources);

    console.log(`[${index}/${total}] ${racket.unified_id} ${racket.canonical_name}`);

    if (dryRun) {
      console.log(userInput.slice(0, 2500));
      return { saved: false };
    }

    const descriptions = await callOpenRouter({ apiKey, model, prompt, userInput });
    await saveDescriptions(client, { racket, sources, model, descriptions });
    const duration_seconds = secondsSince(startedAt);
    console.log(`  -> saved ${racket.unified_id} in ${duration_seconds}s`);
    return { saved: true, duration_seconds };
  } catch (error) {
    console.error(`  -> failed ${racket.unified_id} after ${secondsSince(startedAt)}s`);
    throw error;
  } finally {
    client.release();
  }
}

async function runConcurrent(items, concurrency, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
}

async function main() {
  loadEnvFiles();

  const args = parseArgs();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !args.dryRun) {
    throw new Error("Missing OPENROUTER_API_KEY in .env.local.");
  }

  const model = openRouterModelFromEnv();
  const prompt = fs.readFileSync(PROMPT_PATH, "utf8");
  const pool = new Pool({ connectionString: connectionStringFromEnv() });
  const client = await pool.connect();

  const summary = {
    model,
    dry_run: args.dryRun,
    processed: 0,
    saved: 0,
    failed: 0,
    duration_seconds: 0,
    average_success_seconds: null,
    throughput_per_minute: null,
  };
  const runStartedAt = Date.now();
  const successDurations = [];

  try {
    const rackets = await fetchPendingRackets(client, args);
    console.log(
      JSON.stringify(
        {
          pending_rackets: rackets.length,
          model,
          dry_run: args.dryRun,
          concurrency: args.concurrency,
        },
        null,
        2,
      ),
    );

    await runConcurrent(rackets, args.concurrency, async (racket, index) => {
      try {
        const result = await processRacket({
          pool,
          apiKey,
          model,
          prompt,
          racket,
          index: index + 1,
          total: rackets.length,
          dryRun: args.dryRun,
        });
        if (result.saved) {
          summary.saved += 1;
          if (result.duration_seconds !== undefined) {
            successDurations.push(result.duration_seconds);
          }
        }
      } catch (error) {
        summary.failed += 1;
        console.error(`  ! failed ${racket.unified_id}: ${error.message}`);
      } finally {
        summary.processed += 1;
      }

      if (args.sleepMs > 0 && summary.processed < rackets.length) {
        await sleep(args.sleepMs);
      }
    });
  } finally {
    client.release();
    await pool.end();
  }

  summary.duration_seconds = secondsSince(runStartedAt);
  summary.average_success_seconds = average(successDurations);
  summary.throughput_per_minute =
    summary.duration_seconds > 0
      ? Number(((summary.saved / summary.duration_seconds) * 60).toFixed(2))
      : null;

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
