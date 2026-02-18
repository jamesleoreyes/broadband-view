import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import "dotenv/config";
import { BDC_BASE_URL, getFccHeaders } from "./fcc-client.js";

const DOWNLOAD_DIR = path.resolve(
  import.meta.dirname,
  "../../pipeline/downloads",
);
const RATE_LIMIT_DELAY_MS = 6500; // ~10 req/min with safety margin

export interface DownloadOptions {
  vintage: string; // e.g., "2025-06-30"
  stateFips: string[]; // e.g., ["44"] for Rhode Island
}

interface FccFileEntry {
  file_id: number;
  file_name: string;
  category: string;
  subcategory: string;
  technology_type: string;
  technology_code: string;
  state_fips: string;
  state_name: string;
  provider_id: string;
  provider_name: string;
  record_count: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cache the full file listing to avoid re-fetching for each state
let cachedFileList: FccFileEntry[] | null = null;
let cachedVintage: string | null = null;

/**
 * Fetch the complete file listing for a vintage.
 * The FCC API ignores state_fips as a query param and returns ALL files,
 * so we fetch once and filter client-side.
 */
async function fetchFileList(vintage: string): Promise<FccFileEntry[]> {
  if (cachedFileList && cachedVintage === vintage) {
    return cachedFileList;
  }

  console.log(`  Fetching file listing from FCC API...`);
  const headers = getFccHeaders();
  const response = await fetch(
    `${BDC_BASE_URL}/downloads/listAvailabilityData/${vintage}`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to list files: ${response.status}`);
  }

  const data = (await response.json()) as { data?: FccFileEntry[] };
  cachedFileList = data.data || [];
  cachedVintage = vintage;
  console.log(`  Total files in FCC catalog: ${cachedFileList.length}`);
  return cachedFileList;
}

// The per-technology aggregate file names contain these keywords
// instead of a numeric provider_id. These files contain ALL providers
// for that technology in that state, so they're everything we need.
const TECH_FILE_KEYWORDS = [
  "Copper",
  "Cable",
  "FibertothePremises",
  "GSOSatellite",
  "NGSOSatellite",
  "UnlicensedFixedWireless",
  "LicensedFixedWireless",
  "LicensedByRuleFixedWireless",
];

/**
 * Filter the file listing for per-technology aggregate fixed broadband files.
 * These contain all providers for a given technology in a state.
 * We skip per-provider files to avoid duplicates.
 */
function filterFixedBroadbandFiles(
  files: FccFileEntry[],
  stateFips: string,
): FccFileEntry[] {
  return files.filter((f) => {
    // Must be for our target state
    if (f.state_fips !== stateFips) return false;
    // Must be fixed broadband (not mobile)
    if (!f.file_name.includes("fixed_broadband")) return false;
    // Skip summary/geography files
    if (f.file_name.includes("summary")) return false;
    // Only keep per-technology aggregate files (e.g., bdc_44_Cable_fixed_broadband_...)
    // These have a technology keyword instead of a numeric provider_id
    const match = f.file_name.match(/^bdc_\d{2}_([^_]+)_fixed_broadband/);
    if (!match) return false;
    const identifier = match[1];
    return TECH_FILE_KEYWORDS.includes(identifier);
  });
}

const MAX_RETRIES = 3;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per file

/**
 * Download a single file by file_id from the FCC BDC.
 * Retries up to MAX_RETRIES times with exponential backoff on failure.
 */
async function downloadFile(
  fileId: number,
  outputPath: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers = getFccHeaders();
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        DOWNLOAD_TIMEOUT_MS,
      );

      const response = await fetch(
        `${BDC_BASE_URL}/downloads/downloadFile/availability/${fileId}`,
        { headers, signal: controller.signal },
      );

      if (!response.ok || !response.body) {
        clearTimeout(timeout);
        console.error(
          `  Attempt ${attempt}/${MAX_RETRIES}: HTTP ${response.status}`,
        );
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 5000; // 10s, 20s, 40s
          console.log(`  Retrying in ${delay / 1000}s...`);
          await sleep(delay);
          continue;
        }
        return false;
      }

      // Remove any partial file from a previous failed attempt
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }

      const fileStream = fs.createWriteStream(outputPath);
      await pipeline(Readable.fromWeb(response.body as never), fileStream);
      clearTimeout(timeout);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `  Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`,
      );

      // Clean up partial download
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }

      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 5000;
        console.log(`  Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }
  return false;
}

/**
 * Download state-level Fixed Broadband data for the given vintage.
 */
export async function downloadStateData(
  options: DownloadOptions,
): Promise<string[]> {
  const { vintage, stateFips } = options;
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  // Fetch full catalog once
  const allFiles = await fetchFileList(vintage);

  const downloadedFiles: string[] = [];

  for (const state of stateFips) {
    const stateFiles = filterFixedBroadbandFiles(allFiles, state);
    console.log(
      `  State ${state}: ${stateFiles.length} fixed broadband files found`,
    );

    if (stateFiles.length === 0) {
      console.warn(`  No fixed broadband files for state ${state}`);
      continue;
    }

    // Log what we're about to download
    for (const f of stateFiles) {
      console.log(`    - ${f.file_name} (${f.record_count} records)`);
    }

    for (const file of stateFiles) {
      const outputPath = path.join(
        DOWNLOAD_DIR,
        `${file.file_name}.zip`,
      );

      // Skip if already downloaded and file looks valid
      if (fs.existsSync(outputPath)) {
        const existingSize = fs.statSync(outputPath).size;
        const expectedRecords = parseInt(file.record_count, 10) || 0;
        // A valid zip with data should be at least 1KB, and files with many
        // records should be proportionally larger (~10 bytes/record compressed
        // is a very conservative floor)
        const minExpectedSize = Math.max(1024, expectedRecords * 2);
        if (existingSize >= minExpectedSize) {
          console.log(`  Already exists: ${file.file_name}`);
          downloadedFiles.push(outputPath);
          continue;
        }
        console.log(
          `  Existing file too small (${(existingSize / 1024).toFixed(1)} KB for ${expectedRecords} records), re-downloading...`,
        );
        fs.unlinkSync(outputPath);
      }

      console.log(`  Downloading ${file.file_name}...`);
      const success = await downloadFile(file.file_id, outputPath);

      if (success) {
        const size = fs.statSync(outputPath).size;
        console.log(
          `  Saved: ${file.file_name} (${(size / 1024 / 1024).toFixed(1)} MB)`,
        );
        downloadedFiles.push(outputPath);
      }

      // Rate limiting between downloads
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  return downloadedFiles;
}

// Run directly
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("download.ts");

if (isMain) {
  const vintage = process.argv[2] || "2025-06-30";
  const states = process.argv[3]?.split(",") || ["44"]; // Rhode Island

  downloadStateData({ vintage, stateFips: states })
    .then((files) => {
      console.log(`\nDownloaded ${files.length} files:`);
      for (const f of files) console.log(`  ${f}`);
    })
    .catch((err) => {
      console.error("Download failed:", err);
      process.exit(1);
    });
}
