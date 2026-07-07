/**
 * Demonstration seed — creates the "Gabinete Demo" office with realistic data
 * via services (never raw SQL). Idempotent: running twice never duplicates.
 *
 * Usage: npm run seed:demo
 * Env: SEED_DEMO_OWNER_EMAIL (default demo@gabify.local);
 *      refuses NODE_ENV=production unless SEED_DEMO_FORCE=true.
 */
import { seedDemo } from '../src/server/services/demo-seed-service'
import { prisma } from '../src/lib/prisma'

async function main(): Promise<void> {
  const result = await seedDemo()
  if (result.created) {
    console.log(`[seed-demo] created office "Gabinete Demo" (${result.officeId})`)
  } else {
    console.log('[seed-demo] already seeded — no changes (idempotent)')
  }
  console.log('[seed-demo] counts:', JSON.stringify(result.counts))
  for (const warning of result.warnings) {
    console.warn(`[seed-demo] warning: ${warning}`)
  }
}

main()
  .catch((err) => {
    console.error('[seed-demo] failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
