import { prisma } from '@/lib/prisma'
import { decryptToken, encryptToken } from '@/lib/crypto'
import { centsFromUnknown, decimalStringFromCents } from '@/lib/money'
import { uploadToR2 } from '@/lib/r2'
import { ToconlineClient } from './toconline-client'
import type { Prisma, ToconlineConnection } from '@prisma/client'

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

interface VatBand {
  region?: string
  rate: number
  baseCents: number
  vatCents: number
}

interface MappedSalesDocument {
  toconlineId: string
  documentNumber: string
  documentType: string
  issueDate: Date | null
  dueDate: Date | null
  currency: string
  totalCents: number
  netCents: number
  vatCents: number
  withholdingCents: number
  buyerName: string | null
  buyerNif: string | null
  vatBreakdown: VatBand[]
  externalReference: string | null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function dateAtUtcNoon(value: unknown): Date | null {
  const s = str(value)
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null
  return new Date(`${s.slice(0, 10)}T12:00:00.000Z`)
}

/**
 * Pure mapping of the documented sales-document header attributes
 * (docs/apis_versoes-anteriores_vendas_documentos-de-venda.md response
 * example) into our shape. VAT bands come from the per-rate header fields
 * vat_incidence_{ise,red,int,nor} / vat_total_* / vat_percentage_* — euros
 * converted to integer cents HERE and nowhere else.
 */
export function mapSalesDocumentAttributes(
  toconlineId: string,
  attrs: Record<string, unknown>,
): MappedSalesDocument {
  const region = str(attrs.customer_tax_country_region) ?? str(attrs.operation_country) ?? 'PT'

  const bands: VatBand[] = []
  const bandSpecs = [
    { incidence: 'vat_incidence_ise', total: null, percentage: null, fixedRate: 0 },
    { incidence: 'vat_incidence_red', total: 'vat_total_red', percentage: 'vat_percentage_red' },
    { incidence: 'vat_incidence_int', total: 'vat_total_int', percentage: 'vat_percentage_int' },
    { incidence: 'vat_incidence_nor', total: 'vat_total_nor', percentage: 'vat_percentage_nor' },
  ] as const
  for (const spec of bandSpecs) {
    const baseCents = centsFromUnknown(attrs[spec.incidence]) ?? 0
    if (baseCents === 0) continue
    const vatCents = spec.total ? (centsFromUnknown(attrs[spec.total]) ?? 0) : 0
    const rate =
      'fixedRate' in spec
        ? spec.fixedRate
        : ((): number => {
            const p = attrs[spec.percentage as string]
            const n = typeof p === 'number' ? p : Number(str(p) ?? NaN)
            return Number.isFinite(n) ? n : 0
          })()
    bands.push({ region, rate, baseCents, vatCents })
  }

  return {
    toconlineId,
    documentNumber: str(attrs.document_no) ?? `TOC-${toconlineId}`,
    documentType: str(attrs.document_type) ?? 'FT',
    issueDate: dateAtUtcNoon(attrs.date),
    dueDate: dateAtUtcNoon(attrs.due_date),
    currency: str(attrs.currency_iso_code) ?? 'EUR',
    totalCents: centsFromUnknown(attrs.gross_total) ?? 0,
    netCents: centsFromUnknown(attrs.net_total) ?? 0,
    vatCents: centsFromUnknown(attrs.tax_payable) ?? 0,
    withholdingCents: centsFromUnknown(attrs.retention_value) ?? 0,
    buyerName: str(attrs.customer_business_name),
    buyerNif: str(attrs.customer_tax_registration_number),
    vatBreakdown: bands,
    externalReference: str(attrs.external_reference),
  }
}

/** Line attributes (documented table) → house convention (integer cents). */
export function mapSalesDocumentLines(
  lines: Array<Record<string, unknown>>,
): Array<{ description: string; qty: number; unitPriceCents: number; vatRate: number; totalCents: number }> {
  return lines.map((line) => {
    const qty = typeof line.quantity === 'number' ? line.quantity : Number(str(line.quantity) ?? 1)
    const rate =
      typeof line.tax_percentage === 'number'
        ? line.tax_percentage
        : Number(str(line.tax_percentage) ?? 0)
    return {
      description: str(line.description) ?? '',
      qty: Number.isFinite(qty) ? qty : 1,
      unitPriceCents: centsFromUnknown(line.unit_price) ?? 0,
      vatRate: Number.isFinite(rate) ? rate : 0,
      totalCents: centsFromUnknown(line.amount) ?? 0,
    }
  })
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

  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const items = await client.listFinalizedSalesDocuments({
        pageNumber: page,
        pageSize: PAGE_SIZE,
        updatedSince,
      })
      if (items.length === 0) break

      for (const item of items) {
        const externalReference = str(item.attributes.external_reference)
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
              externalKey: item.id,
            },
          },
        })
        if (known) {
          counts.skippedKnown += 1
          continue
        }

        const mapped = mapSalesDocumentAttributes(item.id, item.attributes)

        // Lines are a documented extra read — best effort, never fatal
        let documentLines: Array<Record<string, unknown>> | null = null
        try {
          const rawLines = await client.getSalesDocumentLines(item.id)
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
          const pdfUrl = await client.getSalesDocumentPdfUrl(item.id)
          if (pdfUrl) {
            const pdf = await client.downloadPublicFile(pdfUrl)
            r2Key = `${connection.officeId}/toconline-pull/${connection.id}/${item.id}.pdf`
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
              externalKey: item.id,
              toconlineId: item.id,
            },
          }),
        ])
        counts.imported += 1
      }

      if (items.length < PAGE_SIZE) break
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
