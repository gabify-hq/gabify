/**
 * InvoiceXpress pull service — loads a per-client InvoicexpressConnection,
 * decrypts its api_key, drives the pure InvoicexpressConnector through the
 * generic `runSourcePull`, and resolves each customer's NIF out-of-band with a
 * cache (one API call per final customer, never per document).
 *
 * Doc-driven, NEVER tested against the real InvoiceXpress API
 * (INTEGRATION_NOTES_IVX.md).
 */
import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/crypto'
import { InvoicexpressConnector } from './connector'
import { runSourcePull, type SourcePullHooks, type SourcePullResult } from '../source-pull'

export interface InvoicexpressPullDeps {
  fetchImpl?: typeof fetch
  /** Override the client rate-gate interval (tests set 0 to skip real timers). */
  minIntervalMs?: number
}

const ZERO = { imported: 0, skippedKnown: 0 }
/** 24h overlap on the incremental date window (correctness relies on dedup). */
const OVERLAP_MS = 24 * 3600 * 1000

/**
 * NIF resolver: document responses never carry the customer NIF, so it is
 * fetched from `GET /clients/{id}`. An in-run memo guarantees ONE call per
 * final customer even across many documents; the `SourceEntityMap` CLIENT cache
 * makes subsequent runs cost zero calls.
 */
function createNifResolver(
  connector: InvoicexpressConnector,
  ctx: { officeId: string; clientId: string },
): SourcePullHooks {
  const memo = new Map<string, string | null>()
  return {
    resolveBuyerNif: async (doc) => {
      const externalId = doc.customerExternalId
      if (!externalId) return doc.customerVat ?? null
      if (memo.has(externalId)) return memo.get(externalId) ?? null

      const cached = await prisma.sourceEntityMap.findUnique({
        where: {
          system_entityType_externalId_clientId: {
            system: 'INVOICEXPRESS',
            entityType: 'CLIENT',
            externalId,
            clientId: ctx.clientId,
          },
        },
        select: { value: true },
      })
      if (cached) {
        memo.set(externalId, cached.value)
        return cached.value
      }

      const nif = await connector.resolveClientNif(externalId)
      memo.set(externalId, nif)
      await prisma.sourceEntityMap.upsert({
        where: {
          system_entityType_externalId_clientId: {
            system: 'INVOICEXPRESS',
            entityType: 'CLIENT',
            externalId,
            clientId: ctx.clientId,
          },
        },
        create: {
          officeId: ctx.officeId,
          clientId: ctx.clientId,
          system: 'INVOICEXPRESS',
          entityType: 'CLIENT',
          externalId,
          value: nif,
        },
        update: { value: nif },
      })
      return nif
    },
  }
}

export async function pullDocumentsForInvoicexpressConnection(
  params: { connectionId: string; officeId: string; userId: string | null },
  deps: InvoicexpressPullDeps = {},
): Promise<SourcePullResult> {
  const connection = await prisma.invoicexpressConnection.findFirst({
    where: { id: params.connectionId, officeId: params.officeId, deletedAt: null },
  })
  if (!connection) return { ok: false, ...ZERO, error: 'Ligação não encontrada' }
  if (connection.status === 'DESLIGADA') {
    return { ok: false, ...ZERO, error: 'A ligação InvoiceXpress está desligada' }
  }
  if (!connection.pullEnabled) {
    return { ok: false, ...ZERO, error: 'A importação de faturas está desligada nesta ligação' }
  }

  const apiKey = decryptToken(connection.apiKey)
  const dateFrom = connection.lastPullAt
    ? new Date(connection.lastPullAt.getTime() - OVERLAP_MS).toISOString().slice(0, 10)
    : undefined

  const connector = new InvoicexpressConnector({
    accountName: connection.accountName,
    apiKey,
    dateFrom,
    fetchImpl: deps.fetchImpl,
    minIntervalMs: deps.minIntervalMs,
  })
  const hooks = createNifResolver(connector, {
    officeId: connection.officeId,
    clientId: connection.clientId,
  })

  try {
    const result = await runSourcePull(
      connector,
      {
        officeId: connection.officeId,
        clientId: connection.clientId,
        system: 'INVOICEXPRESS',
        classificationSource: 'invoicexpress-pull',
        auditAction: 'INVOICEXPRESS_PULL',
        userId: params.userId,
      },
      hooks,
    )
    await prisma.invoicexpressConnection.update({
      where: { id: connection.id },
      data: { lastPullAt: new Date(), status: 'ATIVA', lastError: null },
    })
    return result
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Erro desconhecido na importação InvoiceXpress'
    // The client already redacts the api_key from every surface; strip the
    // decrypted key defensively too.
    const message = apiKey.length > 3 ? raw.split(apiKey).join('[REDACTED]') : raw
    await prisma.invoicexpressConnection.update({
      where: { id: connection.id },
      data: { status: 'ERRO', lastError: message },
    })
    return { ok: false, ...ZERO, error: message }
  }
}
