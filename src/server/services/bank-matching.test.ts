import { describe, it, expect } from 'vitest'
import {
  scoreCandidate,
  validateReconciliationTotals,
  normalizeMatchText,
  type CandidateDocument,
} from './bank-matching'

/**
 * Unit tests for the pure scoring core (C2). The DB orchestration
 * (candidate querying, persistence, status transition) is covered by
 * tests/acceptance/faseC2.bank-matching.test.ts against real PostgreSQL.
 */

const baseDoc: CandidateDocument = {
  totalCents: 24600,
  dueDate: new Date('2026-06-10T12:00:00.000Z'),
  issueDate: new Date('2026-05-30T12:00:00.000Z'),
  supplierNif: '509888777',
  supplierName: 'Fornecedor Gama',
  documentNumber: 'FT 2026/55',
}

function score(overrides: {
  amountCents?: number
  bookingDate?: string
  description?: string
  doc?: Partial<CandidateDocument>
  toleranceCents?: number
}) {
  return scoreCandidate({
    transactionAmountCents: overrides.amountCents ?? -24600,
    bookingDate: new Date(`${overrides.bookingDate ?? '2026-06-12'}T12:00:00.000Z`),
    description: overrides.description ?? 'TRF P/ 509888777 PAGAMENTO',
    document: { ...baseDoc, ...overrides.doc },
    toleranceCents: overrides.toleranceCents ?? 2,
  })
}

describe('scoreCandidate', () => {
  it('exact amount + NIF + 2 days → exactly 95 with full breakdown', () => {
    const result = score({})
    expect(result).toEqual({
      total: 95,
      breakdown: { amount: 50, date: 25, entity: 20, reference: 0 },
    })
  })

  it('amount outside tolerance is eliminatory — null even with perfect NIF and date', () => {
    expect(score({ amountCents: -24700 })).toBeNull()
    expect(score({ amountCents: -24603 })).toBeNull() // 3 cents > tolerance 2
  })

  it('amount within tolerance scores 45', () => {
    expect(score({ amountCents: -24602 })?.breakdown.amount).toBe(45)
    expect(score({ amountCents: -24602, toleranceCents: 0 })).toBeNull()
  })

  it('date buckets: ≤3 → 25, ≤15 → 15, ≤45 → 5, else 0; dueDate falls back to issueDate', () => {
    expect(score({ bookingDate: '2026-06-13' })?.breakdown.date).toBe(25) // 3 dias
    expect(score({ bookingDate: '2026-06-20' })?.breakdown.date).toBe(15) // 10 dias
    expect(score({ bookingDate: '2026-07-20' })?.breakdown.date).toBe(5) // 40 dias
    expect(score({ bookingDate: '2026-09-01' })?.breakdown.date).toBe(0)
    expect(
      score({ bookingDate: '2026-05-31', doc: { dueDate: null } })?.breakdown.date,
    ).toBe(25) // issueDate a 1 dia
    expect(score({ doc: { dueDate: null, issueDate: null } })?.breakdown.date).toBe(0)
  })

  it('NIF match never fires inside a longer number', () => {
    expect(score({ description: 'REF 1509888777123' })?.breakdown.entity).toBe(0)
    expect(score({ description: 'NIF509888777OK' })?.breakdown.entity).toBe(20)
  })

  it('name match: normalized, ≥4 chars, word-boundary → 12; NIF wins over name', () => {
    expect(
      score({ description: 'DD FORNECEDOR GAMA LDA' })?.breakdown.entity,
    ).toBe(12)
    // accents/case-insensitive via normalization
    expect(
      score({ description: 'dd fornecedor gamá', doc: { supplierName: 'Fornecedor Gamá' } })
        ?.breakdown.entity,
    ).toBe(12)
    // embedded in another word → no match
    expect(
      score({ description: 'XFORNECEDOR GAMAY', doc: { supplierName: 'FORNECEDOR GAMA' } })
        ?.breakdown.entity,
    ).toBe(0)
    // short names never match
    expect(
      score({ description: 'PAG ABC', doc: { supplierNif: null, supplierName: 'ABC' } })
        ?.breakdown.entity,
    ).toBe(0)
    // NIF present → 20, not 12
    expect(
      score({ description: 'FORNECEDOR GAMA 509888777' })?.breakdown.entity,
    ).toBe(20)
  })

  it('document number in the description adds +15 (space-insensitive)', () => {
    expect(score({ description: 'PAGAMENTO FT 2026/55' })?.breakdown.reference).toBe(15)
    expect(score({ description: 'PAGAMENTO FT2026/55' })?.breakdown.reference).toBe(15)
    expect(score({ description: 'PAGAMENTO OUTRA COISA' })?.breakdown.reference).toBe(0)
    expect(score({ doc: { documentNumber: null } })?.breakdown.reference).toBe(0)
  })
})

describe('validateReconciliationTotals', () => {
  it('accepts sums within tolerance, rejects with the exact delta', () => {
    expect(
      validateReconciliationTotals({
        transactionAmountCents: -24600,
        documentTotalsCents: [20000, 4600],
        toleranceCents: 2,
      }),
    ).toEqual({ ok: true })
    expect(
      validateReconciliationTotals({
        transactionAmountCents: -24600,
        documentTotalsCents: [20000, 4598],
        toleranceCents: 2,
      }),
    ).toEqual({ ok: true })
    expect(
      validateReconciliationTotals({
        transactionAmountCents: -24600,
        documentTotalsCents: [20000, 4000],
        toleranceCents: 2,
      }),
    ).toEqual({ ok: false, deltaCents: 600 })
  })
})

describe('normalizeMatchText', () => {
  it('uppercases, strips accents, collapses whitespace', () => {
    expect(normalizeMatchText('  Águas   do\tNorte ')).toBe('AGUAS DO NORTE')
  })
})
