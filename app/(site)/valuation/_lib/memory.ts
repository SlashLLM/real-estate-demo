/* In-process cache, rate limiter and daily model budget.
 *
 * Per server instance: good enough for a single Node deployment and a cheap first line on serverless.
 * The HDB data calls are additionally cached by Next's fetch cache, which is shared across requests. */

type Entry<T> = { value: T; expires: number };
const cache = new Map<string, Entry<unknown>>();
const buckets = new Map<string, { count: number; resetAt: number }>();
let budget = { day: "", used: 0 };

export function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number) {
  if (cache.size > 5000) {
    const now = Date.now();
    for (const [k, v] of cache) if (now > v.expires) cache.delete(k);
    if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
  }
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

/** True when the caller is within budget (and counts the call). */
export function allow(key: string, limit: { max: number; windowMs: number }) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    if (buckets.size > 10000) for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
    return true;
  }
  b.count += 1;
  return b.count <= limit.max;
}

/** Consumes one billed model call from today's (UTC) budget; false once it's spent. */
export function consumeModelCall(max: number) {
  const day = new Date().toISOString().slice(0, 10);
  if (budget.day !== day) budget = { day, used: 0 };
  if (budget.used >= max) return false;
  budget.used += 1;
  return true;
}
