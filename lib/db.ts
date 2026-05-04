import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  `postgres://${process.env.POSTGRES_USER ?? "padel"}:${process.env.POSTGRES_PASSWORD ?? "padel"}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5432"}/${process.env.POSTGRES_DB ?? "padel"}`;

declare global {
  var padelPgPool: Pool | undefined;
}

export const pool =
  globalThis.padelPgPool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.padelPgPool = pool;
}

export type RacketSearchResult = {
  unified_id: string;
  canonical_name: string;
  brand_slug: string;
  brand_name: string;
  year: number | null;
  source_count: number;
  reliability_score: number;
  match_confidence: string | null;
  needs_review: boolean;
  review_reasons_json: unknown;
  image_url: string | null;
  overall_rating_avg: string | null;
  power_avg: string | null;
  control_avg: string | null;
  maneuverability_avg: string | null;
  sweet_spot_avg: string | null;
  shape: string | null;
  surface: string | null;
  balance: string | null;
  level: string | null;
  similarity_score: number;
};

export type RacketDetail = RacketSearchResult & {
  image_source_portal: string | null;
  shape: string | null;
  balance: string | null;
  surface: string | null;
  level: string | null;
  feel: string | null;
  weight_raw: string | null;
  core_material: string | null;
  face_material: string | null;
  frame_material: string | null;
  power_avg: string | null;
  control_avg: string | null;
  comfort_avg: string | null;
  spin_avg: string | null;
  forgiveness_avg: string | null;
  maneuverability_avg: string | null;
  low_speed_avg: string | null;
  rebound_avg: string | null;
  sweet_spot_avg: string | null;
  ball_output_avg: string | null;
  effect_avg: string | null;
  tolerance_avg: string | null;
  total_avg: string | null;
  source_rows: Array<{
    source_portal: string;
    source_url: string;
    source_name: string | null;
    is_present: boolean;
  }>;
};

export async function searchRackets(query: string | null) {
  const { rows } = await pool.query<RacketSearchResult>(
    `
      SELECT
        re.unified_id,
        re.canonical_name,
        re.brand_slug,
        re.brand_name,
        re.year,
        re.source_count,
        re.reliability_score,
        re.match_confidence,
        re.needs_review,
        re.review_reasons_json,
        re.image_url,
        re.overall_rating_avg,
        re.power_avg,
        re.control_avg,
        re.maneuverability_avg,
        re.sweet_spot_avg,
        re.shape,
        re.surface,
        re.balance,
        re.level,
        1::real AS similarity_score
      FROM app.rackets_enriched re
      WHERE (
        COALESCE(NULLIF(TRIM($1), ''), '') = ''
        OR re.canonical_name ILIKE '%' || $1 || '%'
        OR re.brand_name ILIKE '%' || $1 || '%'
      )
      ORDER BY
        re.reliability_score DESC,
        re.source_count DESC,
        re.canonical_name ASC
    `,
    [query],
  );

  return rows;
}

export async function getRacketDetail(unifiedId: string) {
  const { rows } = await pool.query<RacketDetail>(
    "SELECT * FROM app.get_racket_detail($1)",
    [unifiedId],
  );

  return rows[0] ?? null;
}

export function toScore(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const score = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(score) ? score : null;
}

export function formatScore(value: string | number | null | undefined) {
  const score = toScore(value);
  return score === null ? "n.d." : score.toFixed(1);
}
