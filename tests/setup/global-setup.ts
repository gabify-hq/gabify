import { execSync } from 'child_process'
import { Client } from 'pg'
import { Redis } from 'ioredis'
import { TEST_DATABASE_URL, TEST_REDIS_URL, isIsolatedRedisDb } from './test-env'

/**
 * Vitest global setup for the acceptance project.
 *
 * 1. Creates the dedicated test database if it does not exist.
 * 2. Applies all Prisma migrations (`prisma migrate deploy`).
 * 3. Flushes the isolated test Redis database (stale BullMQ jobs from a
 *    previous run would otherwise be replayed by the test workers).
 *
 * This makes `npm run test` self-sufficient on a clean clone (ADDENDUM A10),
 * assuming PostgreSQL from docker-compose.yml is running.
 */
export default async function globalSetup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL)
  const dbName = url.pathname.replace(/^\//, '')

  const adminUrl = new URL(TEST_DATABASE_URL)
  adminUrl.pathname = '/postgres'

  const admin = new Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`)
    }
  } finally {
    await admin.end()
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  })

  if (!isIsolatedRedisDb(TEST_REDIS_URL)) {
    throw new Error(
      `TEST_REDIS_URL must point at an isolated Redis logical database (db > 0), got: ${TEST_REDIS_URL}. ` +
        'Refusing to run acceptance tests against the shared dev keyspace.'
    )
  }
  const redis = new Redis(TEST_REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
  try {
    await redis.connect()
    await redis.flushdb()
  } finally {
    redis.disconnect()
  }

  // Synthetic fixtures (A10) — generated on demand, deterministic
  const { ensureFixtures } = await import('../fixtures/generate')
  await ensureFixtures()
}
