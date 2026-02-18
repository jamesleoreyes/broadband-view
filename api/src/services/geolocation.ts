import { latLngToCell } from "h3-js";
import { db } from "../db/connection.js";
import { geocodeCache } from "../db/schema.js";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

const H3_RESOLUTION = 8;
const CENSUS_GEOCODER_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/coordinates";
const CENSUS_ADDRESS_GEOCODER_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

export interface GeoResult {
  h3Index: string;
  blockGeoid?: string;
  method: "h3" | "census_geocoder";
}

/**
 * Convert lat/lng to H3 resolution-8 index.
 * Pure math computation, no network call (~1 microsecond).
 */
export function getH3Index(lat: number, lng: number): string {
  return latLngToCell(lat, lng, H3_RESOLUTION);
}

/**
 * Call Census Bureau Geocoder API to get Census block GEOID.
 * Used as fallback when H3 lookup returns no results.
 */
export async function getCensusBlockGeoid(
  lat: number,
  lng: number,
  address?: string,
): Promise<string | null> {
  // Check DB cache first
  if (address) {
    const hash = crypto
      .createHash("sha256")
      .update(address.toLowerCase().trim())
      .digest("hex");
    const cached = await db
      .select()
      .from(geocodeCache)
      .where(eq(geocodeCache.address_hash, hash))
      .limit(1);
    if (cached.length > 0 && cached[0].block_geoid) {
      return cached[0].block_geoid;
    }
  }

  // Call Census Bureau Geocoder API
  const params = new URLSearchParams({
    x: lng.toString(),
    y: lat.toString(),
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    format: "json",
  });

  try {
    const response = await fetch(`${CENSUS_GEOCODER_URL}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      result?: {
        geographies?: {
          "2020 Census Blocks"?: Array<{ GEOID: string }>;
        };
      };
    };

    const blocks = data?.result?.geographies?.["2020 Census Blocks"];
    if (!blocks || blocks.length === 0) return null;

    const geoid = blocks[0].GEOID;

    // Cache the result
    if (address && geoid) {
      const hash = crypto
        .createHash("sha256")
        .update(address.toLowerCase().trim())
        .digest("hex");
      await db
        .insert(geocodeCache)
        .values({
          address_hash: hash,
          original_address: address,
          lat,
          lng,
          block_geoid: geoid,
          match_type: "coordinates",
        })
        .onConflictDoNothing();
    }

    return geoid;
  } catch {
    return null;
  }
}

/**
 * Geocode a street address to lat/lng + Census block GEOID using
 * the Census Bureau's one-line address geocoder.
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number; blockGeoid: string | null } | null> {
  // Check DB cache first
  const hash = crypto
    .createHash("sha256")
    .update(address.toLowerCase().trim())
    .digest("hex");
  const cached = await db
    .select()
    .from(geocodeCache)
    .where(eq(geocodeCache.address_hash, hash))
    .limit(1);
  if (cached.length > 0 && cached[0].lat && cached[0].lng) {
    return {
      lat: cached[0].lat,
      lng: cached[0].lng,
      blockGeoid: cached[0].block_geoid,
    };
  }

  const params = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    format: "json",
  });

  try {
    const response = await fetch(
      `${CENSUS_ADDRESS_GEOCODER_URL}?${params}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      result?: {
        addressMatches?: Array<{
          coordinates: { x: number; y: number };
          geographies?: {
            "2020 Census Blocks"?: Array<{ GEOID: string }>;
          };
        }>;
      };
    };

    const matches = data?.result?.addressMatches;
    if (!matches || matches.length === 0) return null;

    const match = matches[0];
    const lat = match.coordinates.y;
    const lng = match.coordinates.x;
    const blocks = match.geographies?.["2020 Census Blocks"];
    const blockGeoid = blocks?.[0]?.GEOID || null;

    // Cache the result
    await db
      .insert(geocodeCache)
      .values({
        address_hash: hash,
        original_address: address,
        lat,
        lng,
        block_geoid: blockGeoid,
        match_type: "address",
      })
      .onConflictDoNothing();

    return { lat, lng, blockGeoid };
  } catch {
    return null;
  }
}
