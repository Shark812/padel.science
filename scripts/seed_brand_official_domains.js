const { Pool } = require("pg");

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://padel:padel@localhost:5432/padel";

const pool = new Pool({ connectionString });

const BRAND_DOMAIN_MAP = [
  { slug: "adidas", domain: "adidas.com", confidence: 5, source: "official_brand_site" },
  { slug: "akkeron", domain: "akkeron.com", confidence: 5, source: "official_brand_site" },
  { slug: "alkemia", domain: "alkemiapadel.com", confidence: 5, source: "official_brand_site" },
  { slug: "babolat", domain: "babolat.com", confidence: 5, source: "official_brand_site" },
  { slug: "black-crown", domain: "blackcrown.es", confidence: 5, source: "official_brand_site" },
  { slug: "bullpadel", domain: "bullpadel.com", confidence: 5, source: "official_brand_site" },
  { slug: "cork", domain: "corkpadel.com", confidence: 4, source: "official_brand_site" },
  { slug: "cork-padel", domain: "corkpadel.com", confidence: 4, source: "official_brand_site" },
  { slug: "drop-shot", domain: "dropshot.com", confidence: 3, source: "web_research", notes: "Verify if regional corporate domain should be preferred." },
  { slug: "dropshot", domain: "dropshot.com", confidence: 3, source: "web_research", notes: "Verify if regional corporate domain should be preferred." },
  { slug: "dunlop", domain: "dunlopsports.com", confidence: 4, source: "official_brand_site" },
  { slug: "enebe", domain: "enebe.com", confidence: 4, source: "web_research" },
  { slug: "fila", domain: "fila.com", confidence: 5, source: "official_brand_site" },
  { slug: "grandcow", domain: "grandcow.com", confidence: 5, source: "web_research" },
  { slug: "head", domain: "head.com", confidence: 5, source: "official_brand_site" },
  { slug: "joma", domain: "joma-sport.com", confidence: 5, source: "official_brand_site" },
  { slug: "kelme", domain: "kelme.com", confidence: 5, source: "official_brand_site" },
  { slug: "kombat", domain: "kombatpadel.com", confidence: 5, source: "web_research" },
  { slug: "kuikma", domain: "decathlon.com", confidence: 4, source: "web_research", notes: "Kuikma is a Decathlon-owned brand." },
  { slug: "lok", domain: "loksports.com", confidence: 5, source: "web_research" },
  { slug: "nox", domain: "noxsport.com", confidence: 5, source: "official_brand_site" },
  { slug: "ocho-padel", domain: "ochopadel.com", confidence: 5, source: "web_research" },
  { slug: "osaka", domain: "osakaworld.com", confidence: 5, source: "official_brand_site" },
  { slug: "oxdog", domain: "oxdog.net", confidence: 5, source: "web_research" },
  { slug: "pallap", domain: "pallapusa.com", confidence: 4, source: "web_research", notes: "Using active official storefront domain; confirm global canonical domain." },
  { slug: "pro-kennex", domain: "pro-kennex.com", confidence: 4, source: "web_research" },
  { slug: "puma", domain: "puma.com", confidence: 5, source: "official_brand_site" },
  { slug: "royal-padel", domain: "royalpadel.com", confidence: 5, source: "web_research" },
  { slug: "siux", domain: "siuxpadel.com", confidence: 5, source: "web_research" },
  { slug: "slazenger", domain: "slazenger.com", confidence: 5, source: "web_research" },
  { slug: "softee", domain: "softeepadel.pro", confidence: 5, source: "web_research" },
  { slug: "star-vie", domain: "starvie.com", confidence: 5, source: "official_brand_site" },
  { slug: "starvie", domain: "starvie.com", confidence: 5, source: "official_brand_site" },
  { slug: "tecnifibre", domain: "tecnifibre.com", confidence: 5, source: "official_brand_site" },
  { slug: "varlion", domain: "varlion.com", confidence: 5, source: "official_brand_site" },
  { slug: "vibora", domain: "viborapadel.com", confidence: 4, source: "web_research" },
  { slug: "volt", domain: "voltpadel.com", confidence: 5, source: "web_research" },
  { slug: "wilson", domain: "wilson.com", confidence: 5, source: "official_brand_site" },
  {
    slug: "wlsrw",
    domain: null,
    confidence: 1,
    source: "web_research",
    status: "unresolved",
    notes: "No clear official domain found; likely marketplace-only brand.",
  },
];

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app.brand_official_domains (
      id BIGSERIAL PRIMARY KEY,
      brand_id BIGINT NOT NULL UNIQUE REFERENCES app.brands(id) ON DELETE CASCADE,
      official_domain TEXT,
      official_url TEXT,
      domain_source TEXT NOT NULL DEFAULT 'manual_research',
      confidence_score SMALLINT NOT NULL DEFAULT 1 CHECK (confidence_score BETWEEN 1 AND 5),
      resolution_status TEXT NOT NULL DEFAULT 'resolved'
        CHECK (resolution_status IN ('resolved', 'needs_review', 'unresolved')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function upsertRow(client, row) {
  const status = row.status || (row.domain ? "resolved" : "unresolved");
  const url = row.domain ? `https://${row.domain}` : null;

  await client.query(
    `
      INSERT INTO app.brand_official_domains (
        brand_id,
        official_domain,
        official_url,
        domain_source,
        confidence_score,
        resolution_status,
        notes
      )
      SELECT
        b.id,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7
      FROM app.brands b
      WHERE b.slug = $1
      ON CONFLICT (brand_id) DO UPDATE
      SET
        official_domain = EXCLUDED.official_domain,
        official_url = EXCLUDED.official_url,
        domain_source = EXCLUDED.domain_source,
        confidence_score = EXCLUDED.confidence_score,
        resolution_status = EXCLUDED.resolution_status,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    `,
    [
      row.slug,
      row.domain,
      url,
      row.source || "manual_research",
      row.confidence || 1,
      status,
      row.notes || null,
    ],
  );
}

async function main() {
  await ensureTable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of BRAND_DOMAIN_MAP) {
      await upsertRow(client, row);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const summary = await pool.query(`
    SELECT
      COUNT(*)::int AS mapped_rows,
      COUNT(*) FILTER (WHERE resolution_status = 'resolved')::int AS resolved_rows,
      COUNT(*) FILTER (WHERE resolution_status <> 'resolved')::int AS unresolved_rows
    FROM app.brand_official_domains;
  `);

  const missingBrands = await pool.query(`
    SELECT b.slug
    FROM app.brands b
    LEFT JOIN app.brand_official_domains d
      ON d.brand_id = b.id
    WHERE d.id IS NULL
    ORDER BY b.slug;
  `);

  console.log(
    JSON.stringify(
      {
        summary: summary.rows[0],
        missing_brand_rows: missingBrands.rows.map((row) => row.slug),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
