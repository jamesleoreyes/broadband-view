import { LRUCache } from "lru-cache";
import type { ISPResult } from "@broadband-view/shared";

const DEFAULT_MAX = parseInt(process.env.CACHE_MAX_SIZE || "10000", 10);
const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_MS || "86400000", 10); // 24 hours

// Key = h3_res8_id, Value = ISPResult array
export const lookupCache = new LRUCache<string, ISPResult[]>({
  max: DEFAULT_MAX,
  ttl: DEFAULT_TTL,
});
