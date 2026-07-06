import { NextResponse, type NextRequest } from 'next/server'

/**
 * Next.js 16 proxy (replaces middleware).
 *
 * With database sessions (§1.2) the Edge runtime cannot validate the session
 * against PostgreSQL, so this layer does an OPTIMISTIC check only: the session
 * cookie must be present to reach protected routes. Real validation (revocation,
 * expiry, role) happens on every request in the Node runtime via `auth()` —
 * a deleted Session row means `auth()` returns null regardless of the cookie.
 */

const SESSION_COOKIES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
]

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/accept-invite') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/webhooks')

  if (isPublic) return NextResponse.next()

  const hasSessionCookie = SESSION_COOKIES.some((name) => request.cookies.has(name))
  if (hasSessionCookie) return NextResponse.next()

  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
