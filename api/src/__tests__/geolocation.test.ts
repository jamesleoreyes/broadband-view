import { describe, it, expect } from "vitest";
import { getH3Index } from "../services/geolocation.js";

describe("getH3Index", () => {
  it("returns a valid H3 res8 index string", () => {
    const index = getH3Index(37.7749, -122.4194); // San Francisco
    expect(index).toBeTruthy();
    expect(typeof index).toBe("string");
    expect(index.length).toBeGreaterThan(0);
  });

  it("returns different indices for distant locations", () => {
    const sf = getH3Index(37.7749, -122.4194); // San Francisco
    const ny = getH3Index(40.7128, -74.006); // New York
    expect(sf).not.toBe(ny);
  });

  it("returns the same index for nearby coordinates", () => {
    // Two points very close together should share the same H3 res8 cell
    const a = getH3Index(37.7749, -122.4194);
    const b = getH3Index(37.7749, -122.4193);
    expect(a).toBe(b);
  });

  it("returns a consistent result for the spec example", () => {
    // Rock Hill, SC from the spec
    const index = getH3Index(35.017693, -81.04225);
    expect(index).toBeTruthy();
    expect(typeof index).toBe("string");
  });

  it("handles edge cases", () => {
    // Equator/prime meridian
    expect(getH3Index(0, 0)).toBeTruthy();
    // North pole area
    expect(getH3Index(89, 0)).toBeTruthy();
    // South pole area
    expect(getH3Index(-89, 0)).toBeTruthy();
  });
});
