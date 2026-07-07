import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser, makeClient } from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('@/lib/anthropic', async () => (await import('../mocks/ai')).aiMockFactory())

import {
  generateSuggestionsForTransaction,
  validateReconciliationTotals,
} from '@/server/services/bank-matching'
import { aiState } from '../mocks/ai'

/**
 * 🔴RED C2 [INV] — deterministic matching engine (no AI in this phase).
 * Weights: amount 50 (eliminatory), date 25, NIF/name 20, reference +15.
 * ≥75 → autoMatch suggestion + tx SUGGESTED; 45–74 → review suggestion;
 * <45 → nothing. Reconciliation itself stays human (C3).
 */

async function seedBase() {
  const office = await makeOffice()
  const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
  const client = await makeClient({ officeId: office.id, name: 'Cliente Match' })
  const account = await prisma.bankAccount.create({
    data: { officeId: office.id, clientId: client.id, name: 'Conta Teste' },
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
  return { office, owner, client, account, statementImport }
}

async function makeTx(params: {
  officeId: string
  bankAccountId: string
  importId: string
  amountCents: number
  bookingDate: string // ISO date
  description: string
}) {
  return prisma.bankTransaction.create({
    data: {
      officeId: params.officeId,
      bankAccountId: params.bankAccountId,
      importId: params.importId,
      bookingDate: new Date(`${params.bookingDate}T12:00:00.000Z`),
      description: params.description,
      amountCents: params.amountCents,
      dedupHash: `dedup-${params.description}-${params.amountCents}-${params.bookingDate}`,
    },
  })
}

async function makeDoc(params: {
  officeId: string
  clientId: string | null
  totalAmount: string
  supplierNif?: string
  supplierName?: string
  documentNumber?: string
  issueDate?: string
  dueDate?: string
  status?: 'VALIDATED' | 'EXPORTED' | 'NEEDS_REVIEW'
  type?: 'INVOICE_RECEIVED' | 'INVOICE_ISSUED'
  reconciledEntryId?: string
}) {
  return prisma.document.create({
    data: {
      officeId: params.officeId,
      clientId: params.clientId,
      status: params.status ?? 'VALIDATED',
      type: params.type ?? 'INVOICE_RECEIVED',
      totalAmount: params.totalAmount,
      supplierNif: params.supplierNif ?? null,
      supplierName: params.supplierName ?? null,
      documentNumber: params.documentNumber ?? null,
      issueDate: params.issueDate ? new Date(`${params.issueDate}T12:00:00.000Z`) : null,
      dueDate: params.dueDate ? new Date(`${params.dueDate}T12:00:00.000Z`) : null,
      reconciledEntryId: params.reconciledEntryId ?? null,
    },
  })
}

describe('🔴RED C2 — motor de matching determinístico', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    aiState.reset()
  })

  it('C2.a [INV] — montante exato + NIF na descrição + data a 2 dias → score 95 EXATO, autoMatch, tx SUGGESTED, breakdown persistido', async () => {
    const { office, client, account, statementImport } = await seedBase()
    await makeDoc({
      officeId: office.id,
      clientId: client.id,
      totalAmount: '246.00',
      supplierNif: '509888777',
      supplierName: 'Fornecedor Gama',
      documentNumber: 'FT 2026/55',
      dueDate: '2026-06-10',
    })
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600,
      bookingDate: '2026-06-12', // dueDate + 2 dias
      description: 'TRF P/ 509888777 PAGAMENTO', // NIF presente, nº doc ausente
    })

    const result = await generateSuggestionsForTransaction({
      officeId: office.id,
      bankTransactionId: tx.id,
    })
    expect(result.ok).toBe(true)

    const suggestions = await prisma.reconciliationSuggestion.findMany({
      where: { officeId: office.id, bankTransactionId: tx.id },
    })
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].scoreTotal).toBe(95) // 50 + 25 + 20 + 0 — asserção ao ponto
    expect(suggestions[0].autoMatch).toBe(true)
    expect(suggestions[0].status).toBe('PENDING')
    // scoreBreakdown persiste as parcelas
    expect(suggestions[0].scoreBreakdown).toEqual({ amount: 50, date: 25, entity: 20, reference: 0 })

    const updated = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx.id } })
    expect(updated.status).toBe('SUGGESTED')
    // NUNCA conciliada automaticamente nesta v1
    expect(updated.status).not.toBe('RECONCILED')
    expect(aiState.calls).toBe(0) // motor 100% determinístico
  })

  it('C2.b [INV] — montante fora de tolerância → ZERO sugestões mesmo com NIF e data perfeitos (eliminatório)', async () => {
    const { office, client, account, statementImport } = await seedBase()
    await makeDoc({
      officeId: office.id,
      clientId: client.id,
      totalAmount: '246.00',
      supplierNif: '509888777',
      dueDate: '2026-06-12',
    })
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24700, // desvio de 100 cêntimos (tolerância default 2)
      bookingDate: '2026-06-12',
      description: 'TRF P/ 509888777 PAGAMENTO',
    })

    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx.id })
    expect(await prisma.reconciliationSuggestion.count({ where: { bankTransactionId: tx.id } })).toBe(0)
    const updated = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx.id } })
    expect(updated.status).toBe('UNRECONCILED')
  })

  it('C2.c — dentro da tolerância do office → 45 pontos de montante; tolerância é configurável por office', async () => {
    const { office, client, account, statementImport } = await seedBase()
    await makeDoc({
      officeId: office.id,
      clientId: client.id,
      totalAmount: '246.00',
      supplierNif: '509888777',
      dueDate: '2026-06-12',
    })
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24602, // 2 cêntimos de desvio — dentro da tolerância default
      bookingDate: '2026-06-12',
      description: 'TRF P/ 509888777',
    })

    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx.id })
    const s = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { bankTransactionId: tx.id },
    })
    expect((s.scoreBreakdown as Record<string, number>).amount).toBe(45)
    expect(s.scoreTotal).toBe(90) // 45 + 25 + 20

    // Tolerância a zero elimina o mesmo candidato
    await prisma.office.update({
      where: { id: office.id },
      data: { reconciliationToleranceCents: 0 },
    })
    const tx2 = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24602,
      bookingDate: '2026-06-12',
      description: 'TRF P/ 509888777 SEGUNDA',
    })
    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx2.id })
    expect(await prisma.reconciliationSuggestion.count({ where: { bankTransactionId: tx2.id } })).toBe(0)
  })

  it('C2.d [INV] — documento de OUTRO cliente do mesmo office nunca é candidato', async () => {
    const { office, client, account, statementImport } = await seedBase()
    const otherClient = await makeClient({ officeId: office.id, name: 'Outro Cliente' })
    await makeDoc({
      officeId: office.id,
      clientId: otherClient.id, // mesmo office, cliente errado
      totalAmount: '246.00',
      supplierNif: '509888777',
      dueDate: '2026-06-12',
    })
    await makeDoc({
      officeId: office.id,
      clientId: null, // documento sem cliente também não é candidato
      totalAmount: '246.00',
      supplierNif: '509888777',
      dueDate: '2026-06-12',
    })
    void client
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600,
      bookingDate: '2026-06-12',
      description: 'TRF P/ 509888777',
    })

    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx.id })
    expect(await prisma.reconciliationSuggestion.count({ where: { bankTransactionId: tx.id } })).toBe(0)
  })

  it('C2.e [INV] — documento já conciliado ou não VALIDADO/EXPORTADO nunca é candidato', async () => {
    const { office, client, account, statementImport } = await seedBase()
    // Entry real (C3 adicionou a FK): transação antiga já conciliada
    const reconciledTx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600,
      bookingDate: '2026-05-01',
      description: 'MOVIMENTO ANTIGO CONCILIADO',
    })
    const entry = await prisma.reconciliationEntry.create({
      data: {
        officeId: office.id,
        bankTransactionId: reconciledTx.id,
        documentIds: [],
        reconciledByUserId: null,
      },
    })
    await makeDoc({
      officeId: office.id,
      clientId: client.id,
      totalAmount: '246.00',
      supplierNif: '509888777',
      dueDate: '2026-06-12',
      reconciledEntryId: entry.id, // já conciliado
    })
    await makeDoc({
      officeId: office.id,
      clientId: client.id,
      totalAmount: '246.00',
      supplierNif: '509888777',
      dueDate: '2026-06-12',
      status: 'NEEDS_REVIEW', // não validado
    })
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600,
      bookingDate: '2026-06-12',
      description: 'TRF P/ 509888777',
    })

    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx.id })
    expect(await prisma.reconciliationSuggestion.count({ where: { bankTransactionId: tx.id } })).toBe(0)
  })

  it('C2.f — sinal: débito casa com documentos recebidos; crédito com emitidos', async () => {
    const { office, client, account, statementImport } = await seedBase()
    await makeDoc({
      officeId: office.id,
      clientId: client.id,
      type: 'INVOICE_ISSUED', // emitida — só casa com créditos
      totalAmount: '246.00',
      supplierNif: '509888777',
      dueDate: '2026-06-12',
    })
    const debit = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -24600, // débito
      bookingDate: '2026-06-12',
      description: 'TRF P/ 509888777',
    })
    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: debit.id })
    expect(await prisma.reconciliationSuggestion.count({ where: { bankTransactionId: debit.id } })).toBe(0)

    const credit = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: 24600, // crédito (recebimento)
      bookingDate: '2026-06-12',
      description: 'RECEBIMENTO 509888777',
    })
    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: credit.id })
    const s = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { bankTransactionId: credit.id },
    })
    expect(s.scoreTotal).toBe(95)
  })

  it('C2.g — nome do fornecedor (12), nº doc (+15) e datas (15/5) pontuam; 45–74 → autoMatch=false e tx continua UNRECONCILED', async () => {
    const { office, client, account, statementImport } = await seedBase()
    const doc = await makeDoc({
      officeId: office.id,
      clientId: client.id,
      totalAmount: '100.00',
      supplierNif: '509888777',
      supplierName: 'Águas do Norte',
      documentNumber: 'FT 9/2026',
      issueDate: '2026-06-01', // sem dueDate → usa issueDate
    })
    // nome normalizado presente + 10 dias → 50 + 15 + 12 = 77 ≥ 75 → autoMatch
    const tx1 = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -10000,
      bookingDate: '2026-06-11',
      description: 'DD AGUAS DO NORTE SA',
    })
    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx1.id })
    const s1 = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { bankTransactionId: tx1.id },
    })
    expect(s1.scoreBreakdown).toEqual({ amount: 50, date: 15, entity: 12, reference: 0 })
    expect(s1.scoreTotal).toBe(77)
    expect(s1.autoMatch).toBe(true)

    // nº doc na descrição (+15), 40 dias (5), sem NIF/nome → 50 + 5 + 0 + 15 = 70 → revisão
    const tx2 = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -10000,
      bookingDate: '2026-07-11',
      description: 'PAGAMENTO FT 9/2026',
    })
    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx2.id })
    const s2 = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { bankTransactionId: tx2.id },
    })
    expect(s2.scoreBreakdown).toEqual({ amount: 50, date: 5, entity: 0, reference: 15 })
    expect(s2.scoreTotal).toBe(70)
    expect(s2.autoMatch).toBe(false)
    const tx2After = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx2.id } })
    expect(tx2After.status).toBe('UNRECONCILED') // sugestão para revisão não muda o estado
    void doc
  })

  it('C2.h — máximo 5 sugestões por transação, ordenadas por score; unique (tx, doc) permite re-correr o matching', async () => {
    const { office, client, account, statementImport } = await seedBase()
    // 7 candidatos com o mesmo montante e datas progressivamente piores
    const dueDates = ['2026-06-12', '2026-06-11', '2026-06-10', '2026-06-05', '2026-06-01', '2026-05-20', '2026-05-10']
    for (const [i, dueDate] of dueDates.entries()) {
      await makeDoc({
        officeId: office.id,
        clientId: client.id,
        totalAmount: '55.00',
        supplierNif: '509888777',
        documentNumber: `FT ${i}/2026`,
        dueDate,
      })
    }
    const tx = await makeTx({
      officeId: office.id,
      bankAccountId: account.id,
      importId: statementImport.id,
      amountCents: -5500,
      bookingDate: '2026-06-12',
      description: 'TRF 509888777',
    })

    await generateSuggestionsForTransaction({ officeId: office.id, bankTransactionId: tx.id })
    const suggestions = await prisma.reconciliationSuggestion.findMany({
      where: { bankTransactionId: tx.id },
      orderBy: { scoreTotal: 'desc' },
    })
    expect(suggestions).toHaveLength(5)
    const scores = suggestions.map((s) => s.scoreTotal)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))

    // Re-correr não duplica (unique bankTransactionId+documentId)
    const again = await generateSuggestionsForTransaction({
      officeId: office.id,
      bankTransactionId: tx.id,
    })
    expect(again.ok).toBe(true)
    expect(await prisma.reconciliationSuggestion.count({ where: { bankTransactionId: tx.id } })).toBe(5)
  })

  it('C2.i [INV] — validação multi-documento: somas que não fecham → inválido (422 no ato de conciliar)', async () => {
    // Serviço puro — o endpoint de conciliação (C3) devolve 422 com esta validação
    const closes = validateReconciliationTotals({
      transactionAmountCents: -24600,
      documentTotalsCents: [20000, 4600],
      toleranceCents: 2,
    })
    expect(closes.ok).toBe(true)

    const short = validateReconciliationTotals({
      transactionAmountCents: -24600,
      documentTotalsCents: [20000, 4000], // 24000 ≠ 24600 ± 2
      toleranceCents: 2,
    })
    expect(short.ok).toBe(false)
    if (!short.ok) expect(short.deltaCents).toBe(600)
  })

  it('C2.j — import confirmado corre o matching automaticamente (wiring C1→C2)', async () => {
    const { office, owner, client, account } = await seedBase()
    await makeDoc({
      officeId: office.id,
      clientId: client.id,
      totalAmount: '1234.56',
      supplierNif: '509888777',
      dueDate: '2026-06-01',
    })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })

    const { POST: createImportRoute } = await import('@/app/api/bank/imports/route')
    const { POST: confirmImportRoute } = await import('@/app/api/bank/imports/[importId]/confirm/route')
    const { NextRequest } = await import('next/server')

    const csv = ['Data;Descrição;Montante', '02/06/2026;TRF 509888777 PAGAMENTO;-1.234,56'].join('\r\n')
    const form = new FormData()
    form.append('file', new File([new Uint8Array(Buffer.from(csv))], 'mov.csv', { type: 'text/csv' }))
    form.append('bankAccountId', account.id)
    const res = await createImportRoute(
      new NextRequest('http://localhost:3000/api/bank/imports', { method: 'POST', body: form })
    )
    const body = await res.json()
    const confirm = await confirmImportRoute(
      new NextRequest(`http://localhost:3000/api/bank/imports/${body.data.importId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping: body.data.proposedMapping }),
      }),
      { params: Promise.resolve({ importId: body.data.importId }) }
    )
    expect(confirm.status).toBe(200)

    const tx = await prisma.bankTransaction.findFirstOrThrow({ where: { officeId: office.id } })
    expect(tx.status).toBe('SUGGESTED') // 50 + 25 (1 dia) + 20 (NIF) = 95
    expect(await prisma.reconciliationSuggestion.count({ where: { bankTransactionId: tx.id } })).toBe(1)
  })
})
