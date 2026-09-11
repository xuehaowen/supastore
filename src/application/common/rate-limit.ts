import { LRUCache } from "lru-cache";
const windows = new LRUCache<string, { count: number; until: number }>({
  max: 10000,
});
export function allowRequest(key: string, limit = 5, windowMs = 60000) {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.until <= now) {
    windows.set(key, { count: 1, until: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}
