import { PrismaAdapter } from '@auth/prisma-adapter'
import type { PrismaClient } from '@prisma/client'
import type { Adapter, AdapterUser } from 'next-auth/adapters'
import { acceptInvitationForEmail } from '@/server/services/invitation-service'

/**
 * GabifyAdapter — closed onboarding (S0.1).
 *
 * User creation is ONLY possible through a pending invitation: the invitation
 * dictates officeId and role, is marked accepted, and an INVITATION_ACCEPTED
 * audit entry is written. Signups without an invitation are refused — no user,
 * no office, no session. The first Office/OWNER pair is created exclusively by
 * `npm run seed:bootstrap` (scripts/seed-office.ts).
 */
export function GabifyAdapter(prisma: PrismaClient): Adapter {
  const base = PrismaAdapter(prisma)

  return {
    ...base,
    async createUser(data): Promise<AdapterUser> {
      const user = await acceptInvitationForEmail({
        email: data.email,
        name: data.name ?? null,
        image: data.image ?? null,
        emailVerified: data.emailVerified ?? null,
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
