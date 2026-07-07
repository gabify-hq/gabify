/**
 * Bootstrap seed — creates the first Office + OWNER via services (never raw SQL).
 * Idempotent: running twice never duplicates.
 *
 * Usage: npm run seed:bootstrap
 * Requires: BOOTSTRAP_OWNER_EMAIL (and optionally BOOTSTRAP_OFFICE_NAME, BOOTSTRAP_OWNER_NAME).
 */
import { bootstrapOffice } from '../src/server/services/office-service'
import { prisma } from '../src/lib/prisma'

async function main(): Promise<void> {
  const ownerEmail = process.env.BOOTSTRAP_OWNER_EMAIL
  if (!ownerEmail) {
    console.error('[seed-office] BOOTSTRAP_OWNER_EMAIL is required')
    process.exit(1)
  }

  const officeName = process.env.BOOTSTRAP_OFFICE_NAME ?? 'Gabinete Principal'
  const ownerName = process.env.BOOTSTRAP_OWNER_NAME

  const result = await bootstrapOffice({ officeName, ownerEmail, ownerName })
  if (result.created) {
    console.log(`[seed-office] created office "${result.office.name}" with OWNER ${result.owner.email}`)
  } else {
    console.log(`[seed-office] already bootstrapped — office "${result.office.name}", owner ${result.owner.email} (no changes)`)
  }
}

main()
  .catch((err) => {
    console.error('[seed-office] failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
