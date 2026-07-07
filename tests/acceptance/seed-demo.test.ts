import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { isValidNif } from '@/lib/nif'

// The demo seed must NEVER touch the AI pipeline — any access fails the run.
vi.mock('@/lib/anthropic', () => ({
  anthropic: new Proxy(
    {},
    {
      get() {
        throw new Error('AI pipeline touched by seed:demo — forbidden')
      },
    },
  ),
  CLAUDE_MODEL: 'claude-test',
}))

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())

// 🔴RED — the service does not exist until the implementation lands (TDD)
import { seedDemo, DEMO_OFFICE_NAME } from '@/server/services/demo-seed-service'

async function snapshotCounts() {
  const [offices, users, clients, documents, bankAccounts, bankTransactions, suggestions, entries, emailActions, supplierRules, bankRules] =
    await Promise.all([
      prisma.office.count(),
      prisma.user.count(),
      prisma.client.count(),
      prisma.document.count(),
      prisma.bankAccount.count(),
      prisma.bankTransaction.count(),
      prisma.reconciliationSuggestion.count(),
      prisma.reconciliationEntry.count(),
      prisma.emailAction.count(),
      prisma.supplierRule.count(),
      prisma.bankRule.count(),
    ])
  return { offices, users, clients, documents, bankAccounts, bankTransactions, suggestions, entries, emailActions, supplierRules, bankRules }
}

describe('🔴RED seed:demo — Gabinete Demo [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
    queueAddMock.mockReset()
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('SD.a recusa correr em production sem SEED_DEMO_FORCE=true', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(seedDemo()).rejects.toThrow(/production/i)
    expect(await prisma.office.count()).toBe(0)

    vi.stubEnv('SEED_DEMO_FORCE', 'true')
    const result = await seedDemo()
    expect(result.created).toBe(true)
  })

  it('SD.b [INV idempotência] 2ª corrida → zero duplicados, contagens iguais', async () => {
    const first = await seedDemo()
    expect(first.created).toBe(true)
    const after1 = await snapshotCounts()

    const second = await seedDemo()
    expect(second.created).toBe(false)
    const after2 = await snapshotCounts()

    expect(after2).toEqual(after1)
  })

  it('SD.c cria o office demo completo: 3 users, 3 clientes, ~30 documentos em estados variados', async () => {
    await seedDemo()

    const office = await prisma.office.findFirstOrThrow({ where: { name: DEMO_OFFICE_NAME } })
    const users = await prisma.user.findMany({ where: { officeId: office.id } })
    expect(users.map((u) => u.role).sort()).toEqual(['ACCOUNTANT', 'OWNER', 'VIEWER'])

    const clients = await prisma.client.findMany({ where: { officeId: office.id } })
    expect(clients).toHaveLength(3)

    const documents = await prisma.document.findMany({ where: { officeId: office.id } })
    expect(documents.length).toBeGreaterThanOrEqual(25)

    const statuses = new Set(documents.map((d) => d.status))
    for (const s of ['NEEDS_REVIEW', 'PRE_VALIDATED', 'VALIDATED', 'EXPORTED']) {
      expect(statuses.has(s as never), `estado ${s} presente`).toBe(true)
    }

    // duplicate pair: one DUPLICATE_SUSPECT pointing at its counterpart
    const dup = documents.find((d) => d.flags.includes('DUPLICATE_SUSPECT'))
    expect(dup).toBeDefined()
    expect(dup!.duplicateOfId).toBeTruthy()
    expect(documents.some((d) => d.id === dup!.duplicateOfId)).toBe(true)

    // wrong-client suspect with a suggested client
    const wrong = documents.find((d) => d.flags.includes('WRONG_CLIENT_SUSPECT'))
    expect(wrong).toBeDefined()
    expect(wrong!.suggestedClientId).toBeTruthy()

    // both directions present
    const types = new Set(documents.map((d) => d.type))
    expect(types.has('INVOICE_RECEIVED' as never)).toBe(true)
    expect(types.has('INVOICE_ISSUED' as never)).toBe(true)

    // dates spread across the last ~3 months
    const dates = documents.map((d) => d.issueDate).filter((d): d is Date => d !== null)
    const spreadMs = Math.max(...dates.map((d) => d.getTime())) - Math.min(...dates.map((d) => d.getTime()))
    expect(spreadMs).toBeGreaterThan(45 * 24 * 3600 * 1000)

    // SNC suggestion visible + active SupplierRule
    expect(documents.some((d) => d.suggestedAccountCode !== null)).toBe(true)
    expect(await prisma.supplierRule.count({ where: { officeId: office.id, active: true } })).toBeGreaterThanOrEqual(1)

    // sample email draft pending review
    const action = await prisma.emailAction.findFirst({ where: { status: 'PENDING_REVIEW' } })
    expect(action).not.toBeNull()
    expect(action!.type).toBe('DRAFT_REPLY')
    expect(action!.draftContent).toBeTruthy()

    // no external connections
    expect(await prisma.toconlineConnection.count()).toBe(0)
    expect(await prisma.moloniConnection.count()).toBe(0)
    expect(await prisma.invoicexpressConnection.count()).toBe(0)
  })

  it('SD.d [INV NIFs] todos os NIFs semeados passam o checksum e nenhum é obviamente real', async () => {
    await seedDemo()
    const office = await prisma.office.findFirstOrThrow({ where: { name: DEMO_OFFICE_NAME } })

    const clients = await prisma.client.findMany({ where: { officeId: office.id } })
    for (const client of clients) {
      expect(client.nif, `NIF do cliente ${client.name}`).toBeTruthy()
      expect(isValidNif(client.nif!), `NIF ${client.nif} inválido (${client.name})`).toBe(true)
    }

    const documents = await prisma.document.findMany({ where: { officeId: office.id } })
    for (const doc of documents) {
      if (doc.supplierNif) expect(isValidNif(doc.supplierNif), `supplierNif ${doc.supplierNif}`).toBe(true)
      if (doc.buyerNif) expect(isValidNif(doc.buyerNif), `buyerNif ${doc.buyerNif}`).toBe(true)
    }
  })

  it('SD.e [INV coerência] Σbases + ΣIVA − retenção = total, ao cêntimo, em todos os documentos', async () => {
    await seedDemo()
    const office = await prisma.office.findFirstOrThrow({ where: { name: DEMO_OFFICE_NAME } })
    const documents = await prisma.document.findMany({
      where: { officeId: office.id, vatBreakdown: { not: undefined } },
    })
    expect(documents.length).toBeGreaterThan(0)

    let withRetention = 0
    for (const doc of documents) {
      const bands = doc.vatBreakdown as unknown as Array<{ rate: number; baseCents: number; vatCents: number }> | null
      if (!bands || !Array.isArray(bands) || bands.length === 0) continue
      const baseCents = bands.reduce((acc, b) => acc + b.baseCents, 0)
      const vatCents = bands.reduce((acc, b) => acc + b.vatCents, 0)
      const withholdingCents = doc.withholdingAmount
        ? Math.round(Number(doc.withholdingAmount) * 100)
        : 0
      if (withholdingCents > 0) withRetention += 1
      const totalCents = Math.round(Number(doc.totalAmount) * 100)
      expect(baseCents + vatCents - withholdingCents, `coerência de ${doc.documentNumber}`).toBe(totalCents)
    }
    expect(withRetention).toBeGreaterThanOrEqual(1) // freelancer com retenção IRS

    // VAT variety: 23%, multi-taxa (6+23) e isento
    const allRates = documents.flatMap((d) => ((d.vatBreakdown as never as Array<{ rate: number }>) ?? []).map((b) => b.rate))
    expect(allRates).toContain(23)
    expect(allRates).toContain(6)
    expect(allRates).toContain(0)
  })

  it('SD.f banco: 15+ movimentos — 5 conciliados, ≥4 sugestões pendentes (≥1 autoMatch), 6 por conciliar, 1 ignorado por regra', async () => {
    await seedDemo()
    const office = await prisma.office.findFirstOrThrow({ where: { name: DEMO_OFFICE_NAME } })

    const transactions = await prisma.bankTransaction.findMany({ where: { officeId: office.id } })
    expect(transactions.length).toBeGreaterThanOrEqual(15)

    const byStatus = (s: string) => transactions.filter((t) => t.status === s).length
    expect(byStatus('RECONCILED')).toBe(5)
    expect(byStatus('IGNORED')).toBe(1)
    // SUGGESTED = at least one autoMatch (enum semantics, C2); low-score
    // suggestions leave the transaction UNRECONCILED with a pending suggestion
    expect(byStatus('SUGGESTED')).toBeGreaterThanOrEqual(1)

    // exactly 6 movements with no candidate at all ("por conciliar" limpos)
    const withSuggestion = new Set(
      (await prisma.reconciliationSuggestion.findMany({
        where: { officeId: office.id },
        select: { bankTransactionId: true },
      })).map((s) => s.bankTransactionId),
    )
    const untouched = transactions.filter(
      (t) => t.status === 'UNRECONCILED' && !withSuggestion.has(t.id),
    )
    expect(untouched).toHaveLength(6)

    const pending = await prisma.reconciliationSuggestion.findMany({
      where: { officeId: office.id, status: 'PENDING' },
    })
    expect(pending.length).toBeGreaterThanOrEqual(4)
    expect(pending.some((s) => s.autoMatch)).toBe(true)
    // varied scores, not all identical
    expect(new Set(pending.map((s) => s.scoreTotal)).size).toBeGreaterThan(1)

    // the ignored one came from an active BankRule
    const ignoredEntry = await prisma.reconciliationEntry.findFirst({
      where: { officeId: office.id, ignored: true },
    })
    expect(ignoredEntry).not.toBeNull()
    expect(ignoredEntry!.ruleId).toBeTruthy()

    // the 5 reconciled have entries with documents
    const reconciledEntries = await prisma.reconciliationEntry.count({
      where: { officeId: office.id, ignored: false },
    })
    expect(reconciledEntries).toBe(5)
  })
})
