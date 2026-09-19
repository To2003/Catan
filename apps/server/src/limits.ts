/**
 * Basic abuse limits. Not a security boundary on their own — the schema and
 * the session are — just enough that one socket cannot drown a room.
 */

export const MAX_MESSAGE_BYTES = 16 * 1024;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/** A token bucket per key: `capacity` actions, refilled over `windowMs`. */
export const createRateLimiter = (capacity: number, windowMs: number) => {
  const buckets = new Map<string, Bucket>();

  return {
    take(key: string, now = Date.now()): boolean {
      const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
      const refill = ((now - bucket.updatedAt) / windowMs) * capacity;
      bucket.tokens = Math.min(capacity, bucket.tokens + refill);
      bucket.updatedAt = now;

      if (bucket.tokens < 1) {
        buckets.set(key, bucket);
        return false;
      }
      bucket.tokens -= 1;
      buckets.set(key, bucket);
      return true;
    },
    forget(key: string): void {
      buckets.delete(key);
    },
  };
};
