import { prisma } from '@/lib/prisma'
import { decryptToken, encryptToken } from '@/lib/crypto'
import { euroNumberFromCents } from '@/lib/money'
import { isValidNif } from '@/lib/nif'
import { ToconlineClient } from './toconline-client'
import type { Document, ToconlineConnection } from '@prisma/client'

/**
 * TOConline purchase push (v1) — doc-driven, NEVER tested against the real
 * API (INTEGRATION_NOTES.md). Pushes a VALIDATED received invoice as a
 * finalized purchase document (`document_type: FC`) built from the cents-exact
 * `vatBreakdown` (A1): euros appear ONLY at the API boundary.
 *
 * Idempotency [INV]:
 * - locally: a SENT document is never pushed again (no-op with warning);
 * - remotely: before creating, the documented filter (finalized purchases of
 *   the supplier's NIF) is searched for our `external_reference` marker
 *   `GABIFY:<documentId>` — a lost local state never duplicates a purchase;
 * - half-failures: the supplier id is cached in ToconlineEntityMap, so a retry
 *   resumes at the purchase step without re-creating the supplier.
 *
 * Dry-run [INV]: connections are born with dryRun=true — the flow runs fully
 * but writes the exact requests to ToconlinePushPreview and NEVER touches the
 * network.
 */

export const TOCONLINE_PUSH_ELIGIBLE_STATUSES = ['VALIDATED', 'EXPORTED'] as const
export const TOCONLINE_PUSH_ELIGIBLE_TYPES = ['INVOICE_RECEIVED', 'INVOICE_RECEIPT'] as const

const EXTERNAL_REFERENCE_PREFIX = 'GABIFY:'
const PURCHASES_CREATE_PATH = '/api/v1/commercial_purchases_documents'

export interface ToconlinePushDeps {
  fetchImpl?: typeof fetch
}

export type ToconlinePushOutcome =
  | { ok: true; mode: 'DRY_RUN'; previewId: string }
  | { ok: true; mode: 'LIVE'; toconlineDocumentId: string; noop: boolean; warning?: string }
  | { ok: false; error: string }

interface VatBand {
  region?: string
  rate: number
  baseCents: number
  vatCents: number
}

interface EligibleDocument {
  doc: Document
  bands: VatBand[]
  supplierNif: string
  supplierName: string
  issueDate: Date
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function externalReference(documentId: string): string {
  return `${EXTERNAL_REFERENCE_PREFIX}${documentId}`
}

function centsOfDecimal(value: unknown): number {
  if (value === null || value === undefined) return 0
  return Math.round(Number(value) * 100)
}

/**
 * Human-readable PT eligibility check; null = eligible. Exported so the push
 * route can pre-validate per item (defense in depth — the service re-checks).
 */
export function getPushEligibilityError(doc: Document): string | null {
  if (!TOCONLINE_PUSH_ELIGIBLE_STATUSES.includes(doc.status as never)) {
    return `Só documentos validados podem ser enviados (estado atual: ${doc.status})`
  }
  if (!TOCONLINE_PUSH_ELIGIBLE_TYPES.includes(doc.type as never)) {
    return 'Só faturas recebidas podem ser enviadas para o TOConline nesta versão'
  }
  if (doc.currency !== 'EUR') {
    return `Só documentos em EUR são suportados nesta versão (moeda: ${doc.currency})`
  }
  if (!doc.issueDate) {
    return 'Documento sem data de emissão — corrija na revisão antes de enviar'
  }
  if (!doc.supplierNif || !isValidNif(doc.supplierNif)) {
    return 'Documento sem NIF de fornecedor válido — corrija na revisão antes de enviar'
  }
  if (!doc.supplierName) {
    return 'Documento sem nome de fornecedor — corrija na revisão antes de enviar'
  }
  const bands = (doc.vatBreakdown as unknown as VatBand[] | null) ?? []
  if (!Array.isArray(bands) || bands.length === 0) {
    return 'Documento sem linhas de IVA (vatBreakdown) — corrija na revisão antes de enviar'
  }
  for (const band of bands) {
    if (typeof band.rate !== 'number' || typeof band.baseCents !== 'number') {
      return 'Linhas de IVA incompletas — corrija na revisão antes de enviar'
    }
    if (band.rate === 0) {
      // The API requires tax_exemption_reason_id for exempt lines and the legal
      // reason is not derivable from the document — not supported in v1
      // (INTEGRATION_NOTES.md #5). Never guess fiscal reasons.
      return 'Linha isenta de IVA (0%) requer motivo de isenção — não suportado nesta versão'
    }
  }
  return null
}

/**
 * Pure payload builder — every field exists in the saved spec/doc page
 * (contract-tested). `supplier` is either the resolved TOConline id (live) or
 * the NIF+name creation variant documented for the same POST (dry-run, where
 * no lookup is possible without touching the network).
 */
export function buildPurchaseDocumentPayload(
  input: EligibleDocument,
  supplier: { supplierId: number } | { nif: string; businessName: string },
): Record<string, unknown> {
  const { doc, bands } = input
  const documentLabel = doc.documentNumber ?? doc.id
  const withholdingCents = centsOfDecimal(doc.withholdingAmount)

  const lines = bands.map((band) => ({
    description: `Fatura ${documentLabel} — IVA ${band.rate}%`,
    quantity: 1,
    unit_price: euroNumberFromCents(band.baseCents), // cents → euros HERE only
    tax_percentage: band.rate,
    tax_country_region: band.region ?? 'PT',
  }))

  return {
    document_type: 'FC',
    date: isoDate(input.issueDate),
    ...(doc.dueDate ? { due_date: isoDate(doc.dueDate) } : {}),
    ...('supplierId' in supplier
      ? { supplier_id: supplier.supplierId }
      : {
          supplier_tax_registration_number: supplier.nif,
          supplier_business_name: supplier.businessName,
        }),
    external_reference: externalReference(doc.id),
    notes: `Criado pelo Gabify a partir do documento ${documentLabel}`,
    vat_included_prices: false,
    ...(withholdingCents > 0 ? { retention_total: euroNumberFromCents(withholdingCents) } : {}),
    lines,
  }
}

/** Headers recorded in previews/audits — Authorization always redacted. */
function redactedApiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/json',
    Authorization: 'Bearer [REDACTED]',
  }
}

function sanitizeError(message: string, connection: ToconlineConnection): string {
  let out = message
  const candidates: string[] = []
  try {
    candidates.push(decryptToken(connection.oauthClientSecret))
  } catch {
    // undecryptable secret cannot leak
  }
  for (const enc of [connection.accessToken, connection.refreshToken]) {
    if (!enc) continue
    try {
      candidates.push(decryptToken(enc))
    } catch {
      // ignore
    }
  }
  for (const secret of candidates) {
    if (secret && secret.length > 3) out = out.split(secret).join('[REDACTED]')
  }
  return out
}

async function markDocumentError(documentId: string, error: string): Promise<void> {
  await prisma.document.update({
    where: { id: documentId },
    data: { toconlinePushStatus: 'ERROR', toconlinePushError: error },
  })
}

async function resolveSupplierId(params: {
  client: ToconlineClient
  connection: ToconlineConnection
  officeId: string
  userId: string | null
  nif: string
  businessName: string
}): Promise<string> {
  const { client, connection, nif } = params

  const cached = await prisma.toconlineEntityMap.findUnique({
    where: {
      connectionId_entityType_nif: {
        connectionId: connection.id,
        entityType: 'SUPPLIER',
        nif,
      },
    },
  })
  if (cached) return cached.toconlineId

  const existing = await client.getSupplierByNif(nif)
  let toconlineId: string
  if (existing) {
    toconlineId = existing.id
  } else {
    // External action — audit BEFORE the POST (house rule)
    await prisma.auditLog.create({
      data: {
        officeId: params.officeId,
        userId: params.userId,
        action: 'TOCONLINE_SUPPLIER_CREATED',
        entityType: 'ToconlineConnection',
        entityId: connection.id,
        metadata: { nif, businessName: params.businessName },
      },
    })
    const created = await client.createSupplier({ nif, businessName: params.businessName })
    toconlineId = created.id
  }

  await prisma.toconlineEntityMap.upsert({
    where: {
      connectionId_entityType_nif: {
        connectionId: connection.id,
        entityType: 'SUPPLIER',
        nif,
      },
    },
    create: {
      connectionId: connection.id,
      entityType: 'SUPPLIER',
      nif,
      toconlineId,
    },
    update: { toconlineId },
  })
  return toconlineId
}

async function runDryRun(
  input: EligibleDocument,
  connection: ToconlineConnection,
): Promise<ToconlinePushOutcome> {
  // Whole flow WITHOUT network: record the exact requests that would be sent.
  // The purchase uses the documented NIF+name variant of the same POST — the
  // internal supplier id cannot be known without calling the API.
  const lookupPreview = await prisma.toconlinePushPreview.create({
    data: {
      connectionId: connection.id,
      documentId: input.doc.id,
      endpoint: `/api/suppliers?filter[tax_registration_number]=${encodeURIComponent(input.supplierNif)}`,
      method: 'GET',
      headers: redactedApiHeaders(),
      body: {},
    },
  })
  const payload = buildPurchaseDocumentPayload(input, {
    nif: input.supplierNif,
    businessName: input.supplierName,
  })
  const purchasePreview = await prisma.toconlinePushPreview.create({
    data: {
      connectionId: connection.id,
      documentId: input.doc.id,
      endpoint: PURCHASES_CREATE_PATH,
      method: 'POST',
      headers: redactedApiHeaders(),
      body: payload as object,
    },
  })
  void lookupPreview
  return { ok: true, mode: 'DRY_RUN', previewId: purchasePreview.id }
}

async function markDocumentSent(documentId: string, toconlineDocumentId: string): Promise<void> {
  await prisma.document.update({
    where: { id: documentId },
    data: {
      toconlinePushStatus: 'SENT',
      toconlineDocumentId,
      toconlinePushedAt: new Date(),
      toconlinePushError: null,
    },
  })
}

export async function pushDocumentToToconline(
  params: { documentId: string; officeId: string; userId: string | null },
  deps: ToconlinePushDeps = {},
): Promise<ToconlinePushOutcome> {
  const doc = await prisma.document.findFirst({
    where: { id: params.documentId, officeId: params.officeId, deletedAt: null },
  })
  if (!doc) return { ok: false, error: 'Documento não encontrado' }

  // Local idempotency [INV]: SENT is final — re-push is a warned no-op
  if (doc.toconlinePushStatus === 'SENT' && doc.toconlineDocumentId) {
    return {
      ok: true,
      mode: 'LIVE',
      toconlineDocumentId: doc.toconlineDocumentId,
      noop: true,
      warning: 'Documento já enviado para o TOConline — nada foi feito',
    }
  }

  if (!doc.clientId) {
    const error = 'Documento sem cliente associado — associe um cliente antes de enviar'
    await markDocumentError(doc.id, error)
    return { ok: false, error }
  }
  const connection = await prisma.toconlineConnection.findFirst({
    where: { clientId: doc.clientId, officeId: params.officeId },
  })
  if (!connection) {
    const error = 'O cliente não tem ligação TOConline configurada'
    await markDocumentError(doc.id, error)
    return { ok: false, error }
  }
  if (connection.status === 'DISABLED') {
    const error = 'A ligação TOConline deste cliente está desligada'
    await markDocumentError(doc.id, error)
    return { ok: false, error }
  }

  const ineligible = getPushEligibilityError(doc)
  if (ineligible) {
    await markDocumentError(doc.id, ineligible)
    return { ok: false, error: ineligible }
  }
  const input: EligibleDocument = {
    doc,
    bands: doc.vatBreakdown as unknown as VatBand[],
    supplierNif: doc.supplierNif!,
    supplierName: doc.supplierName!,
    issueDate: doc.issueDate!,
  }

  // Dry-run [INV]: zero network — deps.fetchImpl is deliberately not touched
  if (connection.dryRun) {
    return runDryRun(input, connection)
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
  })

  try {
    await prisma.document.update({
      where: { id: doc.id },
      data: { toconlinePushStatus: 'PENDING' },
    })

    // Step 1 — supplier (cached in EntityMap so retries never duplicate [INV])
    const supplierId = await resolveSupplierId({
      client,
      connection,
      officeId: params.officeId,
      userId: params.userId,
      nif: input.supplierNif,
      businessName: input.supplierName,
    })

    // Remote idempotency [INV] — documented filter: finalized purchases of
    // this supplier's NIF, matched on our external_reference marker
    const marker = externalReference(doc.id)
    const existing = await client.listFinalizedPurchasesBySupplierNif(input.supplierNif)
    const match = existing.find((p) => p.externalReference === marker)
    if (match) {
      await markDocumentSent(doc.id, match.id)
      return {
        ok: true,
        mode: 'LIVE',
        toconlineDocumentId: match.id,
        noop: true,
        warning: 'Documento já existia no TOConline — associado sem criar duplicado',
      }
    }

    // JSONAPI ids are strings; the purchases POST documents a numeric
    // supplier_id (INTEGRATION_NOTES.md #6) — convert and validate
    const numericSupplierId = Number(supplierId)
    if (!Number.isInteger(numericSupplierId) || numericSupplierId <= 0) {
      throw new Error('Fornecedor TOConline com id inesperado (não numérico)')
    }
    const payload = buildPurchaseDocumentPayload(input, { supplierId: numericSupplierId })

    // AuditLog BEFORE the external create (house rule / prompt requirement)
    await prisma.auditLog.create({
      data: {
        officeId: params.officeId,
        userId: params.userId,
        action: 'TOCONLINE_PUSH_STARTED',
        entityType: 'Document',
        entityId: doc.id,
        metadata: {
          connectionId: connection.id,
          endpoint: PURCHASES_CREATE_PATH,
          externalReference: marker,
          supplierNif: input.supplierNif,
          lineCount: input.bands.length,
        },
      },
    })

    const created = await client.createPurchaseDocument(payload)
    await markDocumentSent(doc.id, created.id)
    return { ok: true, mode: 'LIVE', toconlineDocumentId: created.id, noop: false }
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Erro desconhecido no envio'
    const message = sanitizeError(raw, connection)
    await markDocumentError(doc.id, message)
    await prisma.toconlineConnection.update({
      where: { id: connection.id },
      data: { lastError: message },
    })
    return { ok: false, error: message }
  }
}
