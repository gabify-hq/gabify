import { prisma } from '@/lib/prisma'
import { encryptToken, decryptToken } from '@/lib/crypto'
import type { EmailAccount, Prisma } from '@prisma/client'

/**
 * OAuth token refresh serialized per account (audit F2.6 — A-3).
 *
 * Concurrent workers (webhook + scheduled poll) used to refresh the same
 * account simultaneously; with refresh-token rotation (Microsoft always
 * rotates) the loser persisted an already-consumed refresh token and the
 * account died in `invalid_grant` until manual re-auth.
 *
 * Serialization: `pg_advisory_xact_lock` keyed on the account id inside an
 * interactive transaction — the first caller refreshes, everyone else blocks
 * on the lock, re-reads and reuses the fresh token (double-checked inside).
 */

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 minutes
const REFRESH_TX_TIMEOUT_MS = 30_000
const REFRESH_TX_MAX_WAIT_MS = 15_000

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'

type OAuthKind = 'gmail' | 'outlook'

interface TokenFields {
  access: 'gmailAccessToken' | 'outlookAccessToken'
  refresh: 'gmailRefreshToken' | 'outlookRefreshToken'
  expiry: 'gmailTokenExpiry' | 'outlookTokenExpiry'
}

const FIELDS: Record<OAuthKind, TokenFields> = {
  gmail: {
    access: 'gmailAccessToken',
    refresh: 'gmailRefreshToken',
    expiry: 'gmailTokenExpiry',
  },
  outlook: {
    access: 'outlookAccessToken',
    refresh: 'outlookRefreshToken',
    expiry: 'outlookTokenExpiry',
  },
}

interface RefreshedTokens {
  accessToken: string
  refreshToken?: string
  expiresInSeconds: number
}

interface TokenEndpointResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

function isStillFresh(expiry: Date | null): boolean {
  return expiry !== null && expiry.getTime() - Date.now() >= TOKEN_REFRESH_BUFFER_MS
}

async function requestNewTokens(kind: OAuthKind, refreshTokenPlain: string): Promise<RefreshedTokens> {
  let url: string
  let params: URLSearchParams

  if (kind === 'gmail') {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required')
    }
    url = GOOGLE_TOKEN_URL
    params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenPlain,
    })
  } else {
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error('MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables are required')
    }
    url = MICROSOFT_TOKEN_URL
    params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenPlain,
      scope:
        'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access',
    })
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!response.ok) {
    throw new Error(`${kind}: token refresh failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as TokenEndpointResponse
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: data.expires_in,
  }
}

async function ensureFreshOAuthToken(accountId: string, kind: OAuthKind): Promise<string> {
  const fields = FIELDS[kind]

  // Fast path — no lock when the stored token is still comfortably valid
  const account = await prisma.emailAccount.findUniqueOrThrow({ where: { id: accountId } })
  const access = account[fields.access]
  if (access && isStillFresh(account[fields.expiry])) {
    return decryptToken(access)
  }

  return prisma.$transaction(
    async (tx) => {
      // Serialize per account — released automatically at transaction end.
      // ::text cast because the function returns void, which Prisma cannot map.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`oauth-refresh-${accountId}`}))::text`

      // Double-check: another worker may have refreshed while we waited
      const fresh = await tx.emailAccount.findUniqueOrThrow({ where: { id: accountId } })
      const freshAccess = fresh[fields.access]
      if (freshAccess && isStillFresh(fresh[fields.expiry])) {
        return decryptToken(freshAccess)
      }

      const storedRefresh = fresh[fields.refresh]
      if (!storedRefresh) {
        throw new Error(`${kind}: no refresh token available — re-authentication required`)
      }

      const tokens = await requestNewTokens(kind, decryptToken(storedRefresh))
      const newRefreshPlain = tokens.refreshToken ?? decryptToken(storedRefresh)

      const data: Prisma.EmailAccountUpdateInput = {
        [fields.access]: encryptToken(tokens.accessToken),
        [fields.refresh]: encryptToken(newRefreshPlain),
        [fields.expiry]: new Date(Date.now() + tokens.expiresInSeconds * 1000),
      }
      await tx.emailAccount.update({ where: { id: accountId }, data })

      return tokens.accessToken
    },
    { timeout: REFRESH_TX_TIMEOUT_MS, maxWait: REFRESH_TX_MAX_WAIT_MS },
  )
}

export async function ensureFreshGmailToken(accountId: string): Promise<string> {
  return ensureFreshOAuthToken(accountId, 'gmail')
}

export async function ensureFreshOutlookToken(accountId: string): Promise<string> {
  return ensureFreshOAuthToken(accountId, 'outlook')
}

export type { EmailAccount }
