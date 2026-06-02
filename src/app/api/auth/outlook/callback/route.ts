import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/crypto'

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me'

interface MicrosoftTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

interface GraphMeResponse {
  id: string
  mail?: string
  userPrincipalName?: string
  displayName?: string
}

/**
 * GET /api/auth/outlook/callback
 * Handles Microsoft OAuth callback. Exchanges code for tokens and upserts EmailAccount.
 *
 * Required env vars:
 *   MICROSOFT_CLIENT_ID
 *   MICROSOFT_CLIENT_SECRET
 *   NEXTAUTH_URL
 */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const { searchParams } = request.nextUrl

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Microsoft returned an error (user denied, etc.)
  if (error) {
    return NextResponse.redirect(new URL('/settings?error=outlook_auth_denied', baseUrl))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/settings?error=outlook_auth_failed', baseUrl))
  }

  // CSRF verification
  const storedState = request.cookies.get('outlook_oauth_state')?.value
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/settings?error=outlook_auth_invalid_state', baseUrl))
  }

  // Must be logged in
  const session = await auth()
  if (!session?.user?.id || !session.user.officeId) {
    return NextResponse.redirect(new URL('/login', baseUrl))
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/settings?error=outlook_not_configured', baseUrl))
  }

  const redirectUri = `${baseUrl}/api/auth/outlook/callback`

  try {
    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    })

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    })

    if (!tokenRes.ok) {
      console.error('[outlook-callback] token exchange failed:', tokenRes.status)
      return NextResponse.redirect(new URL('/settings?error=outlook_auth_failed', baseUrl))
    }

    const tokenData = (await tokenRes.json()) as MicrosoftTokenResponse

    // Get user info from Microsoft Graph
    const meRes = await fetch(GRAPH_ME_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })

    if (!meRes.ok) {
      console.error('[outlook-callback] graph /me failed:', meRes.status)
      return NextResponse.redirect(new URL('/settings?error=outlook_auth_failed', baseUrl))
    }

    const me = (await meRes.json()) as GraphMeResponse
    const email = me.mail ?? me.userPrincipalName ?? ''

    if (!email) {
      return NextResponse.redirect(new URL('/settings?error=outlook_auth_failed', baseUrl))
    }

    const tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000)

    // Upsert EmailAccount
    await prisma.emailAccount.upsert({
      where: {
        officeId_email_provider: {
          officeId: session.user.officeId,
          email,
          provider: 'OUTLOOK',
        },
      },
      create: {
        officeId: session.user.officeId,
        email,
        name: me.displayName ?? null,
        provider: 'OUTLOOK',
        outlookAccessToken: encryptToken(tokenData.access_token),
        outlookRefreshToken: tokenData.refresh_token
          ? encryptToken(tokenData.refresh_token)
          : null,
        outlookTokenExpiry: tokenExpiry,
        outlookUserId: me.id,
        active: true,
      },
      update: {
        name: me.displayName ?? null,
        outlookAccessToken: encryptToken(tokenData.access_token),
        outlookRefreshToken: tokenData.refresh_token
          ? encryptToken(tokenData.refresh_token)
          : null,
        outlookTokenExpiry: tokenExpiry,
        outlookUserId: me.id,
        active: true,
      },
    })

    // Clear CSRF cookie
    const response = NextResponse.redirect(new URL('/settings?connected=outlook', baseUrl))
    response.cookies.delete('outlook_oauth_state')
    return response
  } catch (err) {
    console.error('[outlook-callback] unexpected error:', err)
    return NextResponse.redirect(new URL('/settings?error=outlook_auth_failed', baseUrl))
  }
}
