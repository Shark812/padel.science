BEGIN;

ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE app.rackets ADD COLUMN IF NOT EXISTS image_source_portal TEXT;

TRUNCATE TABLE app.racket_sources, app.rackets, app.brands RESTART IDENTITY CASCADE;

CREATE TEMP TABLE staging_unified (
    unified_id TEXT,
    canonical_name TEXT,
    brand TEXT,
    year TEXT,
    source_count TEXT,
    reliability_score TEXT,
    source_portals TEXT,
    source_urls_json TEXT,
    aliases_json TEXT,
    slug_canonical TEXT,
    shape TEXT,
    balance TEXT,
    surface TEXT,
    level TEXT,
    feel TEXT,
    weight_raw TEXT,
    image_source_recommended TEXT,
    image_url TEXT,
    image_source_portal TEXT,
    overall_rating_avg TEXT,
    power_avg TEXT,
    control_avg TEXT,
    comfort_avg TEXT,
    spin_avg TEXT,
    forgiveness_avg TEXT,
    maneuverability_avg TEXT,
    low_speed_avg TEXT,
    rebound_avg TEXT,
    sweet_spot_avg TEXT,
    ball_output_avg TEXT,
    effect_avg TEXT,
    tolerance_avg TEXT,
    total_avg TEXT,
    has_padelful TEXT,
    padelful_url TEXT,
    padelful_name TEXT,
    has_pala_hack TEXT,
    pala_hack_url TEXT,
    pala_hack_name TEXT,
    has_padelzoom TEXT,
    padelzoom_url TEXT,
    padelzoom_name TEXT,
    has_padelreference TEXT,
    padelreference_url TEXT,
    padelreference_name TEXT,
    has_extreme_tennis TEXT,
    extreme_tennis_url TEXT,
    extreme_tennis_name TEXT
);

COPY staging_unified
FROM '/workspace/data/unified-rackets/unified-rackets.csv'
WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

INSERT INTO app.brands (slug, name)
SELECT DISTINCT
    LOWER(TRIM(brand)) AS slug,
    TRIM(brand) AS name
FROM staging_unified
WHERE NULLIF(TRIM(brand), '') IS NOT NULL
ORDER BY 1;

INSERT INTO app.rackets (
    unified_id,
    canonical_name,
    brand_id,
    year,
    slug_canonical,
    source_count,
    reliability_score,
    source_portals,
    source_urls_json,
    aliases_json,
    shape,
    balance,
    surface,
    level,
    feel,
    weight_raw,
    image_source_recommended,
    image_url,
    image_source_portal,
    overall_rating_avg,
    power_avg,
    control_avg,
    comfort_avg,
    spin_avg,
    forgiveness_avg,
    maneuverability_avg,
    low_speed_avg,
    rebound_avg,
    sweet_spot_avg,
    ball_output_avg,
    effect_avg,
    tolerance_avg,
    total_avg,
    updated_at
)
SELECT
    s.unified_id,
    s.canonical_name,
    b.id,
    NULLIF(s.year, '')::INTEGER,
    NULLIF(s.slug_canonical, ''),
    NULLIF(s.source_count, '')::SMALLINT,
    NULLIF(s.reliability_score, '')::SMALLINT,
    CASE
        WHEN NULLIF(s.source_portals, '') IS NULL THEN ARRAY[]::TEXT[]
        ELSE string_to_array(s.source_portals, '|')
    END,
    COALESCE(NULLIF(s.source_urls_json, '')::JSONB, '{}'::JSONB),
    COALESCE(NULLIF(s.aliases_json, '')::JSONB, '[]'::JSONB),
    NULLIF(s.shape, ''),
    NULLIF(s.balance, ''),
    NULLIF(s.surface, ''),
    NULLIF(s.level, ''),
    NULLIF(s.feel, ''),
    NULLIF(s.weight_raw, ''),
    NULLIF(s.image_source_recommended, ''),
    NULLIF(s.image_url, ''),
    NULLIF(s.image_source_portal, ''),
    NULLIF(s.overall_rating_avg, '')::NUMERIC(6,3),
    NULLIF(s.power_avg, '')::NUMERIC(6,3),
    NULLIF(s.control_avg, '')::NUMERIC(6,3),
    NULLIF(s.comfort_avg, '')::NUMERIC(6,3),
    NULLIF(s.spin_avg, '')::NUMERIC(6,3),
    NULLIF(s.forgiveness_avg, '')::NUMERIC(6,3),
    NULLIF(s.maneuverability_avg, '')::NUMERIC(6,3),
    NULLIF(s.low_speed_avg, '')::NUMERIC(6,3),
    NULLIF(s.rebound_avg, '')::NUMERIC(6,3),
    NULLIF(s.sweet_spot_avg, '')::NUMERIC(6,3),
    NULLIF(s.ball_output_avg, '')::NUMERIC(6,3),
    NULLIF(s.effect_avg, '')::NUMERIC(6,3),
    NULLIF(s.tolerance_avg, '')::NUMERIC(6,3),
    NULLIF(s.total_avg, '')::NUMERIC(6,3),
    NOW()
FROM staging_unified s
JOIN app.brands b
  ON b.slug = LOWER(TRIM(s.brand));

INSERT INTO app.rackets (
    unified_id,
    canonical_name,
    brand_id,
    year,
    slug_canonical,
    source_count,
    reliability_score,
    source_portals,
    source_urls_json,
    aliases_json,
    shape,
    balance,
    surface,
    level,
    feel,
    weight_raw,
    image_source_recommended,
    image_url,
    image_source_portal,
    overall_rating_avg,
    power_avg,
    control_avg,
    comfort_avg,
    spin_avg,
    forgiveness_avg,
    maneuverability_avg,
    low_speed_avg,
    rebound_avg,
    sweet_spot_avg,
    ball_output_avg,
    effect_avg,
    tolerance_avg,
    total_avg,
    updated_at
)
SELECT
    s.unified_id,
    s.canonical_name,
    b.id,
    NULLIF(s.year, '')::INTEGER,
    NULLIF(s.slug_canonical, ''),
    NULLIF(s.source_count, '')::SMALLINT,
    NULLIF(s.reliability_score, '')::SMALLINT,
    CASE
        WHEN NULLIF(s.source_portals, '') IS NULL THEN ARRAY[]::TEXT[]
        ELSE string_to_array(s.source_portals, '|')
    END,
    COALESCE(NULLIF(s.source_urls_json, '')::JSONB, '{}'::JSONB),
    COALESCE(NULLIF(s.aliases_json, '')::JSONB, '[]'::JSONB),
    NULLIF(s.shape, ''),
    NULLIF(s.balance, ''),
    NULLIF(s.surface, ''),
    NULLIF(s.level, ''),
    NULLIF(s.feel, ''),
    NULLIF(s.weight_raw, ''),
    NULLIF(s.image_source_recommended, ''),
    NULLIF(s.image_url, ''),
    NULLIF(s.image_source_portal, ''),
    NULLIF(s.overall_rating_avg, '')::NUMERIC(6,3),
    NULLIF(s.power_avg, '')::NUMERIC(6,3),
    NULLIF(s.control_avg, '')::NUMERIC(6,3),
    NULLIF(s.comfort_avg, '')::NUMERIC(6,3),
    NULLIF(s.spin_avg, '')::NUMERIC(6,3),
    NULLIF(s.forgiveness_avg, '')::NUMERIC(6,3),
    NULLIF(s.maneuverability_avg, '')::NUMERIC(6,3),
    NULLIF(s.low_speed_avg, '')::NUMERIC(6,3),
    NULLIF(s.rebound_avg, '')::NUMERIC(6,3),
    NULLIF(s.sweet_spot_avg, '')::NUMERIC(6,3),
    NULLIF(s.ball_output_avg, '')::NUMERIC(6,3),
    NULLIF(s.effect_avg, '')::NUMERIC(6,3),
    NULLIF(s.tolerance_avg, '')::NUMERIC(6,3),
    NULLIF(s.total_avg, '')::NUMERIC(6,3),
    NOW()
FROM staging_unified s
JOIN app.brands b
  ON b.slug = LOWER(TRIM(s.brand))
LEFT JOIN app.rackets r
  ON r.unified_id = s.unified_id
WHERE r.id IS NULL;

INSERT INTO app.racket_sources (racket_id, source_portal, source_url, source_name, is_present)
SELECT r.id, src.source_portal, src.source_url, src.source_name, src.is_present
FROM staging_unified s
JOIN app.rackets r
  ON r.unified_id = s.unified_id
CROSS JOIN LATERAL (
    VALUES
        ('padelful', s.padelful_url, s.padelful_name, COALESCE(NULLIF(s.has_padelful, ''), '0') = '1'),
        ('pala-hack', s.pala_hack_url, s.pala_hack_name, COALESCE(NULLIF(s.has_pala_hack, ''), '0') = '1'),
        ('padelzoom', s.padelzoom_url, s.padelzoom_name, COALESCE(NULLIF(s.has_padelzoom, ''), '0') = '1'),
        ('padelreference', s.padelreference_url, s.padelreference_name, COALESCE(NULLIF(s.has_padelreference, ''), '0') = '1'),
        ('extreme-tennis', s.extreme_tennis_url, s.extreme_tennis_name, COALESCE(NULLIF(s.has_extreme_tennis, ''), '0') = '1')
) AS src(source_portal, source_url, source_name, is_present)
WHERE src.is_present
  AND NULLIF(src.source_url, '') IS NOT NULL;

DO $$
DECLARE
    staging_count INTEGER;
    loaded_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO staging_count FROM staging_unified;
    SELECT COUNT(*) INTO loaded_count FROM app.rackets;
    IF staging_count <> loaded_count THEN
        RAISE WARNING 'Loaded % rackets but staging has % rows', loaded_count, staging_count;
    END IF;
END $$;

COMMIT;
