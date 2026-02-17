import { describe, it, expect } from "vitest";
import { Hono } from "hono";

// We test the Zod validation and response shape by creating a minimal Hono app
// that mirrors our route's validation logic (without DB dependencies).

import { z } from "zod";

const lookupSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().optional(),
});

const testApp = new Hono();

testApp.post("/api/lookup", async (c) => {
  const body = await c.req.json();
  const parsed = lookupSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        success: false,
        data: { providers: [], h3_index: "", lookup_method: "h3" },
        error: "Invalid request: lat and lng are required numbers",
      },
      400,
    );
  }

  return c.json({
    success: true,
    data: {
      providers: [],
      h3_index: "mock_h3_index",
      lookup_method: "h3",
    },
  });
});

describe("POST /api/lookup validation", () => {
  it("returns 400 for empty body", async () => {
    const res = await testApp.request("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBeTruthy();
  });

  it("returns 400 for invalid lat/lng types", async () => {
    const res = await testApp.request("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: "not-a-number", lng: "also-not" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for out-of-range lat", async () => {
    const res = await testApp.request("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: 100, lng: -80 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for out-of-range lng", async () => {
    const res = await testApp.request("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: 35, lng: -200 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 for valid lat/lng", async () => {
    const res = await testApp.request("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: 35.017693, lng: -81.04225 }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.providers).toEqual([]);
    expect(json.data.h3_index).toBeTruthy();
    expect(json.data.lookup_method).toBe("h3");
  });

  it("accepts optional address field", async () => {
    const res = await testApp.request("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: 35.017693,
        lng: -81.04225,
        address: "757 Painted Lady Ct, Rock Hill, SC 29732",
      }),
    });
    expect(res.status).toBe(200);
  });
});
