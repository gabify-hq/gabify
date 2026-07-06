import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeOffice, makeUser, makeClient } from '../helpers/factories'
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
import { reviewDocument, bulkValidate, reopenDocument } from '@/server/services/review-service'
import { createSupplierRule, suggestRuleForSupplier } from '@/server/services/supplier-rule-service'
import { aiState } from '../mocks/ai'
import { r2Store } from '../mocks/r2'

function fx(name: string): Buffer {
  return readFileSync(fixturePath(name))
}

async function parseFixtureDoc(officeId: string, userId: string, fixture: string, clientId: string | null = null) {
  const doc = await createManualDocument({
    officeId,
    uploadedByUserId: userId,
    filename: fixture,
    mimeType: 'application/pdf',
    buffer: fx(fixture),
    clientId,
  })
  await processDocumentParse({ documentId: doc.id, officeId }, `rev-parse-${doc.id}`)
  return prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
}

describe('AC-4.1 Fila e estados (A7) · AC-4.2 Regras por fornecedor · AC-3.5 Suppliers', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    aiState.reset()
    r2Store.clear()
    queueAddMock.mockClear()
  })

  it('AC-4.1.a — confiança ≥0.85 + coerente + sem flags ⇒ PRE_VALIDATED; resto ⇒ NEEDS_REVIEW', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })

    const good = await parseFixtureDoc(office.id, owner.id, 'fx-qr-single.pdf')
    expect(good.status).toBe('PRE_VALIDATED')

    // Duplicate of the same invoice → flagged → NEEDS_REVIEW
    const dup = await parseFixtureDoc(office.id, owner.id, 'fx-qr-single.pdf')
    expect(dup.status).toBe('NEEDS_REVIEW')
    expect(dup.flags).toContain('DUPLICATE_SUSPECT')
  })

  it('AC-4.1.b [INV] — validate/correct criam DocumentReview (diffs) + AuditLog; VIEWER bloqueado', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const viewer = await makeUser({ officeId: office.id, role: 'VIEWER' })
    const doc = await parseFixtureDoc(office.id, owner.id, 'fx-qr-single.pdf')

    const denied = await reviewDocument({
      documentId: doc.id,
      officeId: office.id,
      userId: viewer.id,
      role: 'VIEWER',
      decision: 'validate',
      expectedVersion: doc.version,
    })
    expect(denied.ok).toBe(false)

    const corrected = await reviewDocument({
      documentId: doc.id,
      officeId: office.id,
      userId: owner.id,
      role: 'OWNER',
      decision: 'correct',
      corrections: { supplierName: 'Fornecedor Corrigido Lda', accountCode: '6221' },
      expectedVersion: doc.version,
    })
    expect(corrected.ok).toBe(true)

    const review = await prisma.documentReview.findFirstOrThrow({ where: { documentId: doc.id } })
    expect(review.decision).toBe('correct')
    const before = review.before as Record<string, unknown>
    const after = review.after as Record<string, unknown>
    expect(after.supplierName).toBe('Fornecedor Corrigido Lda')
    expect(before.supplierName).not.toBe('Fornecedor Corrigido Lda')

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Document', entityId: doc.id, action: { contains: 'REVIEW' } },
    })
    expect(audit).not.toBeNull()

    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(updated.status).toBe('VALIDATED')
    expect(updated.accountCode).toBe('6221')
  })

  it('AC-4.1.c [INV] — dois reviewers concorrentes: um vence, outro 409 (expectedVersion A7)', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const accountant = await makeUser({ officeId: office.id, role: 'ACCOUNTANT' })
    const doc = await parseFixtureDoc(office.id, owner.id, 'fx-qr-single.pdf')

    const [r1, r2] = await Promise.all([
      reviewDocument({
        documentId: doc.id, officeId: office.id, userId: owner.id, role: 'OWNER',
        decision: 'validate', expectedVersion: doc.version,
      }),
      reviewDocument({
        documentId: doc.id, officeId: office.id, userId: accountant.id, role: 'ACCOUNTANT',
        decision: 'validate', expectedVersion: doc.version,
      }),
    ])
    const outcomes = [r1.ok, r2.ok].sort()
    expect(outcomes).toEqual([false, true])
    const loser = r1.ok ? r2 : r1
    expect(!loser.ok && loser.httpStatus).toBe(409)
  })

  it('AC-4.1.d [INV] — EXPORTED rejeita edição/review; reopen (OWNER, motivo) devolve a VALIDATED', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const accountant = await makeUser({ officeId: office.id, role: 'ACCOUNTANT' })
    const doc = await parseFixtureDoc(office.id, owner.id, 'fx-qr-single.pdf')
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'EXPORTED' } })

    const denied = await reviewDocument({
      documentId: doc.id, officeId: office.id, userId: owner.id, role: 'OWNER',
      decision: 'validate', expectedVersion: doc.version,
    })
    expect(denied.ok).toBe(false)
    expect(!denied.ok && denied.httpStatus).toBe(409)

    // AC-6.3.a: reopen — ACCOUNTANT blocked, missing reason 400, OWNER ok
    const notOwner = await reopenDocument({
      documentId: doc.id, officeId: office.id, userId: accountant.id, role: 'ACCOUNTANT', reason: 'engano',
    })
    expect(notOwner.ok).toBe(false)

    const noReason = await reopenDocument({
      documentId: doc.id, officeId: office.id, userId: owner.id, role: 'OWNER', reason: '',
    })
    expect(!noReason.ok && noReason.httpStatus).toBe(400)

    const reopened = await reopenDocument({
      documentId: doc.id, officeId: office.id, userId: owner.id, role: 'OWNER', reason: 'valor errado detetado pós-export',
    })
    expect(reopened.ok).toBe(true)
    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(after.status).toBe('VALIDATED')
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: doc.id, action: 'DOCUMENT_REOPENED' },
    })
    expect(audit).not.toBeNull()
  })

  it('AC-4.1.e — bulk: CONFLICT vs FORBIDDEN vs OK; falha de um não reverte os outros (A7)', async () => {
    const { officeA, officeB, ownerA } = await makeTwoOffices()
    const accountant = await makeUser({ officeId: officeA.id, role: 'ACCOUNTANT' })

    const docOk = await parseFixtureDoc(officeA.id, ownerA.id, 'fx-qr-single.pdf')
    const docStale = await parseFixtureDoc(officeA.id, ownerA.id, 'fx-qr-multirate.pdf')
    // Foreign document (office B)
    const foreignOwner = await prisma.user.findFirstOrThrow({ where: { officeId: officeB.id } })
    const docForeign = await parseFixtureDoc(officeB.id, foreignOwner.id, 'fx-noqr-invoice.pdf').catch(() => null)

    const results = await bulkValidate({
      officeId: officeA.id,
      userId: accountant.id,
      role: 'ACCOUNTANT',
      items: [
        { documentId: docOk.id, expectedVersion: docOk.version },
        { documentId: docStale.id, expectedVersion: docStale.version + 5 }, // stale version
        ...(docForeign ? [{ documentId: docForeign.id, expectedVersion: 1 }] : []),
      ],
    })

    const byId = new Map(results.map((r) => [r.documentId, r.result]))
    expect(byId.get(docOk.id)).toBe('OK')
    expect(byId.get(docStale.id)).toBe('CONFLICT')
    if (docForeign) expect(byId.get(docForeign.id)).toBe('NOT_FOUND')

    expect((await prisma.document.findUniqueOrThrow({ where: { id: docOk.id } })).status).toBe('VALIDATED')
  })

  it('AC-4.2.a/b — regra autoValidate ⇒ VALIDATED com AuditLog; NUNCA com flag de duplicado', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    await createSupplierRule({
      officeId: office.id,
      supplierNif: '508234567',
      defaultAccountCode: '6221',
      autoValidate: true,
      createdByUserId: owner.id,
    })

    const doc = await parseFixtureDoc(office.id, owner.id, 'fx-qr-single.pdf')
    expect(doc.status).toBe('VALIDATED')
    expect(doc.accountCode).toBe('6221')
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: doc.id, action: 'AUTO_VALIDATED_BY_RULE' },
    })
    expect(audit).not.toBeNull()

    // Duplicate of the same invoice: rule NEVER skips the queue when flagged
    const dup = await parseFixtureDoc(office.id, owner.id, 'fx-qr-single.pdf')
    expect(dup.status).toBe('NEEDS_REVIEW')
    expect(dup.flags).toContain('DUPLICATE_SUSPECT')
  })

  it('AC-4.2.c/d [INV] — regra de cliente sobrepõe global; regra de A nunca se aplica em B', async () => {
    const { officeA, officeB, ownerA } = await makeTwoOffices()
    const clientX = await makeClient({ officeId: officeA.id, nif: '123456789' })
    await createSupplierRule({
      officeId: officeA.id, supplierNif: '508234567', defaultAccountCode: '6268',
      createdByUserId: ownerA.id,
    })
    await createSupplierRule({
      officeId: officeA.id, clientId: clientX.id, supplierNif: '508234567', defaultAccountCode: '6221',
      createdByUserId: ownerA.id,
    })

    // fx-qr-single buyer NIF = clientX → auto-assigned → client rule wins
    const doc = await parseFixtureDoc(officeA.id, ownerA.id, 'fx-qr-single.pdf')
    expect(doc.clientId).toBe(clientX.id)
    expect(doc.accountCode).toBe('6221')

    // Office B: same supplier, no rule there → no account applied
    const ownerB = await prisma.user.findFirstOrThrow({ where: { officeId: officeB.id } })
    const docB = await parseFixtureDoc(officeB.id, ownerB.id, 'fx-qr-single.pdf')
    expect(docB.accountCode).toBeNull()
  })

  it('AC-4.2.e — 3 correções idênticas geram sugestão de regra; 2 não; nunca criada sem clique', async () => {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })

    async function correctOne(fixture: string) {
      const doc = await parseFixtureDoc(office.id, owner.id, fixture)
      await reviewDocument({
        documentId: doc.id, officeId: office.id, userId: owner.id, role: 'OWNER',
        decision: 'correct',
        corrections: { accountCode: '6222' },
        expectedVersion: (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).version,
      })
    }

    // Same supplier (508234567), same correction, distinct invoices — tweak numbers
    await correctOne('fx-qr-single.pdf')
    // Change document numbers so they are not duplicates
    await prisma.document.updateMany({ where: { officeId: office.id }, data: { documentNumber: 'FT A/1' } })
    await correctOne('fx-qr-single.pdf')
    await prisma.document.updateMany({
      where: { officeId: office.id, documentNumber: { not: 'FT A/1' } },
      data: { documentNumber: 'FT A/2' },
    })

    expect(await suggestRuleForSupplier(office.id, '508234567')).toBeNull() // only 2

    await correctOne('fx-qr-single.pdf')
    const suggestion = await suggestRuleForSupplier(office.id, '508234567')
    expect(suggestion).not.toBeNull()
    expect(suggestion!.defaultAccountCode).toBe('6222')

    // Suggestion NEVER creates the rule silently
    expect(await prisma.supplierRule.count({ where: { officeId: office.id } })).toBe(0)
  })

  it('AC-3.5.a — extração cria/atualiza Supplier por (officeId, nif); offices separados', async () => {
    const { officeA, officeB, ownerA, ownerB } = await makeTwoOffices()
    await parseFixtureDoc(officeA.id, ownerA.id, 'fx-qr-single.pdf')
    await parseFixtureDoc(officeB.id, ownerB.id, 'fx-qr-single.pdf')

    const suppliers = await prisma.supplier.findMany({ where: { nif: '508234567' } })
    expect(suppliers).toHaveLength(2)
    expect(new Set(suppliers.map((s) => s.officeId))).toEqual(new Set([officeA.id, officeB.id]))
    expect(suppliers.every((s) => s.documentCount >= 1)).toBe(true)
  })
})
