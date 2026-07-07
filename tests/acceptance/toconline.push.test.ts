import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser, makeClient } from '../helpers/factories'
import { encryptToken, decryptToken } from '@/lib/crypto'
import {
  makeToconlineMock,
  makeForbiddenFetch,
  MOCK_OAUTH_URL,
  MOCK_API_URL,
  MOCK_CLIENT_ID,
  MOCK_CLIENT_SECRET,
  type ToconlineMock,
} from '../mocks/toconline-api'
import {
  assertPurchasePayloadMatchesContract,
  assertSupplierPayloadMatchesContract,
} from '../helpers/toconline-contract'

// 🔴RED — these modules do not exist until the implementation lands (TDD)
import { pushDocumentToToconline } from '@/server/toconline/toconline-push-service'
import { processToconlinePush } from '@/queues/toconline-push.processor'

/**
 * TOConline push flow [INV] suite. Every HTTP interaction runs against the
 * doc-derived mock in tests/mocks/toconline-api.ts — the real API was NEVER
 * called (doc-driven integration, see INTEGRATION_NOTES.md).
 */

const SUPPLIER_NIF = '509888777'
const SUPPLIER_NAME = 'Fornecedor Teste Lda'

async function seedBase(params?: { dryRun?: boolean; connection?: boolean }) {
  const office = await makeOffice()
  const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
  const client = await makeClient({ officeId: office.id, name: 'Cliente TOC', nif: '504426292' })
  const connection =
    params?.connection === false
      ? null
      : await prisma.toconlineConnection.create({
          data: {
            officeId: office.id,
            clientId: client.id,
            oauthUrl: MOCK_OAUTH_URL,
            apiUrl: MOCK_API_URL,
            oauthClientId: MOCK_CLIENT_ID,
            oauthClientSecret: encryptToken(MOCK_CLIENT_SECRET),
            dryRun: params?.dryRun ?? false,
          },
        })
  return { office, owner, client, connection }
}

/** VALIDATED received invoice: 81.34 @23% (18.71) + 45.67 @6% (2.74) = 148.46 */
async function makeInvoice(params: {
  officeId: string
  clientId: string
  vatBreakdown?: Array<{ region?: string; rate: number; baseCents: number; vatCents: number }>
  currency?: string
  withholdingAmount?: string
  documentNumber?: string
}) {
  return prisma.document.create({
    data: {
      officeId: params.officeId,
      clientId: params.clientId,
      status: 'VALIDATED',
      type: 'INVOICE_RECEIVED',
      source: 'MANUAL_UPLOAD',
      supplierName: SUPPLIER_NAME,
      supplierNif: SUPPLIER_NIF,
      documentNumber: params.documentNumber ?? 'FT 2026/123',
      issueDate: new Date('2026-06-15T12:00:00.000Z'),
      dueDate: new Date('2026-07-15T12:00:00.000Z'),
      currency: params.currency ?? 'EUR',
      totalAmount: '148.46',
      withholdingAmount: params.withholdingAmount ?? null,
      vatBreakdown:
        params.vatBreakdown ??
        ([
          { rate: 23, baseCents: 8134, vatCents: 1871 },
          { rate: 6, baseCents: 4567, vatCents: 274 },
        ] as never),
    },
  })
}

function purchasePostCalls(mock: ToconlineMock) {
  return mock.calls.filter(
    (c) => c.method === 'POST' && c.url === `${MOCK_API_URL}/api/v1/commercial_purchases_documents`,
  )
}

function supplierPostCalls(mock: ToconlineMock) {
  return mock.calls.filter((c) => c.method === 'POST' && c.url === `${MOCK_API_URL}/api/suppliers`)
}

describe('🔴RED TOConline — push de compras [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('TC.a [INV] fornecedor existente por NIF não é recriado', async () => {
    const { office, owner, client } = await seedBase()
    const doc = await makeInvoice({ officeId: office.id, clientId: client.id })
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: SUPPLIER_NIF, business_name: SUPPLIER_NAME }],
    })

    const result = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )

    expect(result.ok).toBe(true)
    expect(supplierPostCalls(mock)).toHaveLength(0) // never re-created
    expect(mock.state.suppliers).toHaveLength(1)

    // Lookup cached for future pushes
    const map = await prisma.toconlineEntityMap.findFirst({
      where: { entityType: 'SUPPLIER', nif: SUPPLIER_NIF },
    })
    expect(map?.toconlineId).toBe('7')

    // Purchase referenced the existing supplier id
    const posted = JSON.parse(purchasePostCalls(mock)[0].body!) as Record<string, unknown>
    expect(posted.supplier_id).toBe(7)
  })

  it('TC.b [INV] fatura 23%+6% gera linhas com bases certas ao cêntimo + contrato OpenAPI', async () => {
    const { office, owner, client } = await seedBase()
    const doc = await makeInvoice({ officeId: office.id, clientId: client.id })
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: SUPPLIER_NIF, business_name: SUPPLIER_NAME }],
    })

    const result = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(result.ok).toBe(true)

    const postCall = purchasePostCalls(mock)[0]
    expect(postCall).toBeDefined()
    // Exact euros at the API boundary — cents-driven, never float arithmetic
    expect(postCall.body).toContain('81.34')
    expect(postCall.body).toContain('45.67')

    const payload = JSON.parse(postCall.body!) as {
      document_type: string
      date: string
      due_date: string
      vat_included_prices: boolean
      external_reference: string
      lines: Array<{ quantity: number; unit_price: number; tax_percentage: number; tax_country_region: string }>
    }
    expect(payload.document_type).toBe('FC')
    expect(payload.date).toBe('2026-06-15')
    expect(payload.due_date).toBe('2026-07-15')
    expect(payload.vat_included_prices).toBe(false)
    expect(payload.external_reference).toBe(`GABIFY:${doc.id}`)
    expect(payload.lines).toHaveLength(2)
    expect(payload.lines[0].unit_price).toBe(81.34)
    expect(payload.lines[0].tax_percentage).toBe(23)
    expect(payload.lines[0].quantity).toBe(1)
    expect(payload.lines[1].unit_price).toBe(45.67)
    expect(payload.lines[1].tax_percentage).toBe(6)
    expect(payload.lines[0].tax_country_region).toBe('PT')

    // Contract: payload validates against the SAVED OpenAPI spec + doc page
    assertPurchasePayloadMatchesContract(payload as unknown as Record<string, unknown>)

    // Mandatory headers of the docs on the write call
    expect(postCall.headers['content-type']).toBe('application/vnd.api+json')
    expect(postCall.headers['accept']).toBe('application/json')

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(after.toconlinePushStatus).toBe('SENT')
    expect(after.toconlineDocumentId).toBeTruthy()
    expect(after.toconlinePushedAt).toBeInstanceOf(Date)
  })

  it('TC.c [INV] re-push de documento ENVIADO → no-op com aviso, zero chamadas', async () => {
    const { office, owner, client } = await seedBase()
    const doc = await makeInvoice({ officeId: office.id, clientId: client.id })
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: SUPPLIER_NIF, business_name: SUPPLIER_NAME }],
    })

    const first = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(first.ok).toBe(true)
    const callsAfterFirst = mock.calls.length

    const second = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(second.ok).toBe(true)
    if (second.ok && second.mode === 'LIVE') {
      expect(second.noop).toBe(true)
      expect(second.warning).toBeTruthy()
    } else {
      throw new Error('expected LIVE no-op result')
    }
    expect(mock.calls.length).toBe(callsAfterFirst) // no HTTP at all
    expect(mock.state.purchases).toHaveLength(1)
  })

  it('TC.d [INV] falha pós-criação de fornecedor → retry retoma sem duplicar fornecedor', async () => {
    const { office, owner, client } = await seedBase()
    const doc = await makeInvoice({ officeId: office.id, clientId: client.id })
    const mock = makeToconlineMock() // no suppliers yet
    // Purchase creation fails hard (beyond the client's retries)
    mock.failNext(/\/api\/v1\/commercial_purchases_documents$/, 500, 10)

    const first = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(first.ok).toBe(false)
    expect(mock.state.suppliers).toHaveLength(1) // supplier WAS created
    const supplierPost = supplierPostCalls(mock)[0]
    assertSupplierPayloadMatchesContract(JSON.parse(supplierPost.body!) as Record<string, unknown>)

    const failed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(failed.toconlinePushStatus).toBe('ERROR')
    expect(failed.toconlinePushError).toBeTruthy()

    // Supplier creation is an external action — audited BEFORE it happened
    const supplierAudit = await prisma.auditLog.findFirst({
      where: { officeId: office.id, action: 'TOCONLINE_SUPPLIER_CREATED' },
    })
    expect(supplierAudit).not.toBeNull()

    // Retry: resumes at step 2 (purchase) — EntityMap prevents re-creating
    const second = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(second.ok).toBe(true)
    expect(mock.state.suppliers).toHaveLength(1) // still exactly one
    expect(supplierPostCalls(mock)).toHaveLength(1)
    expect(mock.state.purchases).toHaveLength(1)

    const recovered = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(recovered.toconlinePushStatus).toBe('SENT')
  })

  it('TC.e [INV] token expirado → refresh e repetição transparente', async () => {
    const { office, owner, client, connection } = await seedBase()
    const doc = await makeInvoice({ officeId: office.id, clientId: client.id })
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: SUPPLIER_NIF, business_name: SUPPLIER_NAME }],
    })
    // Seed a stale access token (unknown to the mock → 401) + a refresh token
    // the mock accepts; expiry claims the token is still fine, so the client
    // only discovers staleness on the 401 — must recover transparently.
    const staleAccess = 'stale-access-token-not-valid-anymore'
    const seededRefresh = 'seeded-valid-refresh-token'
    mock.state.validRefreshTokens.add(seededRefresh)
    await prisma.toconlineConnection.update({
      where: { id: connection!.id },
      data: {
        accessToken: encryptToken(staleAccess),
        refreshToken: encryptToken(seededRefresh),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    })

    const result = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(result.ok).toBe(true)
    expect(mock.state.tokenGrants).toContain('refresh_token')
    expect(mock.state.purchases).toHaveLength(1)

    // Rotated tokens persisted (encrypted, never plaintext)
    const updated = await prisma.toconlineConnection.findUniqueOrThrow({
      where: { id: connection!.id },
    })
    expect(updated.accessToken).not.toBeNull()
    expect(updated.accessToken).not.toContain(staleAccess)
    expect(decryptToken(updated.accessToken!)).not.toBe(staleAccess)
    // Refresh response example in the docs has no refresh_token — keep the old
    expect(decryptToken(updated.refreshToken!)).toBe(seededRefresh)
  })

  it('TC.f [INV] dry-run → NENHUMA chamada HTTP; preview com pedido exato e sem segredos', async () => {
    const { office, owner, client, connection } = await seedBase({ dryRun: true })
    const doc = await makeInvoice({ officeId: office.id, clientId: client.id })
    const forbidden = makeForbiddenFetch()

    const result = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: forbidden.fetchImpl },
    )

    expect(forbidden.calls).toHaveLength(0) // zero network — the [INV]
    expect(result.ok).toBe(true)
    if (result.ok && result.mode !== 'DRY_RUN') throw new Error('expected DRY_RUN mode')

    const previews = await prisma.toconlinePushPreview.findMany({
      where: { connectionId: connection!.id, documentId: doc.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(previews.length).toBeGreaterThanOrEqual(1)
    const purchasePreview = previews.find(
      (p) => p.endpoint === '/api/v1/commercial_purchases_documents' && p.method === 'POST',
    )
    expect(purchasePreview).toBeDefined()

    const body = purchasePreview!.body as Record<string, unknown>
    assertPurchasePayloadMatchesContract(body)
    const lines = body.lines as Array<{ unit_price: number; tax_percentage: number }>
    expect(lines[0].unit_price).toBe(81.34)
    expect(lines[1].unit_price).toBe(45.67)

    // Headers recorded but secret-free
    const headersJson = JSON.stringify(purchasePreview!.headers)
    expect(headersJson).not.toContain(MOCK_CLIENT_SECRET)
    expect(headersJson.toLowerCase()).not.toMatch(/bearer [a-z0-9]/i)

    // Dry-run never claims the document was sent
    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(after.toconlinePushStatus).not.toBe('SENT')
    expect(after.toconlineDocumentId).toBeNull()
  })

  it('TC.g [INV] credenciais nunca aparecem em logs, AuditLog, erros ou previews', async () => {
    const logSpy = vi.spyOn(console, 'log')
    const warnSpy = vi.spyOn(console, 'warn')
    const errorSpy = vi.spyOn(console, 'error')

    const { office, owner, client, connection } = await seedBase()
    const doc = await makeInvoice({ officeId: office.id, clientId: client.id })
    const failingDoc = await makeInvoice({
      officeId: office.id,
      clientId: client.id,
      documentNumber: 'FT 2026/124',
    })
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: SUPPLIER_NIF, business_name: SUPPLIER_NAME }],
    })

    const okResult = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(okResult.ok).toBe(true)

    mock.failNext(/commercial_purchases_documents$/, 500, 10)
    const failResult = await pushDocumentToToconline(
      { documentId: failingDoc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(failResult.ok).toBe(false)

    const issuedTokens = [...mock.state.validAccessTokens, ...mock.state.validRefreshTokens]
    const secrets = [MOCK_CLIENT_SECRET, ...issuedTokens]

    const consoleOutput = JSON.stringify([
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ])
    const auditRows = await prisma.auditLog.findMany({ where: { officeId: office.id } })
    const previews = await prisma.toconlinePushPreview.findMany({
      where: { connectionId: connection!.id },
    })
    const updatedDoc = await prisma.document.findUniqueOrThrow({ where: { id: failingDoc.id } })
    const updatedConnection = await prisma.toconlineConnection.findUniqueOrThrow({
      where: { id: connection!.id },
    })

    const haystacks: Array<[string, string]> = [
      ['console', consoleOutput],
      ['auditLog', JSON.stringify(auditRows)],
      ['previews', JSON.stringify(previews)],
      ['document.toconlinePushError', updatedDoc.toconlinePushError ?? ''],
      ['connection.lastError', updatedConnection.lastError ?? ''],
      ['push result error', failResult.ok ? '' : failResult.error],
    ]
    for (const [label, haystack] of haystacks) {
      for (const secret of secrets) {
        expect(haystack, `${label} must never contain credentials`).not.toContain(secret)
      }
    }
  })

  it('TC.h AuditLog do push existe ANTES do POST de criação do documento', async () => {
    const { office, owner, client } = await seedBase()
    const doc = await makeInvoice({ officeId: office.id, clientId: client.id })
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: SUPPLIER_NIF, business_name: SUPPLIER_NAME }],
    })

    let auditPresentAtPostTime: boolean | null = null
    const wrappedFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (init?.method === 'POST' && url.endsWith('/api/v1/commercial_purchases_documents')) {
        const count = await prisma.auditLog.count({
          where: { officeId: office.id, action: 'TOCONLINE_PUSH_STARTED', entityId: doc.id },
        })
        auditPresentAtPostTime = count > 0
      }
      return mock.fetchImpl(input, init)
    }

    const result = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: wrappedFetch },
    )
    expect(result.ok).toBe(true)
    expect(auditPresentAtPostTime).toBe(true)
  })

  it('TC.i idempotência remota: documento já no TOConline (estado local perdido) → reutiliza sem duplicar', async () => {
    const { office, owner, client } = await seedBase()
    const doc = await makeInvoice({ officeId: office.id, clientId: client.id })
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: SUPPLIER_NIF, business_name: SUPPLIER_NAME }],
      purchases: [
        {
          id: '900',
          status: 1,
          supplier_tax_registration_number: SUPPLIER_NIF,
          external_reference: '', // filled below — needs doc.id
        },
      ],
    })
    mock.state.purchases[0].external_reference = `GABIFY:${doc.id}`

    const result = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(result.ok).toBe(true)
    expect(purchasePostCalls(mock)).toHaveLength(0) // nothing re-created
    expect(mock.state.purchases).toHaveLength(1)

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(after.toconlinePushStatus).toBe('SENT')
    expect(after.toconlineDocumentId).toBe('900')
  })

  it('TC.j linha isenta (0%) → erro claro sem escrita (motivo de isenção não suportado na v1)', async () => {
    const { office, owner, client } = await seedBase()
    const doc = await makeInvoice({
      officeId: office.id,
      clientId: client.id,
      vatBreakdown: [
        { rate: 23, baseCents: 8134, vatCents: 1871 },
        { rate: 0, baseCents: 4567, vatCents: 0 },
      ],
    })
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: SUPPLIER_NIF, business_name: SUPPLIER_NAME }],
    })

    const result = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.toLowerCase()).toContain('isen')
    expect(purchasePostCalls(mock)).toHaveLength(0)
    expect(supplierPostCalls(mock)).toHaveLength(0)

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(after.toconlinePushStatus).toBe('ERROR')
  })

  it('TC.k moeda diferente de EUR → erro claro sem chamadas', async () => {
    const { office, owner, client } = await seedBase()
    const doc = await makeInvoice({ officeId: office.id, clientId: client.id, currency: 'USD' })
    const mock = makeToconlineMock()

    const result = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('EUR')
    expect(mock.apiCalls()).toHaveLength(0)

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(after.toconlinePushStatus).toBe('ERROR')
  })

  it('TC.l retenção na fonte entra como retention_total em euros exatos', async () => {
    const { office, owner, client } = await seedBase()
    const doc = await makeInvoice({
      officeId: office.id,
      clientId: client.id,
      withholdingAmount: '14.85',
    })
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: SUPPLIER_NIF, business_name: SUPPLIER_NAME }],
    })

    const result = await pushDocumentToToconline(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(result.ok).toBe(true)
    const payload = JSON.parse(purchasePostCalls(mock)[0].body!) as Record<string, unknown>
    expect(payload.retention_total).toBe(14.85)
    assertPurchasePayloadMatchesContract(payload)
  })

  it('TC.m processor regista JobLog início/fim e é idempotente em retry', async () => {
    const { office, owner, client } = await seedBase()
    const doc = await makeInvoice({ officeId: office.id, clientId: client.id })
    const mock = makeToconlineMock({
      suppliers: [{ id: '7', tax_registration_number: SUPPLIER_NIF, business_name: SUPPLIER_NAME }],
    })

    await processToconlinePush(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      'job-tc-1',
      { fetchImpl: mock.fetchImpl },
    )
    const jobLog = await prisma.jobLog.findFirst({
      where: { officeId: office.id, queue: 'toconline-push', jobId: 'job-tc-1' },
    })
    expect(jobLog?.status).toBe('COMPLETED')
    expect(jobLog?.startedAt).toBeInstanceOf(Date)
    expect(jobLog?.completedAt).toBeInstanceOf(Date)

    // Retry of the same document: no duplicate purchase, still completes
    await processToconlinePush(
      { documentId: doc.id, officeId: office.id, userId: owner.id },
      'job-tc-2',
      { fetchImpl: mock.fetchImpl },
    )
    expect(mock.state.purchases).toHaveLength(1)
    const second = await prisma.jobLog.findFirst({
      where: { officeId: office.id, queue: 'toconline-push', jobId: 'job-tc-2' },
    })
    expect(second?.status).toBe('COMPLETED')
  })
})
