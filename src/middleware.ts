import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

/**
 * Middleware uses the edge-compatible auth config (no Prisma, no Node.js built-ins).
 * The `authorized` callback in authConfig handles redirect logic.
 */
export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
