/**
 * Moloni pull service — loads a per-client MoloniConnection, decrypts its
 * credentials, drives the pure MoloniConnector through the generic
 * `runSourcePull`, and persists refreshed tokens / connection state.
 *
 * The connector is pure (credentials in, data out); everything that touches the
 * DB or secrets lives here. Doc-driven, NEVER tested against the real Moloni
 * API (INTEGRATION_NOTES_MOLONI.md).
 */
import { prisma } from '@/lib/prisma'
import { decryptToken, encryptToken } from '@/lib/crypto'
import { MoloniConnector } from './connector'
import type { MoloniClientDeps, MoloniTokenState } from './client'
import { runSourcePull, type SourcePullResult } from '../source-pull'

export interface MoloniPullDeps {
  fetchImpl?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const ZERO = { imported: 0, skippedKnown: 0 }

function redactSecrets(message: string, secrets: string[]): string {
  let out = message
  for (const secret of secrets) {
    if (secret && secret.length > 3) out = out.split(secret).join('[REDACTED]')
  }
  return out
}

async function persistTokens(connectionId: string, state: MoloniTokenState): Promise<void> {
  await prisma.moloniConnection.update({
    where: { id: connectionId },
    data: {
      accessToken: encryptToken(state.accessToken),
      refreshToken: encryptToken(state.refreshToken),
      tokenExpiresAt: new Date(state.expiresAtEpochMs),
    },
  })
}

export async function pullDocumentsForMoloniConnection(
  params: { connectionId: string; officeId: string; userId: string | null },
  deps: MoloniPullDeps = {},
): Promise<SourcePullResult> {
  const connection = await prisma.moloniConnection.findFirst({
    where: { id: params.connectionId, officeId: params.officeId, deletedAt: null },
  })
  if (!connection) return { ok: false, ...ZERO, error: 'Ligação não encontrada' }
  if (connection.status === 'DESLIGADA') {
    return { ok: false, ...ZERO, error: 'A ligação Moloni está desligada' }
  }
  if (!connection.pullEnabled) {
    return { ok: false, ...ZERO, error: 'A importação de faturas está desligada nesta ligação' }
  }

  const appClientId = process.env.MOLONI_CLIENT_ID
  const appClientSecret = process.env.MOLONI_CLIENT_SECRET
  if (!appClientId || !appClientSecret) {
    return { ok: false, ...ZERO, error: 'Credenciais de developer Moloni não configuradas (MOLONI_CLIENT_ID/SECRET)' }
  }

  const username = decryptToken(connection.username)
  const password = decryptToken(connection.password)
  const secretsToRedact = [password, appClientSecret]

  const initialToken: MoloniTokenState | undefined =
    connection.accessToken && connection.refreshToken && connection.tokenExpiresAt
      ? {
          accessToken: decryptToken(connection.accessToken),
          refreshToken: decryptToken(connection.refreshToken),
          expiresAtEpochMs: connection.tokenExpiresAt.getTime(),
        }
      : undefined

  // The connector's onTokenState is synchronous; capture the latest state and
  // persist it (re-encrypted) once the run settles — success OR failure.
  let latestToken: MoloniTokenState | null = null
  const clientDeps: MoloniClientDeps = {
    fetchFn: deps.fetchImpl,
    now: deps.now,
    sleep: deps.sleep,
    onTokenState: (state) => {
      latestToken = state
    },
  }

  const connector = new MoloniConnector({
    credentials: { clientId: appClientId, clientSecret: appClientSecret, username, password },
    companyId: connection.companyId,
    tokenState: initialToken,
    deps: clientDeps,
  })

  try {
    const result = await runSourcePull(connector, {
      officeId: connection.officeId,
      clientId: connection.clientId,
      system: 'MOLONI',
      classificationSource: 'moloni-pull',
      auditAction: 'MOLONI_PULL',
      userId: params.userId,
    })
    if (latestToken) await persistTokens(connection.id, latestToken)
    await prisma.moloniConnection.update({
      where: { id: connection.id },
      data: { lastPullAt: new Date(), status: 'ATIVA', lastError: null },
    })
    return result
  } catch (error) {
    if (latestToken) await persistTokens(connection.id, latestToken)
    const raw = error instanceof Error ? error.message : 'Erro desconhecido na importação Moloni'
    const message = redactSecrets(raw, secretsToRedact)
    await prisma.moloniConnection.update({
      where: { id: connection.id },
      data: { status: 'ERRO', lastError: message },
    })
    return { ok: false, ...ZERO, error: message }
  }
}
