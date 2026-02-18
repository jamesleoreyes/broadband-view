CREATE TABLE "broadband_availability" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "broadband_availability_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"block_geoid" varchar(15) NOT NULL,
	"h3_res8_id" varchar(20) NOT NULL,
	"provider_id" varchar(20) NOT NULL,
	"provider_name" text NOT NULL,
	"brand_name" text,
	"technology_code" integer NOT NULL,
	"max_download_speed" real NOT NULL,
	"max_upload_speed" real NOT NULL,
	"low_latency" boolean DEFAULT true NOT NULL,
	"business_residential_code" varchar(1) DEFAULT 'R' NOT NULL,
	"state_fips" varchar(2) NOT NULL,
	"data_vintage" varchar(10) NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_vintages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "data_vintages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"vintage_id" varchar(10) NOT NULL,
	"description" text,
	"fcc_as_of_date" varchar(10),
	"import_started_at" timestamp,
	"import_completed_at" timestamp,
	"record_count" bigint,
	"states_imported" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "data_vintages_vintage_id_unique" UNIQUE("vintage_id")
);
--> statement-breakpoint
CREATE TABLE "geocode_cache" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "geocode_cache_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"address_hash" varchar(64) NOT NULL,
	"original_address" text NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"block_geoid" varchar(15),
	"match_type" varchar(20),
	"cached_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "geocode_cache_address_hash_unique" UNIQUE("address_hash")
);
--> statement-breakpoint
CREATE INDEX "idx_broadband_h3" ON "broadband_availability" USING btree ("h3_res8_id");--> statement-breakpoint
CREATE INDEX "idx_broadband_geoid" ON "broadband_availability" USING btree ("block_geoid");--> statement-breakpoint
CREATE INDEX "idx_broadband_vintage" ON "broadband_availability" USING btree ("data_vintage");--> statement-breakpoint
--> statement-breakpoint
CREATE INDEX "idx_geocode_address" ON "geocode_cache" USING btree ("address_hash");