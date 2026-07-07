import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/crypto'
import { ToconlineClient } from './toconline-client'
import { getToconlineFetch } from './fetch-provider'
import type { ToconlineConnection } from '@prisma/client'

/**
 * TOConline connection lifecycle (per END-CLIENT — the TOConline account
 * belongs to the client company). The four integrator values come from
 * TOConline > Empresa > Configurações > Dados API. Secrets and tokens are
 * AES-256-GCM encrypted before persistence and NEVER leave the server: the
 * DTO below is built field-by-field (no spread) so nothing secret can leak.
 */

export interface ToconlineConnectionDTO {
  clientId: string
  oauthUrl: string
  apiUrl: string
  oauthClientId: string
  status: 'ACTIVE' | 'ERROR' | 'DISABLED'
  dryRun: boolean
  lastError: string | null
  hasTokens: boolean
  updatedAt: string
}

export function toConnectionDTO(connection: ToconlineConnection): ToconlineConnectionDTO {
  return {
    clientId: connection.clientId,
    oauthUrl: connection.oauthUrl,
    apiUrl: connection.apiUrl,
    oauthClientId: connection.oauthClientId,
    status: connection.status,
    dryRun: connection.dryRun,
    lastError: connection.lastError,
    hasTokens: Boolean(connection.accessToken),
    updatedAt: connection.updatedAt.toISOString(),
  }
}

function sanitize(message: string, secret: string): string {
  return secret.length > 3 ? message.split(secret).join('[REDACTED]') : message
}

/**
 * Create or update the connection for a client and validate the credentials by
 * running the full OAuth flow (non-interactive per the docs). A failed
 * validation still saves the connection (status ERROR + lastError) so the
 * accountant can correct the values. dryRun is NEVER changed here — it is born
 * true and only /dry-run (OWNER for disabling) touches it.
 */
export async function saveConnection(params: {
  officeId: string
  clientId: string
  oauthUrl: string
  apiUrl: string
  oauthClientId: string
  oauthClientSecret: string
  userId: string
}): Promise<ToconlineConnectionDTO> {
  const base = {
    oauthUrl: params.oauthUrl.replace(/\/$/, ''),
    apiUrl: params.apiUrl.replace(/\/$/, ''),
    oauthClientId: params.oauthClientId,
    oauthClientSecret: encryptToken(params.oauthClientSecret),
  }
  // clientId stopped being globally unique with the Ligações model (a client
  // may hold several source connections); the UI still manages ONE TOConline
  // connection per client — the oldest row is "the" connection.
  const existing = await prisma.toconlineConnection.findFirst({
    where: { officeId: params.officeId, clientId: params.clientId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  const connection = existing
    ? await prisma.toconlineConnection.update({
        where: { id: existing.id },
        data: {
          ...base,
          // fresh credentials invalidate stored tokens
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          status: 'ACTIVE',
          lastError: null,
        },
      })
    : await prisma.toconlineConnection.create({
        data: {
          officeId: params.officeId,
          clientId: params.clientId,
          ...base,
          status: 'ACTIVE',
        },
      })

  // Audit before the external validation call (house rule)
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'TOCONLINE_CONNECTION_SAVED',
      entityType: 'ToconlineConnection',
      entityId: connection.id,
      metadata: { clientId: params.clientId, apiUrl: base.apiUrl },
    },
  })

  let updated: ToconlineConnection
  try {
    const client = new ToconlineClient({
      oauthUrl: base.oauthUrl,
      apiUrl: base.apiUrl,
      oauthClientId: params.oauthClientId,
      oauthClientSecret: params.oauthClientSecret,
      fetchImpl: getToconlineFetch(),
      onTokens: async (tokens) => {
        await prisma.toconlineConnection.update({
          where: { id: connection.id },
          data: {
            accessToken: encryptToken(tokens.accessToken),
            refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
            tokenExpiresAt: tokens.expiresAt,
          },
        })
      },
    })
    await client.validateCredentials()
    updated = await prisma.toconlineConnection.update({
      where: { id: connection.id },
      data: { status: 'ACTIVE', lastError: null },
    })
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Falha na validação das credenciais'
    updated = await prisma.toconlineConnection.update({
      where: { id: connection.id },
      data: { status: 'ERROR', lastError: sanitize(raw, params.oauthClientSecret) },
    })
  }
  return toConnectionDTO(updated)
}

export async function getConnectionForClient(
  officeId: string,
  clientId: string,
): Promise<ToconlineConnectionDTO | null> {
  const connection = await prisma.toconlineConnection.findFirst({
    where: { officeId, clientId },
  })
  return connection ? toConnectionDTO(connection) : null
}

/** Set dry-run. Disabling (going live) is gated to OWNER at the route layer. */
export async function setConnectionDryRun(params: {
  officeId: string
  clientId: string
  dryRun: boolean
  userId: string
}): Promise<ToconlineConnectionDTO | null> {
  const connection = await prisma.toconlineConnection.findFirst({
    where: { officeId: params.officeId, clientId: params.clientId },
  })
  if (!connection) return null
  const updated = await prisma.toconlineConnection.update({
    where: { id: connection.id },
    data: { dryRun: params.dryRun },
  })
  if (!params.dryRun) {
    await prisma.auditLog.create({
      data: {
        officeId: params.officeId,
        userId: params.userId,
        action: 'TOCONLINE_DRY_RUN_DISABLED',
        entityType: 'ToconlineConnection',
        entityId: connection.id,
        metadata: { clientId: params.clientId },
      },
    })
  }
  return toConnectionDTO(updated)
}

/** Disconnect: status DISABLED + stored tokens destroyed (secret kept encrypted). */
export async function disableConnection(params: {
  officeId: string
  clientId: string
  userId: string
}): Promise<ToconlineConnectionDTO | null> {
  const connection = await prisma.toconlineConnection.findFirst({
    where: { officeId: params.officeId, clientId: params.clientId },
  })
  if (!connection) return null
  const updated = await prisma.toconlineConnection.update({
    where: { id: connection.id },
    data: {
      status: 'DISABLED',
      dryRun: true, // a future re-activation starts safe again
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    },
  })
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'TOCONLINE_CONNECTION_DISABLED',
      entityType: 'ToconlineConnection',
      entityId: connection.id,
      metadata: { clientId: params.clientId },
    },
  })
  return toConnectionDTO(updated)
}
