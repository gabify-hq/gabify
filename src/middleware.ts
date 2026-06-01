import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

/**
 * Auth.js v5 middleware — protects all dashboard routes.
 *
 * Rules:
 * - Unauthenticated + not on /login → redirect to /login
 * - Authenticated + on /login → redirect to /inbox
 * - Everything else → pass through
 */
export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isLoggedIn && pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/inbox', req.url))
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
