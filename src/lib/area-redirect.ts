import type { UserRole } from '@prisma/client'

/**
 * Role-based area routing (fase P3 — dupla barreira).
 *
 * The app has two disjoint surfaces: the office dashboard (internal roles) and
 * the end-client portal (role CLIENT). The edge proxy can only check cookie
 * presence (database sessions — §1.2), so the real barrier lives in the layout
 * of EACH area, both consuming this single source of truth.
 */

export type AppArea = 'dashboard' | 'portal'

const DASHBOARD_HOME = '/inbox'
const PORTAL_HOME = '/portal'

/** Landing path after login, by role. */
export function homePathFor(role: UserRole | null | undefined): string {
  if (!role) return '/login'
  return role === 'CLIENT' ? PORTAL_HOME : DASHBOARD_HOME
}

/**
 * Returns the redirect target when `role` may not be in `area`, or null when
 * access is allowed. CLIENT never sees the dashboard; internal users are never
 * sent to the portal.
 */
export function resolveAreaRedirect(
  role: UserRole | null | undefined,
  area: AppArea,
): string | null {
  if (!role) return '/login'
  if (area === 'dashboard' && role === 'CLIENT') return PORTAL_HOME
  if (area === 'portal' && role !== 'CLIENT') return DASHBOARD_HOME
  return null
}
