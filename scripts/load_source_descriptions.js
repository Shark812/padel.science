const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const ROOT = path.resolve(__dirname, "..");

const connectionString =
  process.env.DATABASE_URL ||
  `postgres://${process.env.POSTGRES_USER || "padel"}:${process.env.POSTGRES_PASSWORD || "padel"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || "5432"}/${process.env.POSTGRES_DB || "padel"}`;

const SOURCE_FILES = [
  { portal: "padelful", file: "data/padelful-en-full/padelful.json" },
  { portal: "pala-hack", file: "data/pala-hack-en-full/pala-hack.json" },
  { portal: "padelzoom", file: "data/padelzoom-es-full/padelzoom.json" },
  { portal: "padelreference", file: "data/padelreference-en-full/padelreference.json" },
  { portal: "extreme-tennis", file: "data/extreme-tennis-en-full/extreme-tennis.json" },
];

function readJsonRecords(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return [];
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function pickDescription(record) {
  return (
    cleanText(record.description) ||
    cleanText(record.expert_notes) ||
    cleanText(record.og_description) ||
    cleanText(record.meta_description)
  );
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function parseTimestamp(value) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  const sourceDate = text.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  const normalizedDate = date.toISOString().slice(0, 10);
  if (sourceDate && sourceDate !== normalizedDate) return null;

  return date.toISOString();
}

async function upsertDescription(client, portal, record) {
  const sourceUrl = cleanText(record.source_url);
  const description = pickDescription(record);
  if (!sourceUrl || !description) return false;

  await client.query(
    `
      INSERT INTO app.source_racket_descriptions (
        source_portal,
        source_url,
        source_name,
        source_slug,
        description,
        description_char_count,
        description_word_count,
        raw_record_json,
        scraped_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      ON CONFLICT (source_portal, source_url)
      DO UPDATE SET
        source_name = EXCLUDED.source_name,
        source_slug = EXCLUDED.source_slug,
        description = EXCLUDED.description,
        description_char_count = EXCLUDED.description_char_count,
        description_word_count = EXCLUDED.description_word_count,
        raw_record_json = EXCLUDED.raw_record_json,
        scraped_at = EXCLUDED.scraped_at
    `,
    [
      portal,
      sourceUrl,
      cleanText(record.name),
      cleanText(record.slug),
      description,
      description.length,
      wordCount(description),
      JSON.stringify(record),
      parseTimestamp(record.published_at),
    ],
  );

  return true;
}

async function main() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  const summary = [];

  try {
    await client.query("BEGIN");

    for (const source of SOURCE_FILES) {
      const records = readJsonRecords(source.file);
      let withDescription = 0;

      for (const record of records) {
        if (await upsertDescription(client, source.portal, record)) {
          withDescription += 1;
        }
      }

      summary.push({
        source_portal: source.portal,
        records: records.length,
        upserted_descriptions: withDescription,
      });
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
