import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeUser, makeClient } from '../helpers/factories'
import { setSession, authMockFactory, type TestSessionUser } from '../helpers/session'
import { NextRequest } from 'next/server'
import { resetRateLimits } from '@/server/rate-limit'

vi.mock('@/lib/auth', () => authMockFactory())

/**
 * AUDIT F3.10 — conciliação manual (UX jornada 4). Um movimento sem sugestões
 * só tinha "Ignorar"; agora há pesquisa de documentos candidatos e ligação
 * manual, com a MESMA validação de soma do servidor (422 fora da tolerância).
 */

function asSession(user: TestSessionUser) {
  setSession(user)
}

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function seedBankWorld() {
  const { officeA, officeB, ownerA } = await makeTwoOffices()
  const client = await makeClient({ officeId: officeA.id, name: 'Cliente Banco' })
  const otherClient = await makeClient({ officeId: officeA.id, name: 'Outro Cliente' })
  const account = await prisma.bankAccount.create({
    data: {
      officeId: officeA.id,
      clientId: client.id,
      name: 'Conta à ordem',
      iban: 'PT50000000000000000000001',
    },
  })
  const importRow = await prisma.bankStatementImport.create({
    data: {
      officeId: officeA.id,
      bankAccountId: account.id,
      filename: 'extrato.csv',
      fileHash: 'hash-1',
      status: 'PROCESSED',
      mappingSource: 'heuristic',
      proposedMapping: { bookingDate: 'Data', description: 'Descritivo', amount: 'Montante' },
      rowsData: [],
      rowCount: 1,
      importedByUserId: ownerA.id,
    },
  })
  const tx = await prisma.bankTransaction.create({
    data: {
      officeId: officeA.id,
      bankAccountId: account.id,
      importId: importRow.id,
      bookingDate: new Date(Date.UTC(2026, 6, 1, 12)),
      description: 'TRF FORNECEDOR SEM MATCH',
      amountCents: -30000, // 300,00 € débito
      dedupHash: 'dedup-1',
      status: 'UNRECONCILED',
    },
  })

  const makeDoc = (params: {
    officeId: string
    clientId: string
    number: string
    total: string
    supplier?: string
  }) =>
    prisma.document.create({
      data: {
        officeId: params.officeId,
        clientId: params.clientId,
        source: 'MANUAL_UPLOAD',
        status: 'VALIDATED',
        type: 'INVOICE_RECEIVED',
        confidence: 0.95,
        documentNumber: params.number,
        supplierName: params.supplier ?? 'Fornecedor Manual',
        supplierNif: '508234567',
        issueDate: new Date(Date.UTC(2026, 5, 28, 12)),
        totalAmount: params.total,
        originalFilename: `${params.number}.pdf`,
      },
    })

  const doc100 = await makeDoc({ officeId: officeA.id, clientId: client.id, number: 'FT M/100', total: '100.00' })
  const doc200 = await makeDoc({ officeId: officeA.id, clientId: client.id, number: 'FT M/200', total: '200.00' })
  const docOtherClient = await makeDoc({
    officeId: officeA.id, clientId: otherClient.id, number: 'FT OC/1', total: '300.00',
  })
  const ownerBDocOffice = officeB.id
  const docOtherOffice = await makeDoc({
    officeId: ownerBDocOffice, clientId: (await makeClient({ officeId: officeB.id })).id,
    number: 'FT OF/1', total: '300.00',
  })

  return { officeA, officeB, ownerA, client, account, tx, doc100, doc200, docOtherClient, docOtherOffice }
}

describe('AUDIT-F3.10 conciliação manual', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    setSession(null)
  })

  it('pesquisa de candidatos: só documentos do cliente da conta, do próprio office, por nº/fornecedor', async () => {
    const world = await seedBankWorld()
    asSession({ id: world.ownerA.id, email: world.ownerA.email, officeId: world.officeA.id, role: 'OWNER' })

    const { GET } = await import('@/app/api/bank/transactions/[transactionId]/candidates/route')
    const res = await GET(
      jsonRequest(`/api/bank/transactions/${world.tx.id}/candidates?q=FT M`, 'GET'),
      { params: Promise.resolve({ transactionId: world.tx.id }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const numbers = body.data.items.map((d: { documentNumber: string }) => d.documentNumber)
    expect(numbers).toContain('FT M/100')
    expect(numbers).toContain('FT M/200')
    expect(numbers).not.toContain('FT OC/1') // outro cliente
    expect(numbers).not.toContain('FT OF/1') // outro office

    // Pesquisa por fornecedor também encontra
    const bySupplier = await GET(
      jsonRequest(`/api/bank/transactions/${world.tx.id}/candidates?q=Fornecedor Manual`, 'GET'),
      { params: Promise.resolve({ transactionId: world.tx.id }) },
    )
    expect((await bySupplier.json()).data.items.length).toBeGreaterThanOrEqual(2)
  })

  it('candidatos: transação de outro office → 404', async () => {
    const world = await seedBankWorld()
    const ownerB = await prisma.user.findFirstOrThrow({
      where: { officeId: world.officeB.id, role: 'OWNER' },
    })
    asSession({ id: ownerB.id, email: ownerB.email, officeId: world.officeB.id, role: 'OWNER' })

    const { GET } = await import('@/app/api/bank/transactions/[transactionId]/candidates/route')
    const res = await GET(
      jsonRequest(`/api/bank/transactions/${world.tx.id}/candidates?q=FT`, 'GET'),
      { params: Promise.resolve({ transactionId: world.tx.id }) },
    )
    expect(res.status).toBe(404)
  })

  it('conciliação manual multi-documento: soma errada → 422; certa → RECONCILED como as automáticas', async () => {
    const world = await seedBankWorld()
    asSession({ id: world.ownerA.id, email: world.ownerA.email, officeId: world.officeA.id, role: 'OWNER' })

    const { POST } = await import('@/app/api/bank/transactions/[transactionId]/reconcile/route')

    // 100 + 100 ≠ 300 → 422 (mesma validação do servidor)
    const wrong = await POST(
      jsonRequest(`/api/bank/transactions/${world.tx.id}/reconcile`, 'POST', {
        documentIds: [world.doc100.id],
        expectedVersion: 1,
      }),
      { params: Promise.resolve({ transactionId: world.tx.id }) },
    )
    expect(wrong.status).toBe(422)

    // 100 + 200 = 300 → concilia
    const right = await POST(
      jsonRequest(`/api/bank/transactions/${world.tx.id}/reconcile`, 'POST', {
        documentIds: [world.doc100.id, world.doc200.id],
        expectedVersion: 1,
      }),
      { params: Promise.resolve({ transactionId: world.tx.id }) },
    )
    expect(right.status).toBe(200)

    const tx = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: world.tx.id } })
    expect(tx.status).toBe('RECONCILED')
    const entry = await prisma.reconciliationEntry.findFirstOrThrow({
      where: { bankTransactionId: world.tx.id },
    })
    expect(entry).not.toBeNull()
    const linked = await prisma.document.findMany({
      where: { reconciledEntryId: entry.id },
      select: { id: true },
    })
    expect(new Set(linked.map((d) => d.id))).toEqual(new Set([world.doc100.id, world.doc200.id]))
  })
})
