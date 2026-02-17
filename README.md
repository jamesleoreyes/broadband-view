# BroadbandView

A Chrome extension that shows available internet providers and speeds when browsing Zillow real estate listings. Data is sourced from the FCC's Broadband Data Collection (BDC).

## How It Works

1. You visit a Zillow listing page
2. The extension reads the property's coordinates from the page
3. It queries a local API that maps coordinates to an [H3 hex](https://h3geo.org/) (resolution 8)
4. The API returns deduplicated ISP availability data for that area
5. A panel appears on the listing page showing providers, technologies, and speeds

## Architecture

```
extension/          Chrome Extension (Manifest V3)
  background/         Service worker — proxies API calls
  content-scripts/    Address detection + panel rendering
  lib/                API client (message-passing to SW)

api/                Backend API (Hono + Node.js)
  src/db/             Drizzle ORM schema, migrations, connection
  src/routes/         POST /api/lookup, GET /api/health
  src/services/       H3 geolocation, availability queries

pipeline/           FCC data import pipeline
  src/                Download, parse, and bulk-load BDC data

shared/             Shared types and constants
```

## Prerequisites

- Node.js >= 20
- pnpm
- PostgreSQL 15+
- FCC BDC API credentials ([register here](https://broadbandmap.fcc.gov/developer))

## Setup

```bash
# Install dependencies
pnpm install

# Copy env and fill in your values
cp .env.example .env

# Create the database
createdb broadband_view

# Run migrations
pnpm db:migrate
```

## Import FCC Data

```bash
# Downloads and imports data for the configured state (default: Rhode Island)
pnpm pipeline:run
```

The pipeline fetches the latest BDC "availability" vintage, downloads per-technology aggregate files for the target state, bulk-loads them via `COPY`, and creates a materialized view for fast lookups.

Edit `pipeline/src/run-pipeline.ts` to change the target state FIPS codes.

## Run the API

```bash
pnpm api:dev
# Listening on http://localhost:3001
```

## Load the Extension

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension/` directory
4. Navigate to any Zillow listing — the panel appears automatically

## Run Tests

```bash
pnpm test
```

## Data & Legal

### FCC Broadband Data Collection

This project uses data from the FCC's [Broadband Data Collection](https://broadbandmap.fcc.gov/) program. BDC data is publicly available and free to access with registered API credentials.

Users are responsible for complying with the [FCC BDC API Terms of Service](https://broadbandmap.fcc.gov/developer) and any applicable usage limits.

### Real Estate Listings

This extension adds supplementary broadband data alongside real estate listings to help homebuyers make more informed decisions. Internet availability is a common factor in choosing a home, and surfacing this information during the browsing process keeps users engaged with listings longer and helps them find the right property.

The extension only reads publicly visible information already rendered in the user's browser. It does not access listing platforms' servers, bypass authentication, or use any non-public APIs.

Not affiliated with, endorsed by, or sponsored by Zillow Group, Inc.

### H3

Uses Uber's [H3 geospatial indexing system](https://h3geo.org/) (Apache 2.0).

## License

[MIT](LICENSE)
