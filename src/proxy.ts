import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

/**
 * Next.js 16 proxy (replaces middleware).
 * Uses edge-compatible auth config — no Prisma, no Node.js built-ins.
 *
 * Rules (defined in authConfig.callbacks.authorized):
 * - Unauthenticated + protected route → redirect to /login
 * - Authenticated + /login → pass through (redirect handled client-side)
 * - Public routes (/login, /api/auth) → always pass through
 */
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
