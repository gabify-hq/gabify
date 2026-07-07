import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeOffice, makeUser, makeClient } from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'
import { NextRequest } from 'next/server'
import { resetRateLimits } from '@/server/rate-limit'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('@/lib/anthropic', async () => (await import('../mocks/ai')).aiMockFactory())

import { POST as reconcileRoute } from '@/app/api/bank/transactions/[transactionId]/reconcile/route'
import { POST as unreconcileRoute } from '@/app/api/bank/transactions/[transactionId]/unreconcile/route'
import { POST as createRuleRoute, GET as listRulesRoute } from '@/app/api/bank/rules/route'
import { generateSuggestionsForTransaction } from '@/server/services/bank-matching'
import { aiState } from '../mocks/ai'

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function reconcile(transactionId: string, body: unknown) {
  return reconcileRoute(
    jsonRequest(`/api/bank/transactions/${transactionId}/reconcile`, 'POST', body),
    { params: Promise.resolve({ transactionId }) }
  )
}

async function unreconcile(transactionId: string) {
  return unreconcileRoute(
    jsonRequest(`/api/bank/transactions/${transactionId}/unreconcile`, 'POST', {}),
    { params: Promise.resolve({ transactionId }) }
  )
}

async function seedBase() {
  const office = await makeOffice()
  const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
  const client = await makeClient({ officeId: office.id, name: 'Cliente C3' })
  const account = await prisma.bankAccount.create({
    data: { officeId: office.id, clientId: client.id, name: 'Conta C3' },
  })
  const statementImport = await prisma.bankStatementImport.create({
    data: {
      officeId: office.id,
      bankAccountId: account.id,
      filename: 'extrato.csv',
      fileHash: `hash-${account.id}`,
      mappingSource: 'heuristic',
      proposedMapping: {},
      rowsData: [],
      status: 'PROCESSED',
      importedByUserId: owner.id,
    },
  })
  setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })
  return { office, owner, client, account, statementImport }
}

async function makeTx(params: {
  officeId: string
  bankAccountId: string
  importId: string
  amountCents: number
  description?: string
  bookingDate?: string
}) {
  return prisma.bankTransaction.create({
    data: {
      officeId: params.officeId,
      bankAccountId: params.bankAccountId,
      importId: params.importId,
      bookingDate: new Date(`${params.bookingDate ?? '2026-06-12'}T12:00:00.000Z`),
      description: params.description ?? 'TRF P/ 509888777',
      amountCents: params.amountCents,
      dedupHash: `dedup-${params.amountCents}-${params.description ?? 'x'}-${Math.random()}`,
    },
  })
}

async function makeValidatedDoc(params: {
  officeId: string
  clientId: string
  totalAmount: string
  supplierNif?: string
  dueDate?: string
}) {
  return prisma.document.create({
    data: {
      officeId: params.officeId,
      clientId: params.clientId,
      status: 'VALIDATED',
      type: 'INVOICE_RECEIVED',
      totalAmount: params.totalAmount,
      supplierNif: params.supplierNif ?? '509888777',
      dueDate: params.dueDate ? new Date(`${params.dueDate}T12:00:00.000Z`) : null,
    },
  })
}

describe('🔴RED C3 — conciliar, undo, regras bancárias', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    aiState.reset()
  })

  it('C3.a [INV] — aceitar sugestão persiste entry + audit + estados nos dois lados; sugestão fica ACCEPTED', async () => {
    const { office, client, account, statementImport } = await seedBase()
    const doc = await makeValidatedDoc({
      officeId: office.id,
      clientId: client.id,
      totalAmount: '246.00',
      dueDate: '2026-06-11',
    })
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600,
    })
    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx.id })
    const fresh = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx.id } })
    expect(fresh.status).toBe('SUGGESTED')

    const res = await reconcile(tx.id, { documentIds: [doc.id], expectedVersion: fresh.version })
    expect(res.status).toBe(200)

    const after = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx.id } })
    expect(after.status).toBe('RECONCILED')
    expect(after.version).toBe(fresh.version + 1)

    const entry = await prisma.reconciliationEntry.findFirstOrThrow({
      where: { bankTransactionId: tx.id },
    })
    expect(entry.documentIds).toEqual([doc.id])
    expect(entry.ignored).toBe(false)

    const docAfter = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(docAfter.reconciledEntryId).toBe(entry.id)
    expect(docAfter.status).toBe('VALIDATED') // máquina de estados do documento intocada

    const audit = await prisma.auditLog.findFirst({
      where: { officeId: office.id, action: 'BANK_TRANSACTION_RECONCILED', entityId: tx.id },
    })
    expect(audit).not.toBeNull()

    const suggestion = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { bankTransactionId: tx.id, documentId: doc.id },
    })
    expect(suggestion.status).toBe('ACCEPTED')
  })

  it('C3.b [INV] — unreconcile reverte tudo (tx, documento, sugestões) com AuditLog', async () => {
    const { office, client, account, statementImport } = await seedBase()
    const doc = await makeValidatedDoc({
      officeId: office.id,
      clientId: client.id,
      totalAmount: '246.00',
      dueDate: '2026-06-11',
    })
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600,
    })
    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx.id })
    const fresh = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx.id } })
    await reconcile(tx.id, { documentIds: [doc.id], expectedVersion: fresh.version })

    const res = await unreconcile(tx.id)
    expect(res.status).toBe(200)

    const after = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx.id } })
    expect(after.status).toBe('UNRECONCILED')
    expect(await prisma.reconciliationEntry.count({ where: { bankTransactionId: tx.id } })).toBe(0)
    const docAfter = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(docAfter.reconciledEntryId).toBeNull()
    const suggestion = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { bankTransactionId: tx.id, documentId: doc.id },
    })
    expect(suggestion.status).toBe('PENDING')
    const audit = await prisma.auditLog.findFirst({
      where: { officeId: office.id, action: 'BANK_TRANSACTION_UNRECONCILED', entityId: tx.id },
    })
    expect(audit).not.toBeNull()
  })

  it('C3.c [INV] — segunda conciliação da mesma transação → 409; expectedVersion errada → 409', async () => {
    const { office, client, account, statementImport } = await seedBase()
    const doc1 = await makeValidatedDoc({ officeId: office.id, clientId: client.id, totalAmount: '246.00' })
    const doc2 = await makeValidatedDoc({ officeId: office.id, clientId: client.id, totalAmount: '246.00' })
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600,
    })

    const first = await reconcile(tx.id, { documentIds: [doc1.id], expectedVersion: 1 })
    expect(first.status).toBe(200)
    const second = await reconcile(tx.id, { documentIds: [doc2.id], expectedVersion: 2 })
    expect(second.status).toBe(409)
    expect(await prisma.reconciliationEntry.count({ where: { bankTransactionId: tx.id } })).toBe(1)

    // Versão desatualizada noutra transação nova → 409 (A7)
    const tx2 = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600,
      description: 'OUTRA',
    })
    const stale = await reconcile(tx2.id, { documentIds: [doc2.id], expectedVersion: 99 })
    expect(stale.status).toBe(409)
  })

  it('C3.d [INV] — conciliação multi-documento: somas não fecham → 422; a fechar → 200 com N documentos', async () => {
    const { office, client, account, statementImport } = await seedBase()
    const doc1 = await makeValidatedDoc({ officeId: office.id, clientId: client.id, totalAmount: '200.00' })
    const doc2 = await makeValidatedDoc({ officeId: office.id, clientId: client.id, totalAmount: '46.00' })
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600,
    })

    const bad = await reconcile(tx.id, { documentIds: [doc1.id], expectedVersion: 1 }) // 200 ≠ 246
    expect(bad.status).toBe(422)
    expect(await prisma.reconciliationEntry.count({ where: { bankTransactionId: tx.id } })).toBe(0)

    const good = await reconcile(tx.id, { documentIds: [doc1.id, doc2.id], expectedVersion: 1 })
    expect(good.status).toBe(200)
    const entry = await prisma.reconciliationEntry.findFirstOrThrow({
      where: { bankTransactionId: tx.id },
    })
    expect(entry.documentIds.sort()).toEqual([doc1.id, doc2.id].sort())
    for (const id of [doc1.id, doc2.id]) {
      const d = await prisma.document.findUniqueOrThrow({ where: { id } })
      expect(d.reconciledEntryId).toBe(entry.id)
    }
  })

  it('C3.e [INV] — ignorar exige motivo; regra IGNORAR marca IGNORED com referência à regra e NUNCA gera sugestões', async () => {
    const { office, owner, client, account } = await seedBase()
    await makeValidatedDoc({
      officeId: office.id,
      clientId: client.id,
      totalAmount: '12.50',
      dueDate: '2026-06-02',
    })

    // ignorar manual sem motivo → 400
    const st = await prisma.bankStatementImport.findFirstOrThrow({ where: { officeId: office.id } })
    const manualTx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: st.id,
      amountCents: -100,
      description: 'COMISSAO MANUTENCAO',
    })
    const noReason = await reconcile(manualTx.id, { ignore: true, expectedVersion: 1 })
    expect(noReason.status).toBe(400)

    // regra IGNORAR aplicada no import
    const ruleRes = await createRuleRoute(
      jsonRequest('/api/bank/rules', 'POST', {
        matchType: 'CONTAINS',
        pattern: 'COMISSAO',
        action: 'IGNORE',
        priority: 10,
      })
    )
    expect(ruleRes.status).toBe(200)
    const rule = (await ruleRes.json()).data

    const { POST: createImportRoute } = await import('@/app/api/bank/imports/route')
    const { POST: confirmImportRoute } = await import('@/app/api/bank/imports/[importId]/confirm/route')
    const csv = ['Data;Descrição;Montante', '02/06/2026;COMISSAO GESTAO CONTA;-12,50'].join('\r\n')
    const form = new FormData()
    form.append('file', new File([new Uint8Array(Buffer.from(csv))], 'com.csv', { type: 'text/csv' }))
    form.append('bankAccountId', account.id)
    const created = await createImportRoute(
      new NextRequest('http://localhost:3000/api/bank/imports', { method: 'POST', body: form })
    )
    const body = await created.json()
    await confirmImportRoute(
      jsonRequest(`/api/bank/imports/${body.data.importId}/confirm`, 'POST', {
        mapping: body.data.proposedMapping,
      }),
      { params: Promise.resolve({ importId: body.data.importId }) }
    )

    const ignored = await prisma.bankTransaction.findFirstOrThrow({
      where: { officeId: office.id, description: 'COMISSAO GESTAO CONTA' },
    })
    expect(ignored.status).toBe('IGNORED')
    const entry = await prisma.reconciliationEntry.findFirstOrThrow({
      where: { bankTransactionId: ignored.id },
    })
    expect(entry.ignored).toBe(true)
    expect(entry.ruleId).toBe(rule.id)
    expect(entry.reconciledByUserId).toBeNull() // aplicada pelo sistema
    // NUNCA gera sugestões, mesmo havendo documento com o mesmo montante
    expect(
      await prisma.reconciliationSuggestion.count({ where: { bankTransactionId: ignored.id } })
    ).toBe(0)
    void owner
  })

  it('C3.f [INV] — transação conciliada nunca reaparece como candidata; documento conciliado idem', async () => {
    const { office, client, account, statementImport } = await seedBase()
    const doc = await makeValidatedDoc({
      officeId: office.id,
      clientId: client.id,
      totalAmount: '246.00',
      dueDate: '2026-06-11',
    })
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600,
    })
    await reconcile(tx.id, { documentIds: [doc.id], expectedVersion: 1 })

    // matching re-corrido sobre a tx conciliada → no-op
    const rerun = await generateSuggestionsForTransaction({
      officeId: office.id,
      bankTransactionId: tx.id,
    })
    expect(rerun.ok).toBe(true)
    const txAfter = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx.id } })
    expect(txAfter.status).toBe('RECONCILED')

    // outra transação igual — o documento conciliado já não é candidato
    const tx2 = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600,
      description: 'TRF P/ 509888777 REPETIDA',
    })
    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx2.id })
    expect(
      await prisma.reconciliationSuggestion.count({ where: { bankTransactionId: tx2.id } })
    ).toBe(0)
  })

  it('C3.g [INV] — VIEWER só lê: reconcile/unreconcile/regras → 404; cross-tenant → 404', async () => {
    const { office, client, account, statementImport } = await seedBase()
    const doc = await makeValidatedDoc({ officeId: office.id, clientId: client.id, totalAmount: '10.00' })
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -1000,
    })

    const viewer = await makeUser({ officeId: office.id, role: 'VIEWER' })
    setSession({ id: viewer.id, email: viewer.email, officeId: office.id, role: 'VIEWER' })
    expect((await reconcile(tx.id, { documentIds: [doc.id], expectedVersion: 1 })).status).toBe(404)
    expect((await unreconcile(tx.id)).status).toBe(404)
    expect(
      (
        await createRuleRoute(
          jsonRequest('/api/bank/rules', 'POST', {
            matchType: 'CONTAINS', pattern: 'X', action: 'IGNORE',
          })
        )
      ).status
    ).toBe(404)
    expect((await listRulesRoute(jsonRequest('/api/bank/rules', 'GET'))).status).toBe(404)
    expect(await prisma.reconciliationEntry.count()).toBe(0)

    // cross-tenant
    const { officeB, ownerB } = await makeTwoOffices()
    setSession({ id: ownerB.id, email: ownerB.email, officeId: officeB.id, role: 'OWNER' })
    expect((await reconcile(tx.id, { documentIds: [doc.id], expectedVersion: 1 })).status).toBe(404)
    expect((await unreconcile(tx.id)).status).toBe(404)
    expect(await prisma.reconciliationEntry.count()).toBe(0)
  })

  it('C3.h — regra SUGERIR_CLIENTE redireciona os candidatos para o cliente alvo', async () => {
    const { office, client, account, statementImport } = await seedBase()
    const otherClient = await makeClient({ officeId: office.id, name: 'Cliente Alvo' })
    // documento do cliente alvo (não do cliente da conta)
    await makeValidatedDoc({
      officeId: office.id,
      clientId: otherClient.id,
      totalAmount: '99.00',
      supplierNif: '505111222',
      dueDate: '2026-06-12',
    })
    await createRuleRoute(
      jsonRequest('/api/bank/rules', 'POST', {
        matchType: 'CONTAINS',
        pattern: 'RENDA ARMAZEM',
        action: 'SUGGEST_CLIENT',
        targetClientId: otherClient.id,
        priority: 5,
      })
    )
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -9900,
      description: 'RENDA ARMAZEM 505111222',
    })
    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx.id })
    const s = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { bankTransactionId: tx.id },
    })
    expect(s.scoreTotal).toBe(95)
    void client
  })
})
