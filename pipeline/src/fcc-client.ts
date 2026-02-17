import "dotenv/config";

export const BDC_BASE_URL = "https://broadbandmap.fcc.gov/api/public/map";

/**
 * Build FCC BDC API request headers.
 * The FCC requires `username` and `hash_value` headers on all API calls.
 * The "hash_value" is the API token generated at broadbandmap.fcc.gov.
 */
export function getFccHeaders(): Record<string, string> {
  const username = process.env.FCC_USERNAME;
  const hashValue = process.env.FCC_HASH_VALUE;

  if (!username || !hashValue) {
    console.warn(
      "Warning: FCC_USERNAME and/or FCC_HASH_VALUE not set in .env.\n" +
        "Some FCC API endpoints may reject requests without authentication.\n" +
        "Get your credentials at: https://broadbandmap.fcc.gov → Manage API Access",
    );
  }

  const headers: Record<string, string> = {
    "User-Agent": "BroadbandView-Pipeline/1.0",
  };
  if (username) headers["username"] = username;
  if (hashValue) headers["hash_value"] = hashValue;

  return headers;
}
