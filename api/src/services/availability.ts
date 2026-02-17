import { pool } from "../db/connection.js";
import { lookupCache } from "../lib/cache.js";
import {
  TECH_META,
  getSpeedTier,
  formatSpeed,
  type ISPResult,
} from "@broadband-view/shared";

/**
 * Query by H3 res8 index against the materialized view.
 * Deduplicates per provider+technology, taking the best speeds.
 */
async function queryByH3(h3Index: string): Promise<ISPResult[]> {
  const result = await pool.query(
    `SELECT provider_name, technology_code,
            MAX(max_download_speed) AS max_download_speed,
            MAX(max_upload_speed) AS max_upload_speed,
            BOOL_OR(low_latency) AS low_latency
     FROM block_availability
     WHERE h3_res8_id = $1
     GROUP BY provider_name, technology_code
     ORDER BY max_download_speed DESC`,
    [h3Index],
  );
  return result.rows.map(enrichRow);
}

/**
 * Query by Census block GEOID against the materialized view.
 * Deduplicates per provider+technology, taking the best speeds.
 */
async function queryByGeoid(geoid: string): Promise<ISPResult[]> {
  const result = await pool.query(
    `SELECT provider_name, technology_code,
            MAX(max_download_speed) AS max_download_speed,
            MAX(max_upload_speed) AS max_upload_speed,
            BOOL_OR(low_latency) AS low_latency
     FROM block_availability
     WHERE block_geoid = $1
     GROUP BY provider_name, technology_code
     ORDER BY max_download_speed DESC`,
    [geoid],
  );
  return result.rows.map(enrichRow);
}

function enrichRow(row: {
  provider_name: string;
  technology_code: number;
  max_download_speed: number;
  max_upload_speed: number;
}): ISPResult {
  const techCode = row.technology_code;
  const meta = TECH_META[techCode] || TECH_META[0];
  return {
    provider_name: row.provider_name,
    technology_code: techCode,
    technology_label: meta.label,
    technology_color: meta.color,
    technology_bg: meta.bg,
    max_download_speed: row.max_download_speed,
    max_upload_speed: row.max_upload_speed,
    speed_tier: getSpeedTier(row.max_download_speed),
    download_formatted: formatSpeed(row.max_download_speed),
    upload_formatted: formatSpeed(row.max_upload_speed),
  };
}

/**
 * Full lookup: LRU cache → H3 DB query → Census GEOID fallback.
 */
export async function lookupProviders(
  h3Index: string,
  blockGeoid?: string | null,
): Promise<{ providers: ISPResult[]; method: "h3" | "census_geocoder" }> {
  // Check LRU cache
  const cached = lookupCache.get(h3Index);
  if (cached) {
    return { providers: cached, method: "h3" };
  }

  // Try H3 query
  let providers = await queryByH3(h3Index);
  if (providers.length > 0) {
    lookupCache.set(h3Index, providers);
    return { providers, method: "h3" };
  }

  // Fallback: Census GEOID
  if (blockGeoid) {
    providers = await queryByGeoid(blockGeoid);
    if (providers.length > 0) {
      lookupCache.set(h3Index, providers);
      return { providers, method: "census_geocoder" };
    }
  }

  return { providers: [], method: "h3" };
}
