import { prisma } from '@/lib/prisma'

/**
 * Truncates every application table in the test database.
 * `_prisma_migrations` is preserved. CASCADE handles FK ordering.
 */
export async function truncateAll(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (tables.length === 0) return
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

export { prisma }
