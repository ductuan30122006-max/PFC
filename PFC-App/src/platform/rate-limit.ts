/**
 * In-memory fixed-window limiter (NFR-S-007) for auth endpoints. Per server instance;
 * replace with a shared store (Redis/Turso) before running multiple instances.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Counts every call (registration, reset requests). */
export function allowAttempt(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

/** Failure-only limiter (login): check before, record on failure, clear on success. */
export function checkLimit(key: string, limit: number, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now || b.count < limit) return { ok: true };
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

export function recordFailure(key: string, windowMs: number, now = Date.now()): number {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  b.count += 1;
  return b.count;
}

export function clearLimit(key: string): void {
  buckets.delete(key);
}
