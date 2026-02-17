-- Materialized view: aggregated broadband availability per H3 cell
-- Collapses per-location rows into per-block provider+technology, keeping max speeds.
-- Only includes the currently active data vintage.

CREATE MATERIALIZED VIEW IF NOT EXISTS block_availability AS
SELECT
  h3_res8_id,
  block_geoid,
  provider_id,
  provider_name,
  brand_name,
  technology_code,
  MAX(max_download_speed) AS max_download_speed,
  MAX(max_upload_speed) AS max_upload_speed,
  BOOL_OR(low_latency) AS low_latency,
  data_vintage
FROM broadband_availability
WHERE business_residential_code IN ('R', 'X')
  AND data_vintage = (
    SELECT vintage_id FROM data_vintages
    WHERE is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  )
GROUP BY h3_res8_id, block_geoid, provider_id, provider_name, brand_name, technology_code, data_vintage;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_h3_provider
  ON block_availability (h3_res8_id, provider_id, technology_code);

CREATE INDEX IF NOT EXISTS idx_mv_h3
  ON block_availability (h3_res8_id);

CREATE INDEX IF NOT EXISTS idx_mv_geoid
  ON block_availability (block_geoid);
