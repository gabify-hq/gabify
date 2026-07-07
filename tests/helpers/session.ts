import type { UserRole } from '@prisma/client'

export interface TestSessionUser {
  id: string
  email: string
  name?: string | null
  officeId: string | null
  role: UserRole
  /** Only set for portal users (role CLIENT) — mirrors User.clientId. */
  clientId?: string | null
}

export interface TestSession {
  user: TestSessionUser
  expires: string
}

let currentSession: TestSession | null = null

/** Sets the session returned by the mocked `auth()` for subsequent requests. */
export function setSession(user: TestSessionUser | null): void {
  currentSession = user
    ? { user, expires: new Date(Date.now() + 86_400_000).toISOString() }
    : null
}

export function getSession(): TestSession | null {
  return currentSession
}

/**
 * Module factory for `vi.mock('@/lib/auth', authMockFactory)`.
 * Each acceptance test file that exercises API routes must call:
 *
 *   vi.mock('@/lib/auth', () => authMockFactory())
 */
export function authMockFactory() {
  return {
    auth: async () => getSession(),
    handlers: { GET: async () => new Response(null), POST: async () => new Response(null) },
    signIn: async () => undefined,
    signOut: async () => undefined,
  }
}
