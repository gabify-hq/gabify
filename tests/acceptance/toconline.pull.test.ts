import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser, makeClient } from '../helpers/factories'
import { encryptToken } from '@/lib/crypto'
import {
  makeToconlineMock,
  makeReadOnlyProbeFetch,
  MOCK_OAUTH_URL,
  MOCK_API_URL,
  MOCK_CLIENT_ID,
  MOCK_CLIENT_SECRET,
  MOCK_PDF_BYTES,
  type MockSalesDocument,
} from '../mocks/toconline-api'
import { salesDocumentAttributes } from '../fixtures/toconline/responses'

// The AI pipeline must NEVER run for API_PULL documents [INV] — any touch fails
vi.mock('@/lib/anthropic', () => ({
  anthropic: new Proxy(
    {},
    {
      get() {
        throw new Error('AI pipeline touched during API pull — [INV] violated')
      },
    },
  ),
  CLAUDE_MODEL: 'claude-test',
}))

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  getToconlinePushQueue: () => ({ add: queueAddMock }),
  getToconlinePullQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  QUEUE_SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  QUEUE_TOCONLINE_PUSH: 'toconline-push',
  QUEUE_TOCONLINE_PULL: 'toconline-pull',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())

// 🔴RED — modules do not exist until the implementation lands (TDD)
import { pullSalesDocumentsForConnection } from '@/server/toconline/toconline-pull-service'
import { processToconlinePull } from '@/queues/toconline-pull.processor'

/** 23%+6% issued invoice built from the documented header vat fields. */
function invoice2346(id: string, overrides: Partial<MockSalesDocument['attributes']> = {}): MockSalesDocument {
  return {
    id,
    attributes: salesDocumentAttributes({
      document_no: `FT 2026/${id}`,
      date: '2026-06-20',
      due_date: '2026-07-20',
      gross_total: 148.46,
      net_total: 127.01,
      tax_payable: 21.45,
      vat_incidence_nor: 81.34,
      vat_total_nor: 18.71,
      vat_percentage_nor: 23.0,
      vat_incidence_red: 45.67,
      vat_total_red: 2.74,
      vat_percentage_red: 6.0,
      customer_business_name: 'Cliente Final Lda',
      customer_tax_registration_number: '229659179',
      ...overrides,
    }),
    lines: [
      {
        id: `${id}-l1`,
        description: 'Serviço A',
        quantity: 1,
        unit_price: 81.34,
        amount: 100.05,
        tax_percentage: 23,
        tax_country_region: 'PT',
      },
      {
        id: `${id}-l2`,
        description: 'Serviço B',
        quantity: 1,
        unit_price: 45.67,
        amount: 48.41,
        tax_percentage: 6,
        tax_country_region: 'PT',
      },
    ],
  }
}

async function seedBase(params?: { dryRun?: boolean; pullEnabled?: boolean }) {
  const office = await makeOffice()
  const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
  const client = await makeClient({ officeId: office.id, name: 'Cliente Pull' })
  const connection = await prisma.toconlineConnection.create({
    data: {
      officeId: office.id,
      clientId: client.id,
      oauthUrl: MOCK_OAUTH_URL,
      apiUrl: MOCK_API_URL,
      oauthClientId: MOCK_CLIENT_ID,
      oauthClientSecret: encryptToken(MOCK_CLIENT_SECRET),
      dryRun: params?.dryRun ?? false,
      pullEnabled: params?.pullEnabled ?? true,
    },
  })
  return { office, owner, client, connection }
}

describe('🔴RED TOConline — pull de faturas emitidas [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
    queueAddMock.mockReset()
  })

  it('TP.a [INV anti-eco] documentos com marcador GABIFY: nunca criam Document', async () => {
    const { office, owner, connection } = await seedBase()
    const mock = makeToconlineMock({
      salesDocuments: [
        invoice2346('301'),
        invoice2346('302', { external_reference: 'GABIFY:doc-interno-abc' }),
      ],
    })

    const result = await pullSalesDocumentsForConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(result.ok).toBe(true)
    expect(result.imported).toBe(1)
    expect(result.skippedEcho).toBe(1)

    const docs = await prisma.document.findMany({ where: { officeId: office.id } })
    expect(docs).toHaveLength(1)
    expect(docs[0].documentNumber).toBe('FT 2026/301')
  })

  it('TP.b [INV dedup] segundo pull do mesmo id → zero novos (EntityMap SALES_DOCUMENT)', async () => {
    const { office, owner, connection } = await seedBase()
    const mock = makeToconlineMock({
      salesDocuments: [invoice2346('310'), invoice2346('311')],
    })

    const first = await pullSalesDocumentsForConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(first.imported).toBe(2)

    const second = await pullSalesDocumentsForConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(second.ok).toBe(true)
    expect(second.imported).toBe(0)
    expect(second.skippedKnown).toBe(2)

    expect(await prisma.document.count({ where: { officeId: office.id } })).toBe(2)
    expect(
      await prisma.toconlineEntityMap.count({
        where: { connectionId: connection.id, entityType: 'SALES_DOCUMENT' },
      }),
    ).toBe(2)
  })

  it('TP.c [INV cêntimos] fatura 23%+6% → vatBreakdown exato ao cêntimo, EMITIDA, API_PULL, PRE_VALIDATED, confiança 1.0', async () => {
    const { office, owner, client, connection } = await seedBase()
    const mock = makeToconlineMock({ salesDocuments: [invoice2346('320')] })

    const result = await pullSalesDocumentsForConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(result.imported).toBe(1)

    const doc = await prisma.document.findFirstOrThrow({
      where: { officeId: office.id, clientId: client.id },
    })
    expect(doc.source).toBe('API_PULL')
    expect(doc.type).toBe('INVOICE_ISSUED')
    expect(doc.status).toBe('PRE_VALIDATED')
    expect(doc.confidence).toBe(1.0)
    expect(doc.documentNumber).toBe('FT 2026/320')
    expect(doc.issueDate?.toISOString().slice(0, 10)).toBe('2026-06-20')
    expect(doc.dueDate?.toISOString().slice(0, 10)).toBe('2026-07-20')
    expect(doc.buyerName).toBe('Cliente Final Lda')
    expect(doc.buyerNif).toBe('229659179')
    expect(doc.currency).toBe('EUR')
    expect(String(doc.totalAmount)).toBe('148.46')

    // Cents-exact at the boundary — numeric assertion [INV]
    const bands = doc.vatBreakdown as unknown as Array<{
      region?: string
      rate: number
      baseCents: number
      vatCents: number
    }>
    const byRate = new Map(bands.map((b) => [b.rate, b]))
    expect(byRate.get(23)).toMatchObject({ baseCents: 8134, vatCents: 1871 })
    expect(byRate.get(6)).toMatchObject({ baseCents: 4567, vatCents: 274 })
    expect(bands).toHaveLength(2)

    // Lines mapped with the house convention (integer cents)
    const lines = doc.documentLines as unknown as Array<{
      description: string
      qty: number
      unitPriceCents: number
      vatRate: number
      totalCents: number
    }>
    expect(lines[0]).toMatchObject({ unitPriceCents: 8134, vatRate: 23, totalCents: 10005 })
    expect(lines[1]).toMatchObject({ unitPriceCents: 4567, vatRate: 6, totalCents: 4841 })
  })

  it('TP.d [INV] pipeline de IA nunca corre para API_PULL (mock que rebenta se tocado + zero jobs de parse)', async () => {
    const { office, owner, connection } = await seedBase()
    const mock = makeToconlineMock({ salesDocuments: [invoice2346('330')] })

    const result = await pullSalesDocumentsForConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(result.ok).toBe(true) // the throwing anthropic proxy was never touched
    expect(result.imported).toBe(1)
    // No document-parse job was enqueued for the pulled document
    const parseJobs = (queueAddMock.mock.calls as unknown as Array<[string]>).filter(
      ([name]) => name !== 'toconline-pull',
    )
    expect(parseJobs).toHaveLength(0)
  })

  it('TP.e [INV dry-run] GET permitido, nada criado, escrita impossível; preview do que seria criado', async () => {
    const { office, owner, connection } = await seedBase({ dryRun: true })
    const mock = makeToconlineMock({ salesDocuments: [invoice2346('340')] })
    const probe = makeReadOnlyProbeFetch(mock.fetchImpl)

    const result = await pullSalesDocumentsForConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: probe.fetchImpl },
    )
    expect(result.ok).toBe(true)
    expect(result.previewed).toBe(1)
    expect(result.imported).toBe(0)

    expect(probe.reads.length).toBeGreaterThan(0) // reading IS allowed in dry-run
    expect(probe.writeAttempts).toHaveLength(0) // and no write ever left

    // Nothing persisted except the preview
    expect(await prisma.document.count({ where: { officeId: office.id } })).toBe(0)
    expect(
      await prisma.toconlineEntityMap.count({
        where: { connectionId: connection.id, entityType: 'SALES_DOCUMENT' },
      }),
    ).toBe(0)

    const preview = await prisma.toconlinePushPreview.findFirstOrThrow({
      where: { connectionId: connection.id, method: 'PULL' },
    })
    expect(preview.documentId).toBeNull()
    const body = preview.body as Record<string, unknown>
    expect(body.documentNumber).toBe('FT 2026/340')
    expect(JSON.stringify(body)).toContain('8134') // cents in the would-be document
  })

  it('TP.f [INV] token expirado a meio → refresh e retoma sem duplicar', async () => {
    const { office, owner, connection } = await seedBase()
    const mock = makeToconlineMock({ salesDocuments: [invoice2346('350'), invoice2346('351')] })
    const seededRefresh = 'pull-refresh-token'
    mock.state.validRefreshTokens.add(seededRefresh)
    await prisma.toconlineConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: encryptToken('stale-pull-access-token'),
        refreshToken: encryptToken(seededRefresh),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    })

    const result = await pullSalesDocumentsForConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(result.ok).toBe(true)
    expect(result.imported).toBe(2)
    expect(mock.state.tokenGrants).toContain('refresh_token')
    expect(await prisma.document.count({ where: { officeId: office.id } })).toBe(2)
  })

  it('TP.g PDF documentado (url_for_print) → anexado ao Document via R2', async () => {
    const { office, owner, connection } = await seedBase()
    const mock = makeToconlineMock({ salesDocuments: [invoice2346('360')] })

    const result = await pullSalesDocumentsForConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(result.imported).toBe(1)

    const doc = await prisma.document.findFirstOrThrow({ where: { officeId: office.id } })
    expect(doc.r2Key).toBeTruthy()
    expect(doc.mimeType).toBe('application/pdf')
    const { r2Store } = await import('../mocks/r2')
    expect(r2Store.get(doc.r2Key!)?.equals(MOCK_PDF_BYTES)).toBe(true)
  })

  it('TP.h pull desligado ou ligação DISABLED → recusa clara, zero rede', async () => {
    const { office, owner, connection } = await seedBase({ pullEnabled: false })
    const mock = makeToconlineMock({ salesDocuments: [invoice2346('370')] })

    const off = await pullSalesDocumentsForConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(off.ok).toBe(false)
    expect(mock.apiCalls()).toHaveLength(0)

    await prisma.toconlineConnection.update({
      where: { id: connection.id },
      data: { pullEnabled: true, status: 'DISABLED' },
    })
    const disabled = await pullSalesDocumentsForConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchImpl },
    )
    expect(disabled.ok).toBe(false)
    expect(mock.apiCalls()).toHaveLength(0)
  })

  it('TP.i processor regista JobLog e lastPullAt avança após sucesso', async () => {
    const { office, owner, connection } = await seedBase()
    const mock = makeToconlineMock({ salesDocuments: [invoice2346('380')] })
    const before = new Date()

    await processToconlinePull(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      'job-pull-1',
      { fetchImpl: mock.fetchImpl },
    )

    const jobLog = await prisma.jobLog.findFirst({
      where: { officeId: office.id, queue: 'toconline-pull', jobId: 'job-pull-1' },
    })
    expect(jobLog?.status).toBe('COMPLETED')

    const updated = await prisma.toconlineConnection.findUniqueOrThrow({
      where: { id: connection.id },
    })
    expect(updated.lastPullAt).not.toBeNull()
    expect(updated.lastPullAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })
})
