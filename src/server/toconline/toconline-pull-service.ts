import { prisma } from '@/lib/prisma'
import { decryptToken, encryptToken } from '@/lib/crypto'
import { decimalStringFromCents } from '@/lib/money'
import { uploadToR2 } from '@/lib/r2'
import { ToconlineClient } from './toconline-client'
import { ToconlineSourceConnector } from './toconline-source-connector'
import {
  mapSalesDocumentAttributes,
  mapSalesDocumentLines,
  str,
  type MappedSalesDocument,
} from './toconline-sales-mapping'
import type { Prisma, ToconlineConnection } from '@prisma/client'

// Re-exported for backward compatibility (the mapping moved to
// toconline-sales-mapping so the connector and the service can share it).
export { mapSalesDocumentAttributes, mapSalesDocumentLines }

/**
 * TOConline sales pull (issued invoices → Document) — doc-driven, NEVER
 * tested against the real API (INTEGRATION_NOTES.md).
 *
 * Invariants:
 * - [anti-echo] documents whose external_reference carries our GABIFY: push
 *   marker are OUR pushes — they never create a Document;
 * - [dedup] the TOConline id is cached in ToconlineEntityMap
 *   (SALES_DOCUMENT, unique) — a re-pull of a known id is a no-op;
 * - [no AI] pulled documents are API-exact: source API_PULL, confidence 1.0,
 *   state PRE_VALIDATED — the parsing pipeline is NEVER invoked;
 * - [cents] every euro amount from the API converts to integer cents at this
 *   boundary (Decimal-based, never parseFloat);
 * - [dry-run] reads (GET) are allowed, the client is constructed readOnly so
 *   no write can leave, and the would-be Document goes to
 *   ToconlinePushPreview (method 'PULL', documentId null) instead of the DB.
 *
 * Incremental strategy (INTEGRATION_NOTES.md): the doc does not guarantee
 * ordering, so every pull paginates the full finalized list; when lastPullAt
 * exists, the documented attribute-date filter (`documents.updated_at>'…'::date`
 * — caracteristicas-dos-pedidos.md) narrows the scan with a 24h overlap.
 * Correctness NEVER depends on the filter — dedup does the real work.
 */

const PAGE_SIZE = 50
const MAX_PAGES = 200 // hard safety cap (10k documents per run)
const OVERLAP_MS = 24 * 3600 * 1000
const ECHO_MARKER_PREFIX = 'GABIFY:'

export interface ToconlinePullDeps {
  fetchImpl?: typeof fetch
}

export interface ToconlinePullResult {
  ok: boolean
  imported: number
  skippedKnown: number
  skippedEcho: number
  previewed: number
  error?: string
}

function buildDocumentCreateData(params: {
  connection: ToconlineConnection
  mapped: MappedSalesDocument
  documentLines: Array<Record<string, unknown>> | null
}): Prisma.DocumentUncheckedCreateInput {
  const { connection, mapped } = params
  return {
    officeId: connection.officeId,
    clientId: connection.clientId,
    source: 'API_PULL',
    type: 'INVOICE_ISSUED',
    status: 'PRE_VALIDATED',
    confidence: 1.0, // API-exact data — no extraction uncertainty
    extractionSource: 'API_PULL',
    classificationSource: 'toconline-pull',
    documentNumber: mapped.documentNumber,
    issueDate: mapped.issueDate,
    dueDate: mapped.dueDate,
    currency: mapped.currency,
    totalAmount: decimalStringFromCents(mapped.totalCents),
    netAmount: decimalStringFromCents(mapped.netCents),
    vatAmount: decimalStringFromCents(mapped.vatCents),
    withholdingAmount:
      mapped.withholdingCents > 0 ? decimalStringFromCents(mapped.withholdingCents) : null,
    buyerName: mapped.buyerName,
    buyerNif: mapped.buyerNif,
    // The client company is the ISSUER of these invoices (QR semantics:
    // supplier = emitter)
    supplierName: null,
    supplierNif: null,
    vatBreakdown: mapped.vatBreakdown as unknown as Prisma.InputJsonValue,
    documentLines: (params.documentLines ?? undefined) as Prisma.InputJsonValue | undefined,
    toconlineDocumentId: mapped.toconlineId,
    originalFilename: `${mapped.documentNumber.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`,
  }
}

/** Credential hygiene [INV] — same rule as the push side. */
function sanitizePullError(message: string, connection: ToconlineConnection): string {
  let out = message
  const candidates: string[] = []
  for (const enc of [connection.oauthClientSecret, connection.accessToken, connection.refreshToken]) {
    if (!enc) continue
    try {
      candidates.push(decryptToken(enc))
    } catch {
      // undecryptable value cannot leak
    }
  }
  for (const secret of candidates) {
    if (secret && secret.length > 3) out = out.split(secret).join('[REDACTED]')
  }
  return out
}

export async function pullSalesDocumentsForConnection(
  params: { connectionId: string; officeId: string; userId: string | null },
  deps: ToconlinePullDeps = {},
): Promise<ToconlinePullResult> {
  const zero: Omit<ToconlinePullResult, 'ok' | 'error'> = {
    imported: 0,
    skippedKnown: 0,
    skippedEcho: 0,
    previewed: 0,
  }
  const connection = await prisma.toconlineConnection.findFirst({
    where: { id: params.connectionId, officeId: params.officeId },
  })
  if (!connection) return { ok: false, ...zero, error: 'Ligação não encontrada' }
  if (connection.status === 'DISABLED') {
    return { ok: false, ...zero, error: 'A ligação TOConline está desligada' }
  }
  if (!connection.pullEnabled) {
    return { ok: false, ...zero, error: 'A importação de faturas emitidas está desligada nesta ligação' }
  }

  const client = new ToconlineClient({
    oauthUrl: connection.oauthUrl,
    apiUrl: connection.apiUrl,
    oauthClientId: connection.oauthClientId,
    oauthClientSecret: decryptToken(connection.oauthClientSecret),
    tokens: {
      accessToken: connection.accessToken ? decryptToken(connection.accessToken) : null,
      refreshToken: connection.refreshToken ? decryptToken(connection.refreshToken) : null,
      expiresAt: connection.tokenExpiresAt,
    },
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
    fetchImpl: deps.fetchImpl,
    // Dry-run [INV]: reading is allowed, writing is impossible
    readOnly: connection.dryRun,
  })

  const counts = { ...zero }
  const updatedSince = connection.lastPullAt
    ? new Date(connection.lastPullAt.getTime() - OVERLAP_MS).toISOString().slice(0, 10)
    : undefined

  // U4: the listing + PDF are the unified DocumentSourceConnector contract; the
  // dry-run/anti-echo/EntityMap orchestration below stays TOConline-specific
  // (the generic runner cannot model dry-run previews). Behaviour unchanged —
  // the SourceDocument carries the original attributes in `raw`.
  const connector = new ToconlineSourceConnector({ client, updatedSince, pageSize: PAGE_SIZE })

  try {
    let cursor: string | undefined
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { items: sourceDocs, nextCursor } = await connector.listIssuedDocuments(cursor)
      if (sourceDocs.length === 0) break

      for (const doc of sourceDocs) {
        const attributes = doc.raw as Record<string, unknown>
        const externalReference = str(attributes.external_reference)
        // [INV anti-echo] our own pushes never become Documents
        if (externalReference?.startsWith(ECHO_MARKER_PREFIX)) {
          counts.skippedEcho += 1
          continue
        }

        const known = await prisma.toconlineEntityMap.findUnique({
          where: {
            connectionId_entityType_externalKey: {
              connectionId: connection.id,
              entityType: 'SALES_DOCUMENT',
              externalKey: doc.externalId,
            },
          },
        })
        if (known) {
          counts.skippedKnown += 1
          continue
        }

        const mapped = mapSalesDocumentAttributes(doc.externalId, attributes)

        // Lines are a documented extra read — best effort, never fatal
        let documentLines: Array<Record<string, unknown>> | null = null
        try {
          const rawLines = await client.getSalesDocumentLines(doc.externalId)
          if (rawLines.length > 0) {
            documentLines = mapSalesDocumentLines(rawLines) as unknown as Array<Record<string, unknown>>
          }
        } catch {
          documentLines = null
        }

        const createData = buildDocumentCreateData({ connection, mapped, documentLines })

        if (connection.dryRun) {
          // Dry-run: record the Document that WOULD be created — nothing else
          await prisma.toconlinePushPreview.create({
            data: {
              connectionId: connection.id,
              documentId: null,
              endpoint: '/api/commercial_sales_documents',
              method: 'PULL',
              headers: {
                'Content-Type': 'application/vnd.api+json',
                Accept: 'application/json',
                Authorization: 'Bearer [REDACTED]',
              },
              body: createData as unknown as Prisma.InputJsonValue,
            },
          })
          counts.previewed += 1
          continue
        }

        // PDF (documented: url_for_print + public-file link) — best effort
        let r2Key: string | null = null
        try {
          const pdf = await connector.fetchPdf(doc.externalId)
          if (pdf) {
            r2Key = `${connection.officeId}/toconline-pull/${connection.id}/${doc.externalId}.pdf`
            await uploadToR2(r2Key, pdf, 'application/pdf')
          }
        } catch {
          r2Key = null // imported without PDF — documented fallback
        }

        await prisma.$transaction([
          prisma.document.create({
            data: {
              ...createData,
              r2Key,
              mimeType: r2Key ? 'application/pdf' : null,
              sizeBytes: null,
            },
          }),
          prisma.toconlineEntityMap.create({
            data: {
              connectionId: connection.id,
              entityType: 'SALES_DOCUMENT',
              externalKey: doc.externalId,
              toconlineId: doc.externalId,
            },
          }),
        ])
        counts.imported += 1
      }

      cursor = nextCursor ?? undefined
      if (cursor === undefined) break
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Erro desconhecido na importação'
    const message = sanitizePullError(raw, connection)
    await prisma.toconlineConnection.update({
      where: { id: connection.id },
      data: { lastError: message },
    })
    return { ok: false, ...counts, error: message }
  }

  // Run summary is auditable; lastPullAt only advances on full success so a
  // failed run is re-scanned next time (dedup makes the re-scan cheap)
  await prisma.auditLog.create({
    data: {
      officeId: connection.officeId,
      userId: params.userId,
      action: 'TOCONLINE_PULL_COMPLETED',
      entityType: 'ToconlineConnection',
      entityId: connection.id,
      metadata: { ...counts, dryRun: connection.dryRun },
    },
  })
  await prisma.toconlineConnection.update({
    where: { id: connection.id },
    data: { lastPullAt: new Date(), lastError: null },
  })
  return { ok: true, ...counts }
}
