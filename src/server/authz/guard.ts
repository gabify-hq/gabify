import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { UserRole } from '@prisma/client'
import { can, type AuthzAction } from './can'
import { checkApiRateLimit } from '@/server/rate-limit'

export interface GuardedSessionUser {
  id: string
  email: string
  officeId: string
  role: UserRole
}

export type GuardResult =
  | { ok: true; user: GuardedSessionUser }
  | { ok: false; response: NextResponse }

interface GuardOptions {
  /**
   * Status returned on permission denial. 404 for identifiable resources
   * (never reveal existence), 403 for global actions (§1.1). Default 404.
   */
  denyStatus?: 403 | 404
  /** Skip the general API rate limit (webhooks and auth flows have their own). */
  skipRateLimit?: boolean
}

/**
 * Session + RBAC + general API rate-limit gate for API routes.
 */
export async function guard(action: AuthzAction, options: GuardOptions = {}): Promise<GuardResult> {
  const session = await auth()
  if (!session?.user?.officeId || !session.user.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }),
    }
  }

  if (!options.skipRateLimit) {
    const rate = checkApiRateLimit(session.user.id)
    if (!rate.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Demasiados pedidos — tente mais tarde' },
          { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
        ),
      }
    }
  }

  if (!can(session.user.role, action)) {
    const denyStatus = options.denyStatus ?? 404
    const message = denyStatus === 403 ? 'Sem permissão' : 'Não encontrado'
    return {
      ok: false,
      response: NextResponse.json({ error: message }, { status: denyStatus }),
    }
  }

  return {
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      officeId: session.user.officeId,
      role: session.user.role,
    },
  }
}
