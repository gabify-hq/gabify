import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { can } from '@/server/authz/can'
import crypto from 'crypto'

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const SCOPES = [
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'offline_access',
].join(' ')

/**
 * GET /api/auth/outlook/initiate
 * Builds Microsoft OAuth URL and redirects. Stores CSRF state in cookie.
 *
 * Required env vars:
 *   MICROSOFT_CLIENT_ID
 *   NEXTAUTH_URL (for redirect URI)
 *
 * Azure AD app must have redirect URI registered:
 *   {NEXTAUTH_URL}/api/auth/outlook/callback
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL ?? 'http://localhost:3000'))
  }
  if (!can(session.user.role, 'emailAccount:connect')) {
    return NextResponse.redirect(
      new URL('/settings?error=sem_permissao', process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
    )
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID
  if (!clientId) {
    return NextResponse.redirect(
      new URL('/settings?error=outlook_not_configured', process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
    )
  }

  const state = crypto.randomBytes(32).toString('hex')
  const redirectUri = `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/auth/outlook/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    response_mode: 'query',
    prompt: 'select_account',
  })

  const authUrl = `${MICROSOFT_AUTH_URL}?${params.toString()}`

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('outlook_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return response
}
