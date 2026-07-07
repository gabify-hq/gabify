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
  | 'clientInvitation:manage'
  | 'user:manage'
  | 'export:run'
  | 'settings:manage'
  | 'emailAccount:connect'
  | 'bank:read'
  | 'bank:manage'
  | 'bank:import'
  | 'bank:reconcile'
  | 'bankRule:manage'
  | 'portal:document:read'
  | 'portal:document:upload'
  | 'assistant:query'

const READ_ACTIONS: AuthzAction[] = ['client:read', 'email:read', 'document:read', 'bank:read']

const INTERNAL_ACTIONS: AuthzAction[] = [
  ...READ_ACTIONS,
  'client:create',
  'client:update',
  'client:delete',
  'draft:approve',
  'draft:reject',
  'document:review',
  'document:upload',
  'invitation:manage',
  // Portal access invitations (fase P1): OWNER and ACCOUNTANT may invite CLIENT
  // users — deliberately NOT under the OWNER-only invitation:manage umbrella
  'clientInvitation:manage',
  'user:manage',
  'export:run',
  'settings:manage',
  'emailAccount:connect',
  // Bank reconciliation (fase C3 spec): rules are OWNER/ACCOUNTANT — deliberately
  // NOT under the OWNER-only settings:manage umbrella
  'bank:manage',
  'bank:import',
  'bank:reconcile',
  'bankRule:manage',
]

const OWNER_ONLY: AuthzAction[] = ['invitation:manage', 'user:manage', 'settings:manage']

// Portal do cliente final (fase P1): CLIENT sees ONLY the portal surface, scoped
// to their own clientId at the route/service layer. Internal roles never use the
// portal API — symmetric isolation. Granting internal document:read/upload to
// CLIENT would open /api/documents, /api/documents/import and /api/attachments
// (internal DTOs), so the portal capabilities are dedicated actions.
const PORTAL_ACTIONS: AuthzAction[] = ['portal:document:read', 'portal:document:upload']

const MATRIX: Record<UserRole, ReadonlySet<AuthzAction>> = {
  OWNER: new Set(INTERNAL_ACTIONS),
  ACCOUNTANT: new Set(INTERNAL_ACTIONS.filter((a) => !OWNER_ONLY.includes(a))),
  VIEWER: new Set(READ_ACTIONS),
  CLIENT: new Set(PORTAL_ACTIONS),
}

export function can(role: UserRole | null | undefined, action: AuthzAction): boolean {
  if (!role) return false
  const allowed = MATRIX[role]
  if (!allowed) return false
  return allowed.has(action)
}

// ── Assistant Q&A (append-only extension) ────────────────────────────────────
// `assistant:query` is a pure read over INTERNAL office data: OWNER,
// ACCOUNTANT and VIEWER may query. CLIENT (portal, fase P1) is deliberately
// NOT granted it — portal users must never query across the office — and any
// future role stays denied: can() only consults the explicit MATRIX entry for
// the session role, and no entry ever gets this action implicitly.
const ASSISTANT_ACTIONS: AuthzAction[] = ['assistant:query']
for (const role of ['OWNER', 'ACCOUNTANT', 'VIEWER'] as const) {
  for (const action of ASSISTANT_ACTIONS) {
    ;(MATRIX[role] as Set<AuthzAction>).add(action)
  }
}
