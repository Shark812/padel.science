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

CREATE INDEX IF NOT EXISTS idx_rackets_brand_id ON app.rackets(brand_id);
CREATE INDEX IF NOT EXISTS idx_rackets_year ON app.rackets(year);
CREATE INDEX IF NOT EXISTS idx_rackets_reliability_score ON app.rackets(reliability_score);
CREATE INDEX IF NOT EXISTS idx_rackets_source_count ON app.rackets(source_count);
CREATE INDEX IF NOT EXISTS idx_racket_sources_portal ON app.racket_sources(source_portal);

