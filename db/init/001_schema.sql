CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.brands (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app.rackets (
    id BIGSERIAL PRIMARY KEY,
    unified_id TEXT NOT NULL UNIQUE,
    canonical_name TEXT NOT NULL,
    brand_id BIGINT NOT NULL REFERENCES app.brands(id),
    year INTEGER,
    slug_canonical TEXT,
    source_count SMALLINT NOT NULL,
    reliability_score SMALLINT NOT NULL CHECK (reliability_score BETWEEN 1 AND 5),
    source_portals TEXT[] NOT NULL DEFAULT '{}',
    source_urls_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    shape TEXT,
    balance TEXT,
    surface TEXT,
    level TEXT,
    feel TEXT,
    weight_raw TEXT,
    image_source_recommended TEXT,
    image_url TEXT,
    image_source_portal TEXT,
    overall_rating_avg NUMERIC(6,3),
    power_avg NUMERIC(6,3),
    control_avg NUMERIC(6,3),
    comfort_avg NUMERIC(6,3),
    spin_avg NUMERIC(6,3),
    forgiveness_avg NUMERIC(6,3),
    maneuverability_avg NUMERIC(6,3),
    low_speed_avg NUMERIC(6,3),
    rebound_avg NUMERIC(6,3),
    sweet_spot_avg NUMERIC(6,3),
    ball_output_avg NUMERIC(6,3),
    effect_avg NUMERIC(6,3),
    tolerance_avg NUMERIC(6,3),
    total_avg NUMERIC(6,3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.racket_sources (
    id BIGSERIAL PRIMARY KEY,
    racket_id BIGINT NOT NULL REFERENCES app.rackets(id) ON DELETE CASCADE,
    source_portal TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_name TEXT,
    is_present BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (racket_id, source_portal)
);

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_rackets_updated_at ON app.rackets;
CREATE TRIGGER set_rackets_updated_at
BEFORE UPDATE ON app.rackets
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_brands_name_trgm
ON app.brands
USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_rackets_brand_id
ON app.rackets(brand_id);

CREATE INDEX IF NOT EXISTS idx_rackets_year
ON app.rackets(year);

CREATE INDEX IF NOT EXISTS idx_rackets_brand_year
ON app.rackets(brand_id, year);

CREATE INDEX IF NOT EXISTS idx_rackets_reliability_score
ON app.rackets(reliability_score);

CREATE INDEX IF NOT EXISTS idx_rackets_source_count
ON app.rackets(source_count);

CREATE INDEX IF NOT EXISTS idx_rackets_slug_canonical
ON app.rackets(slug_canonical);

CREATE INDEX IF NOT EXISTS idx_rackets_lower_canonical_name
ON app.rackets (LOWER(canonical_name));

CREATE INDEX IF NOT EXISTS idx_rackets_canonical_name_trgm
ON app.rackets
USING gin (canonical_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_rackets_source_portals_gin
ON app.rackets
USING gin (source_portals);

CREATE INDEX IF NOT EXISTS idx_rackets_source_urls_json_gin
ON app.rackets
USING gin (source_urls_json);

CREATE INDEX IF NOT EXISTS idx_rackets_aliases_json_gin
ON app.rackets
USING gin (aliases_json);

CREATE INDEX IF NOT EXISTS idx_rackets_image_source_portal
ON app.rackets(image_source_portal);

CREATE INDEX IF NOT EXISTS idx_rackets_has_image
ON app.rackets(id)
WHERE image_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_racket_sources_portal
ON app.racket_sources(source_portal);

CREATE INDEX IF NOT EXISTS idx_racket_sources_racket_id
ON app.racket_sources(racket_id);

CREATE INDEX IF NOT EXISTS idx_racket_sources_name_trgm
ON app.racket_sources
USING gin (source_name gin_trgm_ops);

CREATE OR REPLACE VIEW app.rackets_enriched AS
SELECT
    r.id,
    r.unified_id,
    r.canonical_name,
    b.slug AS brand_slug,
    b.name AS brand_name,
    r.year,
    r.slug_canonical,
    r.source_count,
    r.reliability_score,
    r.source_portals,
    r.source_urls_json,
    r.aliases_json,
    r.shape,
    r.balance,
    r.surface,
    r.level,
    r.feel,
    r.weight_raw,
    r.image_source_recommended,
    r.image_url,
    r.image_source_portal,
    r.overall_rating_avg,
    r.power_avg,
    r.control_avg,
    r.comfort_avg,
    r.spin_avg,
    r.forgiveness_avg,
    r.maneuverability_avg,
    r.low_speed_avg,
    r.rebound_avg,
    r.sweet_spot_avg,
    r.ball_output_avg,
    r.effect_avg,
    r.tolerance_avg,
    r.total_avg,
    r.created_at,
    r.updated_at
FROM app.rackets r
JOIN app.brands b
  ON b.id = r.brand_id;

CREATE OR REPLACE FUNCTION app.search_rackets(
    p_query TEXT DEFAULT NULL,
    p_min_reliability SMALLINT DEFAULT NULL,
    p_brand_slug TEXT DEFAULT NULL,
    p_year INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    unified_id TEXT,
    canonical_name TEXT,
    brand_slug TEXT,
    brand_name TEXT,
    year INTEGER,
    source_count SMALLINT,
    reliability_score SMALLINT,
    image_url TEXT,
    overall_rating_avg NUMERIC(6,3),
    similarity_score REAL
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        re.unified_id,
        re.canonical_name,
        re.brand_slug,
        re.brand_name,
        re.year,
        re.source_count,
        re.reliability_score,
        re.image_url,
        re.overall_rating_avg,
        CASE
            WHEN COALESCE(NULLIF(TRIM(p_query), ''), '') = '' THEN 1::REAL
            ELSE GREATEST(
                similarity(re.canonical_name, p_query),
                similarity(re.brand_name || ' ' || re.canonical_name, p_query)
            )
        END AS similarity_score
    FROM app.rackets_enriched re
    WHERE (COALESCE(NULLIF(TRIM(p_query), ''), '') = ''
           OR re.canonical_name ILIKE '%' || p_query || '%'
           OR re.brand_name ILIKE '%' || p_query || '%'
           OR similarity(re.canonical_name, p_query) > 0.2
           OR similarity(re.brand_name || ' ' || re.canonical_name, p_query) > 0.2)
      AND (p_min_reliability IS NULL OR re.reliability_score >= p_min_reliability)
      AND (COALESCE(NULLIF(TRIM(p_brand_slug), ''), '') = '' OR re.brand_slug = LOWER(TRIM(p_brand_slug)))
      AND (p_year IS NULL OR re.year = p_year)
    ORDER BY
        similarity_score DESC,
        re.reliability_score DESC,
        re.source_count DESC,
        re.overall_rating_avg DESC NULLS LAST,
        re.canonical_name ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

CREATE OR REPLACE FUNCTION app.get_racket_detail(
    p_unified_id TEXT
)
RETURNS TABLE (
    unified_id TEXT,
    canonical_name TEXT,
    brand_slug TEXT,
    brand_name TEXT,
    year INTEGER,
    source_count SMALLINT,
    reliability_score SMALLINT,
    image_url TEXT,
    image_source_portal TEXT,
    shape TEXT,
    balance TEXT,
    surface TEXT,
    level TEXT,
    feel TEXT,
    weight_raw TEXT,
    overall_rating_avg NUMERIC(6,3),
    power_avg NUMERIC(6,3),
    control_avg NUMERIC(6,3),
    comfort_avg NUMERIC(6,3),
    spin_avg NUMERIC(6,3),
    forgiveness_avg NUMERIC(6,3),
    maneuverability_avg NUMERIC(6,3),
    low_speed_avg NUMERIC(6,3),
    rebound_avg NUMERIC(6,3),
    sweet_spot_avg NUMERIC(6,3),
    ball_output_avg NUMERIC(6,3),
    effect_avg NUMERIC(6,3),
    tolerance_avg NUMERIC(6,3),
    total_avg NUMERIC(6,3),
    source_rows JSONB
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        re.unified_id,
        re.canonical_name,
        re.brand_slug,
        re.brand_name,
        re.year,
        re.source_count,
        re.reliability_score,
        re.image_url,
        re.image_source_portal,
        re.shape,
        re.balance,
        re.surface,
        re.level,
        re.feel,
        re.weight_raw,
        re.overall_rating_avg,
        re.power_avg,
        re.control_avg,
        re.comfort_avg,
        re.spin_avg,
        re.forgiveness_avg,
        re.maneuverability_avg,
        re.low_speed_avg,
        re.rebound_avg,
        re.sweet_spot_avg,
        re.ball_output_avg,
        re.effect_avg,
        re.tolerance_avg,
        re.total_avg,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'source_portal', rs.source_portal,
                        'source_url', rs.source_url,
                        'source_name', rs.source_name,
                        'is_present', rs.is_present
                    )
                    ORDER BY rs.source_portal
                )
                FROM app.racket_sources rs
                WHERE rs.racket_id = re.id
            ),
            '[]'::jsonb
        ) AS source_rows
    FROM app.rackets_enriched re
    WHERE re.unified_id = p_unified_id;
$$;

CREATE OR REPLACE FUNCTION app.compare_rackets(
    p_unified_ids TEXT[]
)
RETURNS TABLE (
    unified_id TEXT,
    canonical_name TEXT,
    brand_slug TEXT,
    brand_name TEXT,
    year INTEGER,
    source_count SMALLINT,
    reliability_score SMALLINT,
    image_url TEXT,
    overall_rating_avg NUMERIC(6,3),
    power_avg NUMERIC(6,3),
    control_avg NUMERIC(6,3),
    comfort_avg NUMERIC(6,3),
    spin_avg NUMERIC(6,3),
    forgiveness_avg NUMERIC(6,3),
    maneuverability_avg NUMERIC(6,3),
    low_speed_avg NUMERIC(6,3),
    rebound_avg NUMERIC(6,3),
    sweet_spot_avg NUMERIC(6,3),
    ball_output_avg NUMERIC(6,3),
    effect_avg NUMERIC(6,3),
    tolerance_avg NUMERIC(6,3),
    total_avg NUMERIC(6,3)
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        re.unified_id,
        re.canonical_name,
        re.brand_slug,
        re.brand_name,
        re.year,
        re.source_count,
        re.reliability_score,
        re.image_url,
        re.overall_rating_avg,
        re.power_avg,
        re.control_avg,
        re.comfort_avg,
        re.spin_avg,
        re.forgiveness_avg,
        re.maneuverability_avg,
        re.low_speed_avg,
        re.rebound_avg,
        re.sweet_spot_avg,
        re.ball_output_avg,
        re.effect_avg,
        re.tolerance_avg,
        re.total_avg
    FROM app.rackets_enriched re
    WHERE re.unified_id = ANY(p_unified_ids)
    ORDER BY array_position(p_unified_ids, re.unified_id), re.canonical_name;
$$;
