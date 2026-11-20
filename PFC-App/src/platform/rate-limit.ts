/**
 * In-memory fixed-window limiter (NFR-S-007) for auth endpoints. Per server instance;
 * replace with a shared store (Redis/Turso) before running multiple instances.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function allowAttempt(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}
