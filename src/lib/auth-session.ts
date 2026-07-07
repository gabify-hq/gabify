import type { Session } from 'next-auth'
import type { UserRole } from '@prisma/client'

interface DbUserLike {
  id: string
  officeId: string
  role: UserRole
  clientId?: string | null
  email: string
  name?: string | null
  image?: string | null
}

/**
 * Enriches the NextAuth session from the user row read on EVERY request
 * (database session strategy — §1.2). Role/office changes in the database
 * take effect on the next request, without re-login.
 */
export function enrichSession(
  session: { user?: Record<string, unknown>; expires: string },
  user: DbUserLike,
): Session {
  const enriched = session as unknown as Session
  enriched.user = {
    ...(session.user ?? {}),
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
    officeId: user.officeId,
    role: user.role,
    clientId: user.clientId ?? null,
  }
  return enriched
}
