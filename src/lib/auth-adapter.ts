import { PrismaAdapter } from '@auth/prisma-adapter'
import type { PrismaClient } from '@prisma/client'
import type { Adapter } from 'next-auth/adapters'

/**
 * GabifyAdapter — extends PrismaAdapter with Gabify-specific user creation logic.
 *
 * The standard PrismaAdapter.createUser does not know about `officeId`,
 * which is required on the User model. This adapter overrides createUser to:
 * 1. Find or create a default Office (used only for development bootstrapping)
 * 2. Create the User linked to that Office
 *
 * Production flow: Users should be pre-created by an admin with a real officeId.
 * This adapter handles the first-time setup case gracefully.
 */
export function GabifyAdapter(prisma: PrismaClient): Adapter {
  const base = PrismaAdapter(prisma)

  return {
    ...base,
    async createUser(data) {
      // Find or create a default office for dev bootstrapping
      let office = await prisma.office.findFirst({
        where: { deletedAt: null },
        select: { id: true },
      })

      if (!office) {
        office = await prisma.office.create({
          data: { name: 'Gabinete Principal' },
          select: { id: true },
        })
      }

      const user = await prisma.user.create({
        data: {
          email: data.email,
          name: data.name ?? null,
          image: data.image ?? null,
          emailVerified: data.emailVerified ?? null,
          officeId: office.id,
          role: 'ACCOUNTANT',
        },
      })

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        emailVerified: user.emailVerified,
      }
    },
  }
}
