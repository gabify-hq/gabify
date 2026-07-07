import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser, makeClient } from '../helpers/factories'
import { encryptToken, decryptToken } from '@/lib/crypto'
import { createMoloniApiMock } from '@/server/sources/moloni/mock-api'
import { invoiceMultiRateDetail, invoiceWithExemptLineDetail } from '@/server/sources/moloni/fixtures'

// The AI pipeline must NEVER run for API_PULL documents [INV] — any touch fails.
vi.mock('@/lib/anthropic', () => ({
  anthropic: new Proxy(
    {},
    {
      get() {
        throw new Error('AI pipeline touched during Moloni pull — [INV] violated')
      },
    },
  ),
  CLAUDE_MODEL: 'claude-test',
}))

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  getMoloniPullQueue: () => ({ add: queueAddMock }),
  QUEUE_MOLONI_PULL: 'moloni-pull',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())

import { pullDocumentsForMoloniConnection } from '@/server/sources/moloni/moloni-pull-service'
import { processMoloniPull } from '@/queues/moloni-pull.processor'
import { getPushEligibilityError } from '@/server/toconline/toconline-push-service'
import type { Document } from '@prisma/client'

const APP_CLIENT_ID = 'gabify-dev-app'
const APP_CLIENT_SECRET = 'dev-app-secret-XYZ'
const MOLONI_USERNAME = 'contas@empresa.pt'
const MOLONI_PASSWORD = 'user-pass-super-secreta'
const COMPANY_ID = 5

const prevEnv = { id: process.env.MOLONI_CLIENT_ID, secret: process.env.MOLONI_CLIENT_SECRET }

function createClock(startMs = 1_780_000_000_000) {
  let nowMs = startMs
  return { now: () => nowMs, sleep: async (ms: number) => { nowMs += ms } }
}

function mockFor(documents = [invoiceMultiRateDetail, invoiceWithExemptLineDetail], now?: () => number) {
  return createMoloniApiMock({
    credentials: {
      clientId: APP_CLIENT_ID,
      clientSecret: APP_CLIENT_SECRET,
      username: MOLONI_USERNAME,
      password: MOLONI_PASSWORD,
    },
    documents,
    now,
  })
}

async function seedConnection(params?: { pullEnabled?: boolean }) {
  const office = await makeOffice()
  const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
  const client = await makeClient({ officeId: office.id, name: 'Cliente Moloni' })
  const connection = await prisma.moloniConnection.create({
    data: {
      officeId: office.id,
      clientId: client.id,
      companyId: COMPANY_ID,
      companyName: 'Empresa Moloni Lda',
      username: encryptToken(MOLONI_USERNAME),
      password: encryptToken(MOLONI_PASSWORD),
      pullEnabled: params?.pullEnabled ?? true,
    },
  })
  return { office, owner, client, connection }
}

describe('Moloni — pull de faturas emitidas [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
    queueAddMock.mockReset()
    process.env.MOLONI_CLIENT_ID = APP_CLIENT_ID
    process.env.MOLONI_CLIENT_SECRET = APP_CLIENT_SECRET
  })
  afterAll(() => {
    process.env.MOLONI_CLIENT_ID = prevEnv.id
    process.env.MOLONI_CLIENT_SECRET = prevEnv.secret
  })

  it('MP.a [INV cêntimos] multi-taxa → Document exato: EMITIDA, API_PULL, PRE_VALIDATED, confiança 1.0, NIF inline', async () => {
    const { office, owner, client, connection } = await seedConnection()
    const clock = createClock()
    const mock = mockFor(undefined, clock.now)

    const result = await pullDocumentsForMoloniConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchFn, now: clock.now, sleep: clock.sleep },
    )
    expect(result.ok).toBe(true)
    expect(result.imported).toBe(2)

    const doc = await prisma.document.findFirstOrThrow({
      where: { officeId: office.id, clientId: client.id, documentNumber: 'A/42' },
    })
    expect(doc.source).toBe('API_PULL')
    expect(doc.type).toBe('INVOICE_ISSUED')
    expect(doc.status).toBe('PRE_VALIDATED')
    expect(doc.confidence).toBe(1.0)
    expect(doc.buyerName).toBe('Cliente Exemplo Lda')
    expect(doc.buyerNif).toBe('123456789') // Moloni carries the NIF inline
    expect(doc.supplierNif).toBeNull()
    expect(doc.issueDate?.toISOString().slice(0, 10)).toBe('2026-06-30')
    expect(String(doc.totalAmount)).toBe('35.56')

    const bands = doc.vatBreakdown as unknown as Array<{ rate: number; baseCents: number; vatCents: number }>
    const byRate = new Map(bands.map((b) => [b.rate, b]))
    expect(byRate.get(23)).toMatchObject({ baseCents: 2029, vatCents: 467 })
    expect(byRate.get(6)).toMatchObject({ baseCents: 1000, vatCents: 60 })

    // PDF attached via R2 (getPDFLink → download)
    expect(doc.r2Key).toBeTruthy()
    expect(doc.mimeType).toBe('application/pdf')
  })

  it('MP.b [INV dedup] segundo pull do mesmo id → zero novos (SourceEntityMap)', async () => {
    const { office, owner, connection } = await seedConnection()
    // One backend across both pulls — token issued in run 1 stays valid in run 2.
    const clock = createClock()
    const mock = mockFor(undefined, clock.now)
    const deps = { fetchImpl: mock.fetchFn, now: clock.now, sleep: clock.sleep }

    const first = await pullDocumentsForMoloniConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      deps,
    )
    expect(first.imported).toBe(2)

    const second = await pullDocumentsForMoloniConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      deps,
    )
    expect(second.ok).toBe(true)
    expect(second.imported).toBe(0)
    expect(second.skippedKnown).toBe(2)

    expect(await prisma.document.count({ where: { officeId: office.id } })).toBe(2)
    expect(
      await prisma.sourceEntityMap.count({
        where: { clientId: connection.clientId, system: 'MOLONI', entityType: 'SALES_DOCUMENT' },
      }),
    ).toBe(2)
  })

  it('MP.c [INV] IA nunca corre (proxy que rebenta) e nenhum job de parse é enfileirado', async () => {
    const { office, owner, connection } = await seedConnection()
    const result = await pullDocumentsForMoloniConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mockFor(undefined, createClock().now).fetchFn },
    )
    expect(result.ok).toBe(true)
    const parseJobs = (queueAddMock.mock.calls as unknown as Array<[string]>).filter(
      ([name]) => name !== 'moloni-pull',
    )
    expect(parseJobs).toHaveLength(0)
  })

  it('MP.d [INV] credenciais e tokens ficam cifrados na BD (nunca em claro)', async () => {
    const { office, owner, connection } = await seedConnection()
    await pullDocumentsForMoloniConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mockFor(undefined, createClock().now).fetchFn },
    )
    // Read the RAW row and assert nothing is stored in clear text
    const raw = await prisma.moloniConnection.findUniqueOrThrow({ where: { id: connection.id } })
    for (const field of [raw.username, raw.password, raw.accessToken, raw.refreshToken]) {
      expect(field).toBeTruthy()
      expect(field!.startsWith('v2:')).toBe(true)
      expect(field).not.toContain(MOLONI_PASSWORD)
      expect(field).not.toContain(MOLONI_USERNAME)
    }
    // ...and they still decrypt to the real values
    expect(decryptToken(raw.username)).toBe(MOLONI_USERNAME)
    expect(decryptToken(raw.password)).toBe(MOLONI_PASSWORD)
    expect(raw.accessToken).not.toBeNull() // token persisted after the run
  })

  it('MP.e [INV cross-tenant] pull com officeId de outro gabinete → 404 lógico, nada importado', async () => {
    const { connection } = await seedConnection()
    const other = await makeOffice()
    const result = await pullDocumentsForMoloniConnection(
      { connectionId: connection.id, officeId: other.id, userId: null },
      { fetchImpl: mockFor(undefined, createClock().now).fetchFn },
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/não encontrada/i)
    expect(await prisma.document.count()).toBe(0)
  })

  it('MP.f [INV] documentos API_PULL nunca entram no seletor de push TOConline', async () => {
    const { office, owner, connection } = await seedConnection()
    await pullDocumentsForMoloniConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mockFor(undefined, createClock().now).fetchFn },
    )
    const doc = await prisma.document.findFirstOrThrow({ where: { officeId: office.id } })
    const reason = getPushEligibilityError(doc as unknown as Document)
    expect(reason).toBeTruthy()
    expect(reason).toMatch(/nunca é reenviado|importado/i)
  })

  it('MP.g processor regista JobLog e lastPullAt avança após sucesso', async () => {
    const { office, owner, connection } = await seedConnection()
    const before = new Date()
    await processMoloniPull(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      'job-moloni-1',
      { fetchImpl: mockFor(undefined, createClock().now).fetchFn },
    )
    const jobLog = await prisma.jobLog.findFirst({
      where: { officeId: office.id, queue: 'moloni-pull', jobId: 'job-moloni-1' },
    })
    expect(jobLog?.status).toBe('COMPLETED')
    const updated = await prisma.moloniConnection.findUniqueOrThrow({ where: { id: connection.id } })
    expect(updated.lastPullAt).not.toBeNull()
    expect(updated.lastPullAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(updated.status).toBe('ATIVA')
  })

  it('MP.h pull desligado → recusa clara, zero rede', async () => {
    const { office, owner, connection } = await seedConnection({ pullEnabled: false })
    const mock = mockFor(undefined, createClock().now)
    const result = await pullDocumentsForMoloniConnection(
      { connectionId: connection.id, officeId: office.id, userId: owner.id },
      { fetchImpl: mock.fetchFn },
    )
    expect(result.ok).toBe(false)
    expect(mock.requests).toHaveLength(0)
  })
})
