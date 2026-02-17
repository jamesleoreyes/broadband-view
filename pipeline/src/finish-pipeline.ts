import pg from "pg";
import "dotenv/config";

/**
 * Finish a partially-completed pipeline run.
 * Runs steps 4-5 only: update data_vintages table + create materialized view.
 * Use this when data is already imported but the pipeline failed on later steps.
 */
async function finishPipeline() {
  const vintage = process.argv[2];
  const states = process.argv[3]?.split(",") || ["44"];

  if (!vintage) {
    console.error("Usage: tsx finish-pipeline.ts <vintage> [state-fips-csv]");
    console.error("Example: tsx finish-pipeline.ts 2025-06-30 44");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // Count rows already in the DB for this vintage
    const countResult = await client.query(
      `SELECT COUNT(*) AS cnt FROM broadband_availability WHERE data_vintage = $1`,
      [vintage],
    );
    const totalRows = parseInt(countResult.rows[0].cnt, 10);
    console.log(`Found ${totalRows} rows for vintage ${vintage}`);

    if (totalRows === 0) {
      console.error("No rows found — run the full pipeline first.");
      process.exit(1);
    }

    // Step 4: Update data_vintages table
    console.log("Step 4: Updating vintages table...");
    await client.query(`UPDATE data_vintages SET is_active = false`);
    await client.query(
      `INSERT INTO data_vintages (vintage_id, description, import_started_at, import_completed_at, record_count, states_imported, is_active)
       VALUES ($1, $2, NOW(), NOW(), $3, $4, true)
       ON CONFLICT (vintage_id) DO UPDATE SET
         record_count = $3,
         states_imported = $4,
         is_active = true,
         import_completed_at = NOW()`,
      [vintage, `FCC BDC ${vintage}`, totalRows, JSON.stringify(states)],
    );

    // Step 5: Create materialized view
    console.log("Step 5: Creating materialized view...");
    await client.query(`DROP MATERIALIZED VIEW IF EXISTS block_availability`);

    const safeVintage = vintage.replace(/'/g, "''");
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

    console.log("\n=== Pipeline Finish Complete ===");
    console.log(`Total rows: ${totalRows}`);
    console.log(`Vintage: ${vintage}`);
    console.log(`States: ${states.join(", ")}`);
  } finally {
    await client.end();
  }
}

finishPipeline().catch((err) => {
  console.error("Finish pipeline failed:", err);
  process.exit(1);
});
