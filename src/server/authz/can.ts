import type { UserRole } from '@prisma/client'

/**
 * Central RBAC with DENY-precedence (§1.1).
 *
 * Every API route (except webhooks and NextAuth internals) must call `can()`.
 * An action absent from the matrix is DENIED for every role — adding a new
 * action requires an explicit matrix entry.
 *
 * Failure mapping: identifiable resource → 404; global action → 403.
 */

export type AuthzAction =
  | 'client:read'
  | 'client:create'
  | 'client:update'
  | 'client:delete'
  | 'email:read'
  | 'draft:approve'
  | 'draft:reject'
  | 'document:read'
  | 'document:review'
  | 'document:upload'
  | 'invitation:manage'
  | 'user:manage'
  | 'export:run'
  | 'settings:manage'
  | 'emailAccount:connect'

const READ_ACTIONS: AuthzAction[] = ['client:read', 'email:read', 'document:read']

const ALL_ACTIONS: AuthzAction[] = [
  ...READ_ACTIONS,
  'client:create',
  'client:update',
  'client:delete',
  'draft:approve',
  'draft:reject',
  'document:review',
  'document:upload',
  'invitation:manage',
  'user:manage',
  'export:run',
  'settings:manage',
  'emailAccount:connect',
]

const OWNER_ONLY: AuthzAction[] = ['invitation:manage', 'user:manage', 'settings:manage']

const MATRIX: Record<UserRole, ReadonlySet<AuthzAction>> = {
  OWNER: new Set(ALL_ACTIONS),
  ACCOUNTANT: new Set(ALL_ACTIONS.filter((a) => !OWNER_ONLY.includes(a))),
  VIEWER: new Set(READ_ACTIONS),
}

export function can(role: UserRole | null | undefined, action: AuthzAction): boolean {
  if (!role) return false
  const allowed = MATRIX[role]
  if (!allowed) return false
  return allowed.has(action)
}
