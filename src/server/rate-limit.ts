/**
 * In-memory sliding-window rate limiter (per instance — acceptable per §1.4).
 * Keys are chosen per endpoint class (ADDENDUM A11).
 */

interface RateLimitResult {
  allowed: boolean
  /** Seconds until the oldest hit leaves the window (only meaningful when blocked). */
  retryAfterSeconds: number
}

const buckets = new Map<string, number[]>()

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const windowStart = now - windowMs
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart)

  if (hits.length >= limit) {
    const oldest = Math.min(...hits)
    buckets.set(key, hits)
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    }
  }

  hits.push(now)
  buckets.set(key, hits)
  return { allowed: true, retryAfterSeconds: 0 }
}

/** Test helper — clears all rate-limit state. */
export function resetRateLimits(): void {
  buckets.clear()
}
