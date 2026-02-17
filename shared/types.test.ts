import { describe, it, expect } from "vitest";
import { getSpeedTier, formatSpeed, TECH_CODES, TECH_META } from "./types.js";

describe("getSpeedTier", () => {
  it("returns Basic for speeds below 25 Mbps", () => {
    expect(getSpeedTier(0)).toBe("Basic");
    expect(getSpeedTier(10)).toBe("Basic");
    expect(getSpeedTier(24)).toBe("Basic");
  });

  it("returns Good for 25-99 Mbps", () => {
    expect(getSpeedTier(25)).toBe("Good");
    expect(getSpeedTier(50)).toBe("Good");
    expect(getSpeedTier(99)).toBe("Good");
  });

  it("returns Fast for 100-499 Mbps", () => {
    expect(getSpeedTier(100)).toBe("Fast");
    expect(getSpeedTier(300)).toBe("Fast");
    expect(getSpeedTier(499)).toBe("Fast");
  });

  it("returns Very Fast for 500-999 Mbps", () => {
    expect(getSpeedTier(500)).toBe("Very Fast");
    expect(getSpeedTier(750)).toBe("Very Fast");
    expect(getSpeedTier(999)).toBe("Very Fast");
  });

  it("returns Gigabit+ for 1000+ Mbps", () => {
    expect(getSpeedTier(1000)).toBe("Gigabit+");
    expect(getSpeedTier(2000)).toBe("Gigabit+");
    expect(getSpeedTier(5000)).toBe("Gigabit+");
  });
});

describe("formatSpeed", () => {
  it("formats sub-gigabit speeds as Mbps", () => {
    expect(formatSpeed(25)).toBe("25 Mbps");
    expect(formatSpeed(100)).toBe("100 Mbps");
    expect(formatSpeed(500)).toBe("500 Mbps");
    expect(formatSpeed(999)).toBe("999 Mbps");
  });

  it("formats 1000 Mbps as 1 Gbps", () => {
    expect(formatSpeed(1000)).toBe("1 Gbps");
  });

  it("formats 2000 Mbps as 2 Gbps", () => {
    expect(formatSpeed(2000)).toBe("2 Gbps");
  });

  it("formats non-round gigabit speeds with one decimal", () => {
    expect(formatSpeed(1500)).toBe("1.5 Gbps");
    expect(formatSpeed(2500)).toBe("2.5 Gbps");
  });

  it("formats 5000 Mbps as 5 Gbps", () => {
    expect(formatSpeed(5000)).toBe("5 Gbps");
  });
});

describe("TECH_CODES", () => {
  it("has all expected technology codes", () => {
    expect(TECH_CODES.DSL).toBe(10);
    expect(TECH_CODES.CABLE).toBe(40);
    expect(TECH_CODES.FIBER).toBe(50);
    expect(TECH_CODES.SATELLITE_GEO).toBe(60);
    expect(TECH_CODES.SATELLITE_NGSO).toBe(61);
    expect(TECH_CODES.FIXED_WIRELESS_UNLICENSED).toBe(70);
    expect(TECH_CODES.FIXED_WIRELESS_LICENSED).toBe(71);
    expect(TECH_CODES.FIXED_WIRELESS_BY_RULE).toBe(72);
    expect(TECH_CODES.OTHER).toBe(0);
  });
});

describe("TECH_META", () => {
  it("has metadata for every tech code", () => {
    for (const code of Object.values(TECH_CODES)) {
      expect(TECH_META[code]).toBeDefined();
      expect(TECH_META[code].label).toBeTruthy();
      expect(TECH_META[code].color).toBeTruthy();
      expect(TECH_META[code].bg).toBeTruthy();
    }
  });

  it("maps Fiber to green", () => {
    expect(TECH_META[50].label).toBe("Fiber");
    expect(TECH_META[50].color).toBe("#22c55e");
  });

  it("maps Cable to blue", () => {
    expect(TECH_META[40].label).toBe("Cable");
    expect(TECH_META[40].color).toBe("#3b82f6");
  });
});
