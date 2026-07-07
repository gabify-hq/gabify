import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser, makeClient } from '../helpers/factories'
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
  QUEUE_EXPORT: 'export',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

import { processDocumentParse } from '@/queues/document-parse.processor'
import { createManualDocument } from '@/server/services/upload-service'
import { seedSncTaxonomy, suggestSncForDocument, buildExportAccount } from '@/server/services/snc-service'
import { reviewDocument } from '@/server/services/review-service'
import { createSupplierRule } from '@/server/services/supplier-rule-service'
import { aiState } from '../mocks/ai'
import { r2Store } from '../mocks/r2'

function fx(name: string): Buffer {
  return readFileSync(fixturePath(name))
}

async function parsedDoc(officeId: string, userId: string, fixture = 'fx-qr-single.pdf', documentNumber?: string) {
  const doc = await createManualDocument({
    officeId, uploadedByUserId: userId, filename: fixture,
    mimeType: 'application/pdf', buffer: fx(fixture), clientId: null,
  })
  await processDocumentParse({ documentId: doc.id, officeId }, `snc-${doc.id}`)
  if (documentNumber) {
    await prisma.document.update({
      where: { id: doc.id },
      data: { documentNumber, flags: [], duplicateOfId: null, status: 'PRE_VALIDATED' },
    })
  }
  return prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
}

describe('AC-5.1 Sugestão SNC (A13 — sugestão, nunca decisão)', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    aiState.reset()
    r2Store.clear()
    await seedSncTaxonomy()
  })

  it('taxonomia seed: contas 62x presentes, 63x nunca sugeríveis, 621x/625x sensíveis (A13)', async () => {
    expect(await prisma.sncAccount.count()).toBeGreaterThan(15)
    const honorarios = await prisma.sncAccount.findUniqueOrThrow({ where: { code: '6224' } })
    expect(honorarios.suggestible).toBe(true)
    const pessoal = await prisma.sncAccount.findFirst({ where: { code: { startsWith: '63' } } })
    if (pessoal) expect(pessoal.suggestible).toBe(false)
    const deslocacoes = await prisma.sncAccount.findUniqueOrThrow({ where: { code: '6251' } })
    expect(deslocacoes.sensitive).toBe(true)

    // Idempotent seed
    await seedSncTaxonomy()
    expect(await prisma.sncAccount.count()).toBeGreaterThan(15)
  })

  it('AC-5.1.a — fornecedor com histórico validado ⇒ sncSource=HISTORY, zero IA', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })

    // Historic doc of the supplier, validated with an account by a human
    const past = await parsedDoc(office.id, owner.id, 'fx-qr-single.pdf', 'FT H/1')
    await reviewDocument({
      documentId: past.id, officeId: office.id, userId: owner.id, role: 'OWNER',
      decision: 'correct', corrections: { accountCode: '6226' }, expectedVersion: past.version,
    })

    const doc = await parsedDoc(office.id, owner.id, 'fx-qr-single.pdf', 'FT H/2')
    const callsBefore = aiState.calls
    const suggestion = await suggestSncForDocument({ documentId: doc.id, officeId: office.id })
    expect(suggestion.ok && suggestion.sncSource).toBe('HISTORY')

    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(updated.suggestedAccountCode).toBe('6226')
    expect(updated.accountCode).toBeNull() // sugestão, nunca decisão
    expect(aiState.calls).toBe(callsBefore) // zero IA
  })

  it('AC-5.1.b [INV] — IA devolve code inexistente ⇒ rejeitado, NEEDS_REVIEW, nunca persiste', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const doc = await parsedDoc(office.id, owner.id, 'fx-qr-single.pdf', 'FT I/1')

    aiState.queue.push(JSON.stringify({ accountCode: '9999', vatTreatment: 'DEDUTIVEL_TOTAL', confidence: 0.9 }))
    const result = await suggestSncForDocument({ documentId: doc.id, officeId: office.id })
    expect(result.ok).toBe(false)

    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(updated.suggestedAccountCode).toBeNull()
    expect(updated.status).toBe('NEEDS_REVIEW')
  })

  it('AC-5.1.b2 [INV] — sugestão nunca transita o documento de estado por si só', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const doc = await parsedDoc(office.id, owner.id, 'fx-qr-single.pdf', 'FT I/2')
    const statusBefore = doc.status

    aiState.queue.push(JSON.stringify({ accountCode: '6222', vatTreatment: 'DEDUTIVEL_TOTAL', confidence: 0.9 }))
    await suggestSncForDocument({ documentId: doc.id, officeId: office.id })

    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(updated.suggestedAccountCode).toBe('6222')
    expect(updated.status).toBe(statusBefore)
    expect(updated.accountCode).toBeNull()
  })

  it('AC-5.1.c — correção humana atualiza o histórico: próximo doc sugere a corrigida', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })

    const first = await parsedDoc(office.id, owner.id, 'fx-qr-single.pdf', 'FT J/1')
    await reviewDocument({
      documentId: first.id, officeId: office.id, userId: owner.id, role: 'OWNER',
      decision: 'correct', corrections: { accountCode: '6261' }, expectedVersion: first.version,
    })

    const next = await parsedDoc(office.id, owner.id, 'fx-qr-single.pdf', 'FT J/2')
    const suggestion = await suggestSncForDocument({ documentId: next.id, officeId: office.id })
    expect(suggestion.ok && suggestion.accountCode).toBe('6261')
  })

  it('AC-5.1.d [INV] — rubrica sensível (621x/625x) na 1.ª ocorrência ⇒ NEEDS_REVIEW de IVA; com regra humana automatiza (A13)', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const doc = await parsedDoc(office.id, owner.id, 'fx-qr-single.pdf', 'FT K/1')

    aiState.queue.push(JSON.stringify({ accountCode: '6251', vatTreatment: 'NAO_DEDUTIVEL', confidence: 0.9 }))
    await suggestSncForDocument({ documentId: doc.id, officeId: office.id })

    const flagged = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(flagged.flags).toContain('VAT_SENSITIVE')
    expect(flagged.status).toBe('NEEDS_REVIEW')

    // With a human-created rule for the supplier, the sensitive gate is lifted
    await createSupplierRule({
      officeId: office.id, supplierNif: '508234567', defaultAccountCode: '6251',
      defaultVatTreatment: 'NAO_DEDUTIVEL', createdByUserId: owner.id,
    })
    const second = await parsedDoc(office.id, owner.id, 'fx-qr-single.pdf', 'FT K/2')
    expect(second.accountCode).toBe('6251') // regra humana aplica direto
    expect(second.flags).not.toContain('VAT_SENSITIVE')
  })

  it('AC-5.1.e — accountOverrides do cliente mapeia o code no export', async () => {
    const office = await makeOffice()
    const client = await makeClient({ officeId: office.id })
    await prisma.client.update({
      where: { id: client.id },
      data: { accountOverrides: { '6221': '62211-ESPECIAL' } },
    })
    const withOverride = await buildExportAccount({ clientId: client.id, accountCode: '6221' })
    expect(withOverride).toBe('62211-ESPECIAL')
    const without = await buildExportAccount({ clientId: client.id, accountCode: '6222' })
    expect(without).toBe('6222')
  })
})
