import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  index,
  boolean,
  varchar,
  bigint,
} from "drizzle-orm/pg-core";

// Main broadband availability table (from FCC BDC CSV imports)
export const broadbandAvailability = pgTable(
  "broadband_availability",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    // Census FIPS block code (15-char), e.g., "450910609101007"
    block_geoid: varchar({ length: 15 }).notNull(),
    // H3 resolution-8 hex index (from FCC CSV)
    h3_res8_id: varchar({ length: 20 }).notNull(),
    // Provider info
    provider_id: varchar({ length: 20 }).notNull(),
    provider_name: text().notNull(),
    brand_name: text(),
    // Technology code (10=DSL, 40=Cable, 50=Fiber, 60/61=Satellite, 70/71/72=FW, 0=Other)
    technology_code: integer().notNull(),
    // Speeds in Mbps
    max_download_speed: real().notNull(),
    max_upload_speed: real().notNull(),
    // Low latency flag
    low_latency: boolean().notNull().default(true),
    // Business/Residential code (B/R/X)
    business_residential_code: varchar({ length: 1 }).notNull().default("R"),
    // State FIPS code (for partitioned imports)
    state_fips: varchar({ length: 2 }).notNull(),
    // Data vintage identifier, e.g., "2024-06-30"
    data_vintage: varchar({ length: 10 }).notNull(),
    // Import tracking
    imported_at: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index("idx_broadband_h3").on(table.h3_res8_id),
    index("idx_broadband_geoid").on(table.block_geoid),
    index("idx_broadband_vintage").on(table.data_vintage),
  ],
);

// Tracks data import status
export const dataVintages = pgTable("data_vintages", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  vintage_id: varchar({ length: 10 }).unique().notNull(),
  description: text(),
  fcc_as_of_date: varchar({ length: 10 }),
  import_started_at: timestamp(),
  import_completed_at: timestamp(),
  record_count: bigint({ mode: "number" }),
  states_imported: text(), // JSON array of state FIPS codes
  is_active: boolean().default(false).notNull(),
  created_at: timestamp().defaultNow().notNull(),
});

// Cache for Census Bureau geocoder results
export const geocodeCache = pgTable(
  "geocode_cache",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    address_hash: varchar({ length: 64 }).unique().notNull(),
    original_address: text().notNull(),
    lat: real().notNull(),
    lng: real().notNull(),
    block_geoid: varchar({ length: 15 }),
    match_type: varchar({ length: 20 }),
    cached_at: timestamp().defaultNow().notNull(),
  },
  (table) => [index("idx_geocode_address").on(table.address_hash)],
);
