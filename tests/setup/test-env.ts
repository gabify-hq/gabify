/**
 * Shared test environment constants.
 *
 * The acceptance suite runs against a dedicated PostgreSQL database
 * (`gabify_test` by default) — never against the development database.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://gabify:gabify@localhost:5432/gabify_test'

/** Applied before any application module is imported (see acceptance-env.ts). */
export function applyTestEnv(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
  process.env.NODE_ENV = 'test'
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-auth-secret'
  process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  process.env.TOKEN_ENCRYPTION_KEY =
    process.env.TOKEN_ENCRYPTION_KEY ?? '0'.repeat(64)
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? 're_test_key'
  process.env.FROM_EMAIL = process.env.FROM_EMAIL ?? 'no-reply@test.gabify.pt'
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'sk-ant-test'
  process.env.GRAPH_WEBHOOK_SECRET = process.env.GRAPH_WEBHOOK_SECRET ?? 'test-graph-secret'
  process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? 'test-account'
  process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? 'test-key'
  process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? 'test-secret'
  process.env.R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? 'gabify-test'
}
