import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { parse as csvParse } from "csv-parse";
import unzipper from "unzipper";
import "dotenv/config";

const TMP_DIR = path.resolve(import.meta.dirname, "../../pipeline/tmp");

export interface ImportOptions {
  zipFilePath: string;
  vintage: string;
  stateFips: string;
}

/**
 * Extract CSV from ZIP, parse it, and bulk-load into PostgreSQL via COPY.
 */
export async function importStateData(options: ImportOptions): Promise<number> {
  const { zipFilePath, vintage, stateFips } = options;
  fs.mkdirSync(TMP_DIR, { recursive: true });

  // Step 1: Extract CSV from ZIP
  console.log(`Extracting ${path.basename(zipFilePath)}...`);
  const directory = await unzipper.Open.file(zipFilePath);
  const csvFile = directory.files.find((f) => f.path.endsWith(".csv"));
  if (!csvFile) throw new Error(`No CSV file found in ${zipFilePath}`);

  const csvPath = path.join(TMP_DIR, `state_${stateFips}.csv`);
  await pipeline(csvFile.stream(), fs.createWriteStream(csvPath));

  // Step 2: Connect to PG and prepare COPY stream
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let rowCount = 0;

  try {
    const copyStream = client.query(
      copyFrom(
        `COPY broadband_availability
         (block_geoid, h3_res8_id, provider_id, provider_name, brand_name,
          technology_code, max_download_speed, max_upload_speed,
          low_latency, business_residential_code,
          state_fips, data_vintage)
         FROM STDIN WITH (FORMAT csv, HEADER false)`,
      ),
    );

    // Step 3: Parse CSV and transform rows
    const parser = fs.createReadStream(csvPath).pipe(
      csvParse({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
      }),
    );

    const transformer = new Transform({
      objectMode: true,
      transform(row, _encoding, callback) {
        try {
          // FCC CSV columns (header names vary slightly by vintage):
          // frn, provider_id, brand_name, location_id, technology,
          // max_advertised_download_speed, max_advertised_upload_speed,
          // low_latency, business_residential_code, state_usps,
          // block_geoid, h3_res8_id
          const blockGeoid = (row.block_geoid || "").trim();
          const h3Res8Id = (row.h3_res8_id || "").trim();
          const providerId = (row.provider_id || row.frn || "").trim();
          const providerName = (
            row.brand_name ||
            row.doing_business_as ||
            ""
          ).trim();
          const brandName = (row.brand_name || "").trim();
          const techCode = parseInt(row.technology || "0", 10);
          const downloadSpeed = parseFloat(
            row.max_advertised_download_speed || "0",
          );
          const uploadSpeed = parseFloat(
            row.max_advertised_upload_speed || "0",
          );
          const lowLatency = row.low_latency === "1" || row.low_latency === "true";
          const bizResCode = (
            row.business_residential_code || "R"
          ).trim();

          // Skip rows missing critical fields
          if (!blockGeoid && !h3Res8Id) {
            callback();
            return;
          }

          // Escape CSV fields (double any quotes)
          const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;

          const csvLine = [
            escape(blockGeoid),
            escape(h3Res8Id),
            escape(providerId),
            escape(providerName),
            escape(brandName),
            techCode,
            downloadSpeed,
            uploadSpeed,
            lowLatency,
            escape(bizResCode),
            escape(stateFips),
            escape(vintage),
          ].join(",");

          rowCount++;
          if (rowCount % 100000 === 0) {
            process.stdout.write(`  Processed ${rowCount} rows...\r`);
          }

          callback(null, csvLine + "\n");
        } catch (err) {
          callback(err as Error);
        }
      },
    });

    // Step 4: Pipe CSV parse → transform → COPY stream
    await pipeline(parser, transformer, copyStream);

    console.log(`  Imported ${rowCount} rows for state ${stateFips}`);
  } finally {
    await client.end();
    // Cleanup temp CSV
    try {
      fs.unlinkSync(csvPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  return rowCount;
}

// Run directly
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("import.ts");

if (isMain) {
  const zipFile = process.argv[2];
  const vintage = process.argv[3] || "2024-06-30";
  const stateFips = process.argv[4] || "44";

  if (!zipFile) {
    console.error("Usage: tsx import.ts <zip-file> [vintage] [state-fips]");
    process.exit(1);
  }

  importStateData({ zipFilePath: zipFile, vintage, stateFips })
    .then((count) => console.log(`\nDone. Total rows: ${count}`))
    .catch((err) => {
      console.error("Import failed:", err);
      process.exit(1);
    });
}
