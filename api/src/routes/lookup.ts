import { Hono } from "hono";
import { z } from "zod";
import {
  getH3Index,
  getCensusBlockGeoid,
  geocodeAddress,
} from "../services/geolocation.js";
import { lookupProviders } from "../services/availability.js";
import { db } from "../db/connection.js";
import { dataVintages } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";
import type { LookupResponse, HealthResponse } from "@broadband-view/shared";

const app = new Hono();

// lat/lng are optional — if omitted, the address will be geocoded server-side
const lookupSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().optional(),
});

app.post("/api/lookup", async (c) => {
  const body = await c.req.json();
  const parsed = lookupSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<LookupResponse>(
      {
        success: false,
        data: { providers: [], h3_index: "", lookup_method: "h3" },
        error: "Invalid request body",
      },
      400,
    );
  }

  let { lat, lng, address } = parsed.data;

  // If no coordinates provided, geocode the address
  if ((lat == null || lng == null) && address) {
    const geo = await geocodeAddress(address);
    if (!geo) {
      return c.json<LookupResponse>({
        success: true,
        data: {
          providers: [],
          h3_index: "",
          lookup_method: "h3",
        },
        error: "Could not geocode address",
      });
    }
    lat = geo.lat;
    lng = geo.lng;

    // If the geocoder also returned a block GEOID, use it directly
    if (geo.blockGeoid) {
      const h3Index = getH3Index(lat, lng);
      let { providers, method } = await lookupProviders(
        h3Index,
        geo.blockGeoid,
      );

      const vintage = await db
        .select()
        .from(dataVintages)
        .where(eq(dataVintages.is_active, true))
        .orderBy(desc(dataVintages.created_at))
        .limit(1);

      return c.json<LookupResponse>({
        success: true,
        data: {
          providers,
          h3_index: h3Index,
          data_vintage: vintage[0]?.vintage_id,
          lookup_method: method,
        },
      });
    }
  }

  if (lat == null || lng == null) {
    return c.json<LookupResponse>(
      {
        success: false,
        data: { providers: [], h3_index: "", lookup_method: "h3" },
        error: "Either lat/lng or address is required",
      },
      400,
    );
  }

  const h3Index = getH3Index(lat, lng);

  // Try H3 first
  let { providers, method } = await lookupProviders(h3Index);

  // If no results from H3, try Census geocoder fallback
  if (providers.length === 0) {
    const blockGeoid = await getCensusBlockGeoid(lat, lng, address);
    if (blockGeoid) {
      const fallback = await lookupProviders(h3Index, blockGeoid);
      providers = fallback.providers;
      method = fallback.method;
    }
  }

  // Get active vintage
  const vintage = await db
    .select()
    .from(dataVintages)
    .where(eq(dataVintages.is_active, true))
    .orderBy(desc(dataVintages.created_at))
    .limit(1);

  return c.json<LookupResponse>({
    success: true,
    data: {
      providers,
      h3_index: h3Index,
      data_vintage: vintage[0]?.vintage_id,
      lookup_method: method,
    },
  });
});

app.get("/api/health", async (c) => {
  try {
    const vintage = await db
      .select()
      .from(dataVintages)
      .where(eq(dataVintages.is_active, true))
      .orderBy(desc(dataVintages.created_at))
      .limit(1);

    return c.json<HealthResponse>({
      status: "ok",
      data_vintage: vintage[0]?.vintage_id,
      last_import: vintage[0]?.import_completed_at?.toISOString(),
    });
  } catch {
    return c.json<HealthResponse>({ status: "error" }, 500);
  }
});

export default app;
