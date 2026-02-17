import "dotenv/config";
import { BDC_BASE_URL, getFccHeaders } from "./fcc-client.js";

interface AsOfDateEntry {
  data_type: string; // "availability" or "challenge"
  as_of_date: string;
}

/**
 * Check available data vintages from the FCC BDC API.
 * Filters for "availability" data_type only (fixed broadband filings).
 * Challenge data is monthly and not what we need.
 * Returns dates sorted newest-first, e.g. ["2025-06-30", "2024-12-31", ...].
 */
export async function checkAvailableVintages(): Promise<string[]> {
  const response = await fetch(`${BDC_BASE_URL}/listAsOfDates`, {
    headers: getFccHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to check vintages: ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: AsOfDateEntry[];
  };

  if (!Array.isArray(data.data)) {
    return [];
  }

  // Filter for availability only (not challenge data) and sort newest first
  return data.data
    .filter((d) => d.data_type === "availability")
    .map((d) => d.as_of_date)
    .sort()
    .reverse();
}

// Run directly
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-vintage.ts");

if (isMain) {
  checkAvailableVintages()
    .then((vintages) => {
      console.log("Available FCC BDC vintages:");
      for (const v of vintages) {
        console.log(`  - ${v}`);
      }
    })
    .catch((err) => {
      console.error("Failed to check vintages:", err);
      process.exit(1);
    });
}
