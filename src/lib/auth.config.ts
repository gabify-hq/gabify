import type { NextAuthConfig } from 'next-auth'

/**
 * Edge-compatible auth config — no Prisma, no Node.js built-ins.
 * Used by middleware (Edge runtime).
 * Full auth with PrismaAdapter lives in auth.ts (Node.js runtime only).
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/login',
    verifyRequest: '/login/verify',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = nextUrl

      const isPublic =
        pathname.startsWith('/login') ||
        pathname.startsWith('/api/auth')

      if (isPublic) return true
      if (isLoggedIn) return true

      // Unauthenticated + protected route → redirect to /login
      return false
    },
  },
  providers: [],
}
