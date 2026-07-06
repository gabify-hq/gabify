import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { can } from '@/server/authz/can'

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ')

const OAUTH_STATE_COOKIE = 'google_oauth_state'

export async function GET(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(
      new URL('/login', process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
    )
  }
  if (!can(session.user.role, 'emailAccount:connect')) {
    return NextResponse.redirect(
      new URL('/settings?error=sem_permissao', process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
    )
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const nextAuthUrl = process.env.NEXTAUTH_URL

  if (!clientId || !nextAuthUrl) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID and NEXTAUTH_URL environment variables are required' },
      { status: 500 }
    )
  }

  const state = randomBytes(32).toString('hex')
  const redirectUri = `${nextAuthUrl}/api/auth/google/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  const response = NextResponse.redirect(authUrl)

  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return response
}
