import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeClient } from '../helpers/factories'
import { fixturePath } from '../fixtures/generate'
import { resetRateLimits } from '@/server/rate-limit'

vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())
vi.mock('@/lib/anthropic', async () => (await import('../mocks/ai')).aiMockFactory())

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  QUEUE_SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

import {
  createIngestAlias,
  regenerateIngestAlias,
  processInboundIngest,
  type InboundIngestPayload,
} from '@/server/services/ingest-service'
import { aiState } from '../mocks/ai'
import { r2Store } from '../mocks/r2'

const INGEST_DOMAIN = 'in.gabify.test'

function payload(overrides: Partial<InboundIngestPayload> = {}): InboundIngestPayload {
  return {
    to: [`alias-desconhecido@${INGEST_DOMAIN}`],
    from: 'fornecedor@empresa.pt',
    subject: 'Fatura',
    authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
    attachments: [
      {
        filename: 'fatura.pdf',
        contentBase64: readFileSync(fixturePath('fx-qr-single.pdf')).toString('base64'),
        mimeType: 'application/pdf',
      },
    ],
    ...overrides,
  }
}

describe('AC-2.2 Caixa dedicada (§2.6/S2.2, A5)', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    aiState.reset()
    r2Store.clear()
    queueAddMock.mockClear()
    process.env.INGEST_DOMAIN = INGEST_DOMAIN
  })

  it('AC-2.2.a — payload para o alias do cliente X → Documents associados a X sem heurística', async () => {
    const { officeA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id, name: 'Cliente X' })
    const alias = await createIngestAlias({ officeId: officeA.id, clientId: clientX.id })

    const result = await processInboundIngest(payload({ to: [`${alias.alias}@${INGEST_DOMAIN}`] }))
    expect(result.accepted).toBe(true)

    const doc = await prisma.document.findFirstOrThrow({ where: { officeId: officeA.id } })
    expect(doc.clientId).toBe(clientX.id)
    expect(queueAddMock).toHaveBeenCalledTimes(1)
  })

  it('AC-2.2.b [INV] — endereço desconhecido rejeitado; alias regenerado mata o antigo', async () => {
    const { officeA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id })
    const alias = await createIngestAlias({ officeId: officeA.id, clientId: clientX.id })

    const unknown = await processInboundIngest(payload())
    expect(unknown.accepted).toBe(false)
    expect(await prisma.document.count()).toBe(0)

    const newAlias = await regenerateIngestAlias({ officeId: officeA.id, clientId: clientX.id })
    expect(newAlias.alias).not.toBe(alias.alias)

    const old = await processInboundIngest(payload({ to: [`${alias.alias}@${INGEST_DOMAIN}`] }))
    expect(old.accepted).toBe(false)

    const fresh = await processInboundIngest(payload({ to: [`${newAlias.alias}@${INGEST_DOMAIN}`] }))
    expect(fresh.accepted).toBe(true)
  })

  it('AC-2.2.c [INV] — falha dura DMARC → quarentena SENDER_UNVERIFIED, vai a revisão, nunca descartado', async () => {
    const { officeA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id })
    const alias = await createIngestAlias({ officeId: officeA.id, clientId: clientX.id })

    const result = await processInboundIngest(
      payload({
        to: [`${alias.alias}@${INGEST_DOMAIN}`],
        authentication: { spf: 'fail', dkim: 'fail', dmarc: 'fail' },
      })
    )
    expect(result.accepted).toBe(true)
    expect(result.quarantined).toBe(true)

    const doc = await prisma.document.findFirstOrThrow({ where: { officeId: officeA.id } })
    expect(doc.flags).toContain('SENDER_UNVERIFIED')
    expect(doc.status).toBe('NEEDS_REVIEW')
    // Quarantined documents are NOT parsed as trusted — no parse job queued
    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('AC-2.2.d — allowedSenderDomains: fora → quarentena; dentro → normal (A5)', async () => {
    const { officeA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id })
    await prisma.client.update({
      where: { id: clientX.id },
      data: { allowedSenderDomains: ['empresa.pt'] },
    })
    const alias = await createIngestAlias({ officeId: officeA.id, clientId: clientX.id })

    const outside = await processInboundIngest(
      payload({ to: [`${alias.alias}@${INGEST_DOMAIN}`], from: 'alguem@intruso.com' })
    )
    expect(outside.quarantined).toBe(true)

    const inside = await processInboundIngest(
      payload({ to: [`${alias.alias}@${INGEST_DOMAIN}`], from: 'faturas@empresa.pt' })
    )
    expect(inside.quarantined).toBe(false)
  })

  it('AC-2.2.e — rate limit por endereço: pedido acima do limite recusado (A5+A11)', async () => {
    process.env.RATE_LIMIT_INGEST_PER_HOUR = '2'
    const { officeA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id })
    const alias = await createIngestAlias({ officeId: officeA.id, clientId: clientX.id })
    const to = [`${alias.alias}@${INGEST_DOMAIN}`]

    expect((await processInboundIngest(payload({ to }))).accepted).toBe(true)
    expect((await processInboundIngest(payload({ to }))).accepted).toBe(true)
    const third = await processInboundIngest(payload({ to }))
    expect(third.accepted).toBe(false)
    expect(third.reason).toBe('RATE_LIMITED')

    delete process.env.RATE_LIMIT_INGEST_PER_HOUR
  })

  it('AC-2.2.f — token do alias ≥10 chars de alfabeto sem ambíguos (A5)', async () => {
    const { officeA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id, name: 'Padaria São João' })
    const alias = await createIngestAlias({ officeId: officeA.id, clientId: clientX.id })

    const token = alias.alias.split('-').pop()!
    expect(token.length).toBeGreaterThanOrEqual(10)
    // no ambiguous chars: 0, 1, l, o, i
    expect(token).toMatch(/^[a-hj-km-np-z2-9]+$/)
  })

  it('AC-2.4.a — NIF adquirente = cliente Y entregue na caixa de X → WRONG_CLIENT_SUSPECT + sugestão Y', async () => {
    const { officeA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id, name: 'Cliente X', nif: '999999990' })
    const clientY = await makeClient({ officeId: officeA.id, name: 'Cliente Y', nif: '123456789' })
    const alias = await createIngestAlias({ officeId: officeA.id, clientId: clientX.id })

    await processInboundIngest(payload({ to: [`${alias.alias}@${INGEST_DOMAIN}`] }))
    const doc = await prisma.document.findFirstOrThrow({ where: { officeId: officeA.id } })

    const { processDocumentParse } = await import('@/queues/document-parse.processor')
    await processDocumentParse({ documentId: doc.id, officeId: officeA.id }, 'wc-1')

    // fx-qr-single has B:123456789 = clientY's NIF, but was delivered to X's box
    const parsed = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(parsed.flags).toContain('WRONG_CLIENT_SUSPECT')
    expect(parsed.suggestedClientId).toBe(clientY.id)
    expect(parsed.clientId).toBe(clientX.id) // não move sozinho — sugestão apenas
  })
})
