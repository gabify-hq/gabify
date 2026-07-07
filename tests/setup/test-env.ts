/**
 * Shared test environment constants.
 *
 * The acceptance suite runs against a dedicated PostgreSQL database
 * (`gabify_test` by default) — never against the development database.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://gabify:gabify@localhost:5432/gabify_test'

/**
 * The acceptance suite must never share a Redis logical database with dev:
 * BullMQ workers started by the tests would consume stale dev jobs whose
 * officeIds do not exist in the test database (FK violations, flaky runs).
 * Logical db 15 keeps the same local instance but a fully isolated keyspace.
 */
export const TEST_REDIS_URL =
  process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15'

/**
 * True when the URL points at a non-default Redis logical database (db > 0).
 * Flushing is only allowed on isolated databases — db 0 is where dev queues
 * live and must never be wiped by the test suite.
 */
export function isIsolatedRedisDb(redisUrl: string): boolean {
  let url: URL
  try {
    url = new URL(redisUrl)
  } catch {
    return false
  }
  const db = Number(url.pathname.replace(/^\//, ''))
  return Number.isInteger(db) && db > 0
}

/** Applied before any application module is imported (see acceptance-env.ts). */
export function applyTestEnv(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL
  process.env.REDIS_URL = TEST_REDIS_URL
  ;(process.env as Record<string, string>).NODE_ENV = 'test'
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-auth-secret'
  process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  process.env.TOKEN_ENCRYPTION_KEY =
    process.env.TOKEN_ENCRYPTION_KEY ?? '0'.repeat(64)
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? 're_test_key'
  process.env.FROM_EMAIL = process.env.FROM_EMAIL ?? 'no-reply@test.gabify.pt'
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'sk-ant-test'
  process.env.GRAPH_WEBHOOK_SECRET = process.env.GRAPH_WEBHOOK_SECRET ?? 'test-graph-secret'
  process.env.MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? 'test-ms-client-id'
  process.env.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? 'test-ms-client-secret'
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'test-google-client-id'
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'test-google-client-secret'
  process.env.GMAIL_PUBSUB_TOPIC = process.env.GMAIL_PUBSUB_TOPIC ?? 'projects/test/topics/gabify'
  process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? 'test-account'
  process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? 'test-key'
  process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? 'test-secret'
  process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? 'gabify-test'
}
