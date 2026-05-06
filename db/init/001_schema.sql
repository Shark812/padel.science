CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.brands (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS app.rackets (
    id BIGSERIAL PRIMARY KEY,
    unified_id TEXT NOT NULL UNIQUE,
    canonical_name TEXT NOT NULL,
    brand_id BIGINT NOT NULL REFERENCES app.brands(id),
    year INTEGER,
    slug_canonical TEXT,
    source_count SMALLINT NOT NULL,
    reliability_score SMALLINT NOT NULL CHECK (reliability_score BETWEEN 1 AND 5),
    match_confidence NUMERIC(5,3),
    needs_review BOOLEAN NOT NULL DEFAULT FALSE,
    review_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_portals TEXT[] NOT NULL DEFAULT '{}',
    source_urls_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    shape TEXT,
    balance TEXT,
    surface TEXT,
    level TEXT,
    feel TEXT,
    weight_raw TEXT,
    core_material TEXT,
    face_material TEXT,
    frame_material TEXT,
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

ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS shape TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS balance TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS surface TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS level TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS feel TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS weight_raw TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS core_material TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS face_material TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS frame_material TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,3);
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS review_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS image_source_recommended TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS image_source_portal TEXT;

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

DROP TRIGGER IF EXISTS set_brand_official_domains_updated_at ON app.brand_official_domains;
CREATE TRIGGER set_brand_official_domains_updated_at
BEFORE UPDATE ON app.brand_official_domains
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS set_racket_reddit_threads_updated_at ON app.racket_reddit_threads;
CREATE TRIGGER set_racket_reddit_threads_updated_at
BEFORE UPDATE ON app.racket_reddit_threads
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_brands_name_trgm
ON app.brands
USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_brand_official_domains_domain
ON app.brand_official_domains(official_domain);

CREATE INDEX IF NOT EXISTS idx_brand_official_domains_status
ON app.brand_official_domains(resolution_status);

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

CREATE INDEX IF NOT EXISTS idx_rackets_match_confidence
ON app.rackets(match_confidence);

CREATE INDEX IF NOT EXISTS idx_rackets_needs_review
ON app.rackets(needs_review)
WHERE needs_review = TRUE;

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

CREATE INDEX IF NOT EXISTS idx_racket_reddit_threads_racket_id
ON app.racket_reddit_threads(racket_id);

CREATE INDEX IF NOT EXISTS idx_racket_reddit_threads_subreddit
ON app.racket_reddit_threads(subreddit);

CREATE INDEX IF NOT EXISTS idx_racket_reddit_threads_created_at
ON app.racket_reddit_threads(thread_created_at DESC);

DROP FUNCTION IF EXISTS app.compare_rackets(TEXT[]);
DROP FUNCTION IF EXISTS app.search_rackets(TEXT, SMALLINT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS app.get_racket_detail(TEXT);
DROP VIEW IF EXISTS app.rackets_enriched;

CREATE VIEW app.rackets_enriched AS
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
    r.match_confidence,
    r.needs_review,
    r.review_reasons_json,
    r.source_portals,
    r.source_urls_json,
    r.aliases_json,
    r.shape,
    r.balance,
    r.surface,
    r.level,
    r.feel,
    r.weight_raw,
    r.core_material,
    r.face_material,
    r.frame_material,
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

CREATE FUNCTION app.search_rackets(
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
    match_confidence NUMERIC(5,3),
    needs_review BOOLEAN,
    review_reasons_json JSONB,
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
        re.match_confidence,
        re.needs_review,
        re.review_reasons_json,
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

CREATE FUNCTION app.get_racket_detail(
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
    match_confidence NUMERIC(5,3),
    needs_review BOOLEAN,
    review_reasons_json JSONB,
    image_url TEXT,
    image_source_portal TEXT,
    shape TEXT,
    balance TEXT,
    surface TEXT,
    level TEXT,
    feel TEXT,
    weight_raw TEXT,
    core_material TEXT,
    face_material TEXT,
    frame_material TEXT,
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
        re.match_confidence,
        re.needs_review,
        re.review_reasons_json,
        re.image_url,
        re.image_source_portal,
        re.shape,
        re.balance,
        re.surface,
        re.level,
        re.feel,
        re.weight_raw,
        re.core_material,
        re.face_material,
        re.frame_material,
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

CREATE FUNCTION app.compare_rackets(
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
    match_confidence NUMERIC(5,3),
    needs_review BOOLEAN,
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
        re.match_confidence,
        re.needs_review,
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
