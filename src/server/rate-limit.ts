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

// ── Endpoint-class limits (ADDENDUM A11) ─────────────────────────────────────
// Limits are read from env at call time so deployments (and tests) can tune them.

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/** General APIs: per userId, 600/hour (A11). */
export function checkApiRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(`api:${userId}`, envLimit('RATE_LIMIT_API_PER_HOUR', 600), HOUR_MS)
}

/** Magic-link and invite acceptance: per target email + IP, 5/hour (A11). */
export function checkMagicLinkRateLimit(email: string, ip: string): RateLimitResult {
  return checkRateLimit(
    `magic-link:${email.toLowerCase()}:${ip}`,
    envLimit('RATE_LIMIT_MAGIC_LINK_PER_HOUR', 5),
    HOUR_MS,
  )
}

/** Webhooks: per subscription/account key — Microsoft/Google IPs, never per IP (A11). */
export function checkWebhookRateLimit(key: string): RateLimitResult {
  return checkRateLimit(`webhook:${key}`, envLimit('RATE_LIMIT_WEBHOOK_PER_MIN', 120), MINUTE_MS)
}

/** Uploads/imports: per userId 60/hour AND per officeId 300/hour (A11). */
export function checkUploadRateLimit(userId: string, officeId: string): RateLimitResult {
  const perUser = checkRateLimit(
    `upload:user:${userId}`,
    envLimit('RATE_LIMIT_UPLOAD_USER_PER_HOUR', 60),
    HOUR_MS,
  )
  if (!perUser.allowed) return perUser
  return checkRateLimit(
    `upload:office:${officeId}`,
    envLimit('RATE_LIMIT_UPLOAD_OFFICE_PER_HOUR', 300),
    HOUR_MS,
  )
}

/**
 * Portal users (role CLIENT, fase P1): tighter per-minute limits — external
 * users inside the system. General API 30/min; uploads 10/min.
 */
export function checkClientApiRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(
    `client-api:${userId}`,
    envLimit('RATE_LIMIT_CLIENT_API_PER_MIN', 30),
    MINUTE_MS,
  )
}

export function checkClientUploadRateLimit(userId: string): RateLimitResult {
  return checkRateLimit(
    `client-upload:${userId}`,
    envLimit('RATE_LIMIT_CLIENT_UPLOAD_PER_MIN', 10),
    MINUTE_MS,
  )
}

/** Dedicated ingest address: per address, 100/hour (A5 + A11). */
export function checkIngestRateLimit(ingestAddress: string): RateLimitResult {
  return checkRateLimit(
    `ingest:${ingestAddress.toLowerCase()}`,
    envLimit('RATE_LIMIT_INGEST_PER_HOUR', 100),
    HOUR_MS,
  )
}
