import { vi } from 'vitest'

/**
 * Named AI mock scenarios reused across phases (ACCEPTANCE regras finais #3).
 * Usage in a test file:
 *
 *   vi.mock('@/lib/anthropic', async () => (await import('../mocks/ai')).aiMockFactory())
 *
 * Then push scenario payloads onto `aiState.queue` — each `messages.create`
 * call consumes one. `aiState.calls` counts invocations (zero-IA assertions).
 */

export const aiState = {
  queue: [] as string[],
  calls: 0,
  reset() {
    this.queue = []
    this.calls = 0
  },
}

export function aiMockFactory() {
  return {
    anthropic: {
      messages: {
        create: vi.fn(async () => {
          aiState.calls += 1
          const text = aiState.queue.shift()
          if (text === undefined) {
            throw new Error('aiState.queue empty — unexpected AI call in test')
          }
          return { content: [{ type: 'text', text }], usage: { input_tokens: 10 } }
        }),
      },
    },
    CLAUDE_MODEL: 'claude-test',
    CLASSIFICATION_MAX_TOKENS: 500,
    DRAFT_MAX_TOKENS: 1000,
  }
}

// ── Scenario builders ────────────────────────────────────────────────────────

export function scenarioValidExtraction(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'INVOICE_RECEIVED',
    confidence: 0.93,
    reasoning: 'Fatura de fornecedor com IVA a 23%',
    supplierName: 'Fornecedor Gama Unipessoal Lda',
    supplierNif: '509888777',
    buyerNif: null,
    documentNumber: 'FT 2026/55',
    issueDate: '05/05/2026',
    dueDate: null,
    currency: 'EUR',
    vatBreakdown: [{ region: 'PT', rate: 23, baseCents: 20000, vatCents: 4600 }],
    netCents: 20000,
    vatCents: 4600,
    withholdingCents: 0,
    totalCents: 24600,
    documentLines: null,
    ...overrides,
  })
}

export function scenarioMalformed(): string {
  return '{"type": "INVOICE_RECEIVED", "confidence": "not-a-number", "totalCents": "abc"'
}

export function scenarioReciboVerde(): string {
  return scenarioValidExtraction({
    type: 'INVOICE_RECEIPT',
    supplierName: 'Trabalhador Independente',
    supplierNif: '212345675',
    documentNumber: 'RECIBO 12',
    issueDate: '10/05/2026',
    vatBreakdown: [{ region: 'PT', rate: 23, baseCents: 100000, vatCents: 23000 }],
    netCents: 100000,
    vatCents: 23000,
    withholdingCents: 25000,
    totalCents: 98000,
  })
}

export function scenarioArithmeticMismatch(deltaCents: number): string {
  return scenarioValidExtraction({
    totalCents: 24600 + deltaCents,
  })
}

export function scenarioSplitBoundaries(confidence: number): string {
  return JSON.stringify({
    confidence,
    invoices: [
      { startPage: 1, endPage: 2 },
      { startPage: 3, endPage: 5 },
    ],
  })
}

export function scenarioImportMapping(): string {
  return JSON.stringify({
    mapping: {
      date: 'data',
      documentNumber: 'numero',
      supplierNif: 'nif',
      netAmount: 'base',
      vatRate: 'taxa_iva',
      totalAmount: 'total',
    },
  })
}
