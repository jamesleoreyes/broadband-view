import path from "node:path";
import pg from "pg";
import { checkAvailableVintages } from "./check-vintage.js";
import { downloadStateData } from "./download.js";
import { importStateData } from "./import.js";
import "dotenv/config";

// States to import (FIPS codes)
const MVP_STATES = ["37", "44", "45"]; // NC, RI, SC

async function runPipeline() {
  console.log("=== BroadbandView Data Pipeline ===\n");

  // Step 1: Check available vintages
  console.log("Step 1: Checking available data vintages...");
  const vintages = await checkAvailableVintages();
  if (vintages.length === 0) {
    console.error("No vintages available from FCC BDC API");
    process.exit(1);
  }
  const latestVintage = vintages[0];
  console.log(`  Latest vintage: ${latestVintage}`);
  console.log(`  All vintages: ${vintages.join(", ")}\n`);

  // Step 2: Download data
  console.log("Step 2: Downloading FCC data...");
  const zipFiles = await downloadStateData({
    vintage: latestVintage,
    stateFips: MVP_STATES,
  });

  if (zipFiles.length === 0) {
    console.error("No files downloaded. Check FCC credentials and API access.");
    process.exit(1);
  }
  console.log(`  Downloaded ${zipFiles.length} file(s)\n`);

  // Step 3: Import data
  console.log("Step 3: Importing data into PostgreSQL...");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let totalRows = 0;
  try {
    // Mark import as started
    await client.query(
      `INSERT INTO data_vintages (vintage_id, description, import_started_at, is_active)
       VALUES ($1, $2, NOW(), false)
       ON CONFLICT (vintage_id) DO UPDATE SET
         import_started_at = NOW()`,
      [latestVintage, `FCC BDC ${latestVintage}`],
    );

    for (const zipFile of zipFiles) {
      // Filenames are like bdc_44_Cable_fixed_broadband_J25_03feb2026.zip
      const stateMatch = path.basename(zipFile).match(/^bdc_(\d{2})_/);
      const stateFips = stateMatch ? stateMatch[1] : "00";
      console.log(`  Importing ${path.basename(zipFile)}...`);
      const count = await importStateData({
        zipFilePath: zipFile,
        vintage: latestVintage,
        stateFips,
      });
      totalRows += count;
    }

    // Step 4: Update data_vintages table
    console.log("\nStep 4: Updating vintages table...");

    // Deactivate all previous vintages
    await client.query(`UPDATE data_vintages SET is_active = false`);

    // Mark this vintage as active
    await client.query(
      `UPDATE data_vintages SET
         record_count = $2,
         states_imported = $3,
         is_active = true,
         import_completed_at = NOW()
       WHERE vintage_id = $1`,
      [latestVintage, totalRows, JSON.stringify(MVP_STATES)],
    );

    // Step 5: Refresh materialized view
    console.log("Step 5: Refreshing materialized view...");

    // Drop and recreate since CONCURRENTLY requires existing data in unique index
    await client.query(`DROP MATERIALIZED VIEW IF EXISTS block_availability`);

    // PostgreSQL does not allow parameterized queries ($1) in CREATE MATERIALIZED VIEW,
    // so we safely escape the vintage string (sourced from our own API call, not user input).
    const safeVintage = latestVintage.replace(/'/g, "''");
    await client.query(`
      CREATE MATERIALIZED VIEW block_availability AS
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
        AND data_vintage = '${safeVintage}'
      GROUP BY h3_res8_id, block_geoid, provider_id, provider_name,
               brand_name, technology_code, data_vintage
    `);

    // Non-unique: multiple census blocks share the same H3 hex
    await client.query(`
      CREATE INDEX idx_mv_h3_provider
        ON block_availability (h3_res8_id, provider_id, technology_code)
    `);
    await client.query(`
      CREATE INDEX idx_mv_h3 ON block_availability (h3_res8_id)
    `);
    await client.query(`
      CREATE INDEX idx_mv_geoid ON block_availability (block_geoid)
    `);
  } finally {
    await client.end();
  }

  console.log(`\n=== Pipeline Complete ===`);
  console.log(`Total rows imported: ${totalRows}`);
  console.log(`Vintage: ${latestVintage}`);
  console.log(`States: ${MVP_STATES.join(", ")}`);
}

runPipeline().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
