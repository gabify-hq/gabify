import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeOffice, makeUser, makeClient } from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'
import { NextRequest } from 'next/server'
import { resetRateLimits } from '@/server/rate-limit'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('@/lib/anthropic', async () => (await import('../mocks/ai')).aiMockFactory())

import { POST as createAccountRoute, GET as listAccountsRoute } from '@/app/api/bank/accounts/route'
import { POST as createImportRoute } from '@/app/api/bank/imports/route'
import { POST as confirmImportRoute } from '@/app/api/bank/imports/[importId]/confirm/route'
import { GET as listTransactionsRoute } from '@/app/api/bank/transactions/route'
import { aiState } from '../mocks/ai'

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function importRequest(params: {
  content: string | Buffer
  filename?: string
  bankAccountId: string
  force?: boolean
}): NextRequest {
  const form = new FormData()
  const bytes = typeof params.content === 'string' ? Buffer.from(params.content, 'utf-8') : params.content
  form.append(
    'file',
    new File([new Uint8Array(bytes)], params.filename ?? 'extrato.csv', { type: 'text/csv' })
  )
  form.append('bankAccountId', params.bankAccountId)
  if (params.force) form.append('force', 'true')
  return new NextRequest('http://localhost:3000/api/bank/imports', { method: 'POST', body: form })
}

async function confirmImport(importId: string, mapping: unknown) {
  return confirmImportRoute(
    jsonRequest(`/api/bank/imports/${importId}/confirm`, 'POST', { mapping }),
    { params: Promise.resolve({ importId }) }
  )
}

/** Full wizard: create (step 1) + confirm proposed mapping (step 2). */
async function runImport(params: { content: string; bankAccountId: string; filename?: string; force?: boolean }) {
  const res = await createImportRoute(importRequest(params))
  expect(res.status).toBe(200)
  const body = await res.json()
  const confirm = await confirmImport(body.data.importId, body.data.proposedMapping)
  expect(confirm.status).toBe(200)
  return { importId: body.data.importId as string, report: (await confirm.json()).data }
}

const CSV_SINGLE_COLUMN = [
  'Data;Data Valor;Descrição;Montante;Saldo',
  '02/06/2026;02/06/2026;TRF EDP COMERCIAL LDA;-1.234,56;10.000,00',
  '03/06/2026;03/06/2026;PAGAMENTO SERVICOS AGUAS;-45,00;9.955,00',
  '05/06/2026;05/06/2026;RECEBIMENTO CLIENTE XPTO;500,00;10.455,00',
].join('\r\n')

const CSV_DEBIT_CREDIT = [
  'Data;Descritivo;Débito;Crédito;Saldo',
  '03/06/2026;PAGAMENTO SERVICOS AGUAS;45,00;;9.955,00',
  '05/06/2026;RECEBIMENTO CLIENTE XPTO;;500,00;10.455,00',
].join('\r\n')

const CSV_WITH_DUPLICATE_ROW = [
  'Data;Descrição;Montante',
  '02/06/2026;TRF EDP COMERCIAL LDA;-1.234,56',
  '02/06/2026;TRF EDP COMERCIAL LDA;-1.234,56',
  '03/06/2026;OUTRO MOVIMENTO;-10,00',
].join('\r\n')

describe('🔴RED C1 — modelos e import de extratos bancários', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    aiState.reset()
  })

  async function seedOwnerWithAccount() {
    const office = await makeOffice()
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const client = await makeClient({ officeId: office.id, name: 'Cliente Banco' })
    setSession({ id: owner.id, email: owner.email, officeId: office.id, role: 'OWNER' })
    const res = await createAccountRoute(
      jsonRequest('/api/bank/accounts', 'POST', {
        clientId: client.id,
        name: 'Conta BCP',
        iban: 'PT50000201231234567890154',
      })
    )
    expect(res.status).toBe(200)
    const account = (await res.json()).data
    return { office, owner, client, account }
  }

  it('C1.a [INV] — "1.234,56" importa como 123456 cêntimos (débito negativo); datas e saldo corretos', async () => {
    const { office, account } = await seedOwnerWithAccount()

    const { report } = await runImport({ content: CSV_SINGLE_COLUMN, bankAccountId: account.id })
    expect(report.imported).toBe(3)

    const txs = await prisma.bankTransaction.findMany({
      where: { officeId: office.id, bankAccountId: account.id },
      orderBy: { bookingDate: 'asc' },
    })
    expect(txs).toHaveLength(3)
    expect(txs[0].amountCents).toBe(-123456)
    expect(txs[0].description).toBe('TRF EDP COMERCIAL LDA')
    expect(txs[0].bookingDate.toISOString().slice(0, 10)).toBe('2026-06-02')
    expect(txs[0].balanceCents).toBe(1000000)
    expect(txs[0].status).toBe('UNRECONCILED')
    expect(txs[2].amountCents).toBe(50000) // crédito positivo

    const imported = await prisma.bankStatementImport.findUniqueOrThrow({
      where: { id: txs[0].importId },
    })
    expect(imported.status).toBe('PROCESSED')
    expect(imported.rowCount).toBe(3)
    expect(imported.periodFrom?.toISOString().slice(0, 10)).toBe('2026-06-02')
    expect(imported.periodTo?.toISOString().slice(0, 10)).toBe('2026-06-05')
  })

  it('C1.b [INV] — coluna única "-45,00" e colunas Débito/Crédito separadas produzem o mesmo amountCents', async () => {
    const { office, account } = await seedOwnerWithAccount()

    await runImport({ content: CSV_SINGLE_COLUMN, bankAccountId: account.id, filename: 'a.csv' })
    const single = await prisma.bankTransaction.findFirstOrThrow({
      where: { officeId: office.id, description: 'PAGAMENTO SERVICOS AGUAS' },
    })
    expect(single.amountCents).toBe(-4500)

    // Second account so the dedup hash never collides across the two files
    const client2 = await makeClient({ officeId: office.id, name: 'Cliente 2' })
    const res2 = await createAccountRoute(
      jsonRequest('/api/bank/accounts', 'POST', { clientId: client2.id, name: 'Conta CGD' })
    )
    const account2 = (await res2.json()).data

    await runImport({ content: CSV_DEBIT_CREDIT, bankAccountId: account2.id, filename: 'b.csv' })
    const split = await prisma.bankTransaction.findMany({
      where: { officeId: office.id, bankAccountId: account2.id },
      orderBy: { bookingDate: 'asc' },
    })
    expect(split[0].amountCents).toBe(-4500) // Débito=45,00 → negativo
    expect(split[1].amountCents).toBe(50000) // Crédito=500,00 → positivo
  })

  it('C1.c [INV] — linha repetida no mesmo ficheiro → 1 transação + 1 aviso no relatório (nunca 500)', async () => {
    const { office, account } = await seedOwnerWithAccount()

    const { report } = await runImport({ content: CSV_WITH_DUPLICATE_ROW, bankAccountId: account.id })
    expect(report.imported).toBe(2)
    expect(report.skippedDuplicates).toHaveLength(1)
    expect(report.skippedDuplicates[0].line).toBe(2)

    const count = await prisma.bankTransaction.count({
      where: { officeId: office.id, bankAccountId: account.id },
    })
    expect(count).toBe(2)
  })

  it('C1.d [INV] — mesmo ficheiro 2× → 409; com force → aceite mas dedupHash evita transações duplicadas', async () => {
    const { office, account } = await seedOwnerWithAccount()

    await runImport({ content: CSV_SINGLE_COLUMN, bankAccountId: account.id })

    const again = await createImportRoute(
      importRequest({ content: CSV_SINGLE_COLUMN, bankAccountId: account.id })
    )
    expect(again.status).toBe(409)

    const forced = await createImportRoute(
      importRequest({ content: CSV_SINGLE_COLUMN, bankAccountId: account.id, force: true })
    )
    expect(forced.status).toBe(200)
    const forcedBody = await forced.json()
    const confirm = await confirmImport(forcedBody.data.importId, forcedBody.data.proposedMapping)
    expect(confirm.status).toBe(200)
    const report = (await confirm.json()).data
    expect(report.imported).toBe(0)
    expect(report.skippedDuplicates).toHaveLength(3)

    expect(
      await prisma.bankTransaction.count({ where: { officeId: office.id, bankAccountId: account.id } })
    ).toBe(3)
  })

  it('C1.e [INV] — extrato do office A invisível no office B (contas, transações e import cross-tenant → 404/vazio)', async () => {
    const { officeA, officeB, ownerA, ownerB } = await makeTwoOffices()
    const clientA = await makeClient({ officeId: officeA.id })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const resA = await createAccountRoute(
      jsonRequest('/api/bank/accounts', 'POST', { clientId: clientA.id, name: 'Conta A' })
    )
    const accountA = (await resA.json()).data
    await runImport({ content: CSV_SINGLE_COLUMN, bankAccountId: accountA.id })

    setSession({ id: ownerB.id, email: ownerB.email, officeId: officeB.id, role: 'OWNER' })

    const accounts = await listAccountsRoute(jsonRequest('/api/bank/accounts', 'GET'))
    expect((await accounts.json()).data.items).toHaveLength(0)

    const txs = await listTransactionsRoute(
      jsonRequest(`/api/bank/transactions?bankAccountId=${accountA.id}`, 'GET')
    )
    expect(txs.status).toBe(404) // conta identificável de outro office → 404, nunca 403

    const importAttempt = await createImportRoute(
      importRequest({ content: CSV_SINGLE_COLUMN, bankAccountId: accountA.id })
    )
    expect(importAttempt.status).toBe(404)
    expect(await prisma.bankStatementImport.count({ where: { officeId: officeB.id } })).toBe(0)
  })

  it('C1.f [INV] — VIEWER não importa nem cria contas (404), mas lê transações (bank:read)', async () => {
    const { office, account } = await seedOwnerWithAccount()
    await runImport({ content: CSV_SINGLE_COLUMN, bankAccountId: account.id })

    const viewer = await makeUser({ officeId: office.id, role: 'VIEWER' })
    setSession({ id: viewer.id, email: viewer.email, officeId: office.id, role: 'VIEWER' })

    const importRes = await createImportRoute(
      importRequest({ content: CSV_DEBIT_CREDIT, bankAccountId: account.id })
    )
    expect(importRes.status).toBe(404)
    expect(await prisma.bankStatementImport.count({ where: { officeId: office.id } })).toBe(1)

    const accountRes = await createAccountRoute(
      jsonRequest('/api/bank/accounts', 'POST', { name: 'Conta Viewer' })
    )
    expect(accountRes.status).toBe(404)

    const list = await listTransactionsRoute(
      jsonRequest(`/api/bank/transactions?bankAccountId=${account.id}`, 'GET')
    )
    expect(list.status).toBe(200)
    expect((await list.json()).data.items).toHaveLength(3)
  })

  it('C1.g [INV] — confirmação humana obrigatória: sem confirm não há transações; segunda confirm → 409', async () => {
    const { office, account } = await seedOwnerWithAccount()

    const res = await createImportRoute(importRequest({ content: CSV_SINGLE_COLUMN, bankAccountId: account.id }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.proposedMapping).toMatchObject({ bookingDate: 'Data', description: 'Descrição' })
    expect(body.data.mappingSource).toBe('heuristic') // cabeçalhos PT comuns → zero IA
    expect(aiState.calls).toBe(0)

    expect(await prisma.bankTransaction.count({ where: { officeId: office.id } })).toBe(0)
    const pending = await prisma.bankStatementImport.findUniqueOrThrow({ where: { id: body.data.importId } })
    expect(pending.status).toBe('PENDING')

    const first = await confirmImport(body.data.importId, body.data.proposedMapping)
    expect(first.status).toBe(200)
    const second = await confirmImport(body.data.importId, body.data.proposedMapping)
    expect(second.status).toBe(409)
    expect(await prisma.bankTransaction.count({ where: { officeId: office.id } })).toBe(3)
  })

  it('C1.h — cabeçalhos crípticos → fallback IA propõe mapping; confirmação continua obrigatória', async () => {
    const { office, account } = await seedOwnerWithAccount()
    const cryptic = [
      'C1;C2;C3',
      '02/06/2026;MOVIMENTO MISTERIOSO;-1,00',
    ].join('\r\n')
    aiState.queue.push(
      JSON.stringify({ mapping: { bookingDate: 'C1', description: 'C2', amount: 'C3' } })
    )

    const res = await createImportRoute(importRequest({ content: cryptic, bankAccountId: account.id }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.mappingSource).toBe('ai')
    expect(aiState.calls).toBe(1)
    expect(await prisma.bankTransaction.count({ where: { officeId: office.id } })).toBe(0)

    const confirm = await confirmImport(body.data.importId, body.data.proposedMapping)
    expect(confirm.status).toBe(200)
    const tx = await prisma.bankTransaction.findFirstOrThrow({ where: { officeId: office.id } })
    expect(tx.amountCents).toBe(-100)
  })

  it('C1.i — magic bytes: PNG disfarçado de .xlsx → 422; ficheiro >10MB → 413', async () => {
    const { account } = await seedOwnerWithAccount()

    // PNG signature followed by junk, named .xlsx
    const fakeXlsx = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(256, 1),
    ])
    const fake = await createImportRoute(
      importRequest({ content: fakeXlsx, filename: 'extrato.xlsx', bankAccountId: account.id })
    )
    expect(fake.status).toBe(422)

    const huge = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41)
    const tooBig = await createImportRoute(
      importRequest({ content: huge, filename: 'grande.csv', bankAccountId: account.id })
    )
    expect(tooBig.status).toBe(413)

    expect(await prisma.bankStatementImport.count()).toBe(0)
  })
})
