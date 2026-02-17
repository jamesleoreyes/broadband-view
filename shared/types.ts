// --- Technology Codes ---
export const TECH_CODES = {
  DSL: 10,
  CABLE: 40,
  FIBER: 50,
  SATELLITE_GEO: 60,
  SATELLITE_NGSO: 61,
  FIXED_WIRELESS_UNLICENSED: 70,
  FIXED_WIRELESS_LICENSED: 71,
  FIXED_WIRELESS_BY_RULE: 72,
  OTHER: 0,
} as const;

export type TechCode = (typeof TECH_CODES)[keyof typeof TECH_CODES];

// --- Technology Display Metadata ---
export interface TechMeta {
  label: string;
  color: string;
  bg: string;
}

export const TECH_META: Record<number, TechMeta> = {
  [TECH_CODES.FIBER]: { label: "Fiber", color: "#22c55e", bg: "#f0fdf4" },
  [TECH_CODES.CABLE]: { label: "Cable", color: "#3b82f6", bg: "#eff6ff" },
  [TECH_CODES.FIXED_WIRELESS_UNLICENSED]: {
    label: "Fixed Wireless",
    color: "#f97316",
    bg: "#fff7ed",
  },
  [TECH_CODES.FIXED_WIRELESS_LICENSED]: {
    label: "Fixed Wireless",
    color: "#f97316",
    bg: "#fff7ed",
  },
  [TECH_CODES.FIXED_WIRELESS_BY_RULE]: {
    label: "Fixed Wireless",
    color: "#f97316",
    bg: "#fff7ed",
  },
  [TECH_CODES.DSL]: { label: "DSL", color: "#6b7280", bg: "#f9fafb" },
  [TECH_CODES.SATELLITE_GEO]: {
    label: "Satellite",
    color: "#a855f7",
    bg: "#faf5ff",
  },
  [TECH_CODES.SATELLITE_NGSO]: {
    label: "Satellite",
    color: "#a855f7",
    bg: "#faf5ff",
  },
  [TECH_CODES.OTHER]: { label: "Other", color: "#6b7280", bg: "#f9fafb" },
};

// --- Speed Tiers ---
export type SpeedTier = "Basic" | "Good" | "Fast" | "Very Fast" | "Gigabit+";

export function getSpeedTier(downloadMbps: number): SpeedTier {
  if (downloadMbps >= 1000) return "Gigabit+";
  if (downloadMbps >= 500) return "Very Fast";
  if (downloadMbps >= 100) return "Fast";
  if (downloadMbps >= 25) return "Good";
  return "Basic";
}

export function formatSpeed(mbps: number): string {
  if (mbps >= 1000) {
    const gbps = mbps / 1000;
    return `${gbps % 1 === 0 ? gbps.toFixed(0) : gbps.toFixed(1)} Gbps`;
  }
  return `${mbps} Mbps`;
}

// --- API Request/Response ---
export interface LookupRequest {
  lat: number;
  lng: number;
  address?: string;
}

export interface ISPResult {
  provider_name: string;
  technology_code: number;
  technology_label: string;
  technology_color: string;
  technology_bg: string;
  max_download_speed: number;
  max_upload_speed: number;
  speed_tier: SpeedTier;
  download_formatted: string;
  upload_formatted: string;
}

export interface LookupResponse {
  success: boolean;
  data: {
    providers: ISPResult[];
    h3_index: string;
    block_geoid?: string;
    data_vintage?: string;
    lookup_method: "h3" | "census_geocoder";
  };
  error?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  data_vintage?: string;
  last_import?: string;
  provider_count?: number;
}
