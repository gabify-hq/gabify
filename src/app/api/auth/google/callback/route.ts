import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/crypto'

const OAUTH_STATE_COOKIE = 'google_oauth_state'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile'

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

interface GmailProfile {
  emailAddress: string
  messagesTotal?: number
  historyId?: string
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const errorRedirect = NextResponse.redirect(
    new URL('/settings?error=gmail_auth_failed', request.url)
  )

  // Validate required params
  if (!code || !state) {
    return errorRedirect
  }

  // CSRF check: verify state matches cookie
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(
      new URL('/settings?error=gmail_auth_invalid_state', request.url)
    )
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const nextAuthUrl = process.env.NEXTAUTH_URL

  if (!clientId || !clientSecret || !nextAuthUrl) {
    return errorRedirect
  }

  const redirectUri = `${nextAuthUrl}/api/auth/google/callback`

  try {
    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    })

    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    })

    if (!tokenResponse.ok) {
      return errorRedirect
    }

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse

    // Get Gmail profile (email address) using gmail scopes — no openid needed
    const profileResponse = await fetch(GMAIL_PROFILE_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })

    if (!profileResponse.ok) {
      return errorRedirect
    }

    const profile = (await profileResponse.json()) as GmailProfile

    // Require authenticated session
    const session = await auth()
    if (!session?.user?.officeId) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const { officeId } = session.user

    // Upsert EmailAccount in DB with encrypted tokens
    await prisma.emailAccount.upsert({
      where: {
        officeId_email_provider: {
          officeId,
          email: profile.emailAddress,
          provider: 'GMAIL',
        },
      },
      create: {
        officeId,
        email: profile.emailAddress,
        provider: 'GMAIL',
        gmailAccessToken: encryptToken(tokenData.access_token),
        gmailRefreshToken: tokenData.refresh_token
          ? encryptToken(tokenData.refresh_token)
          : null,
        gmailTokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000),
        historyId: profile.historyId ?? null,
        active: true,
      },
      update: {
        gmailAccessToken: encryptToken(tokenData.access_token),
        gmailRefreshToken: tokenData.refresh_token
          ? encryptToken(tokenData.refresh_token)
          : undefined,
        gmailTokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000),
        historyId: profile.historyId ?? undefined,
        active: true,
      },
    })

    // Clear the state cookie
    const successRedirect = NextResponse.redirect(
      new URL('/settings?connected=gmail', request.url)
    )
    successRedirect.cookies.delete(OAUTH_STATE_COOKIE)

    return successRedirect
  } catch {
    return errorRedirect
  }
}
