import { describe, it, expect } from 'vitest'
import { buildDocumentFromSource } from './source-document-to-document'
import type { SourceDocument } from './types'

const CTX = {
  officeId: 'office-1',
  clientId: 'client-1',
  classificationSource: 'test-pull',
  buyerNif: '500000000',
}

/** Moloni-shaped source doc: no explicit totals, per-rate bands only. */
const moloniShape: SourceDocument = {
  externalId: '11111',
  documentType: 'FT',
  series: 'A',
  number: 42,
  issueDate: '2026-06-30',
  customerName: 'Cliente Exemplo Lda',
  customerVat: '123456789',
  lines: [{ description: 'Serviço A', quantity: 1, unitPriceCents: 1999, discountPercent: 0, exemptionReason: null }],
  vatBreakdownCents: [
    { ratePermil: 60, baseCents: 1000, amountCents: 60 },
    { ratePermil: 230, baseCents: 2029, amountCents: 467 },
  ],
  totalCents: 3556,
  currency: 'EUR',
  raw: {},
}

/** InvoiceXpress-shaped source doc: explicit totals + withholding. */
const ivxShape: SourceDocument = {
  externalId: '900001',
  documentType: 'Invoice',
  series: 'A',
  number: 28,
  sequenceNumber: 'A/28',
  issueDate: '2026-06-27',
  dueDate: '2026-07-27',
  customerName: 'Cliente Final Lda',
  customerVat: null,
  customerExternalId: '1310176',
  lines: [{ description: 'Consultoria', quantity: 1, subtotalCents: 100000, taxAmountCents: 23000, ratePermil: 230 }],
  vatBreakdownCents: [{ ratePermil: 230, baseCents: 100000, amountCents: 23000 }],
  beforeTaxesCents: 100000,
  taxesCents: 23000,
  totalCents: 123000,
  withholdingCents: 25000,
  currency: 'EUR',
  raw: {},
}

describe('buildDocumentFromSource', () => {
  it('marks every pulled document as an API_PULL issued invoice, pre-validated, confidence 1.0', () => {
    const data = buildDocumentFromSource(moloniShape, CTX)
    expect(data).toMatchObject({
      source: 'API_PULL',
      type: 'INVOICE_ISSUED',
      status: 'PRE_VALIDATED',
      confidence: 1.0,
      extractionSource: 'API_PULL',
      classificationSource: 'test-pull',
      officeId: 'office-1',
      clientId: 'client-1',
    })
    expect(data.supplierNif).toBeNull()
    expect(data.buyerNif).toBe('500000000') // enriched value wins
    expect(data.buyerName).toBe('Cliente Exemplo Lda')
  })

  it('derives net/vat from the VAT bands when the source reports no explicit totals (Moloni)', () => {
    const data = buildDocumentFromSource(moloniShape, CTX)
    expect(data.documentNumber).toBe('A/42') // series/number
    expect(String(data.totalAmount)).toBe('35.56')
    expect(String(data.netAmount)).toBe('30.29') // 1000 + 2029 cents
    expect(String(data.vatAmount)).toBe('5.27') // 60 + 467 cents
    expect(data.withholdingAmount).toBeNull()
    const bands = data.vatBreakdown as Array<{ rate: number; baseCents: number; vatCents: number }>
    expect(bands).toEqual([
      { region: 'PT', rate: 6, baseCents: 1000, vatCents: 60 },
      { region: 'PT', rate: 23, baseCents: 2029, vatCents: 467 },
    ])
  })

  it('uses explicit totals + withholding and the raw sequence number when present (InvoiceXpress)', () => {
    const data = buildDocumentFromSource(ivxShape, CTX)
    expect(data.documentNumber).toBe('A/28') // sequenceNumber preferred
    expect(String(data.netAmount)).toBe('1000.00')
    expect(String(data.vatAmount)).toBe('230.00')
    expect(String(data.withholdingAmount)).toBe('250.00')
    expect(data.dueDate).not.toBeNull()
    const lines = data.documentLines as Array<{ vatRate: number; totalCents: number }>
    expect(lines[0]).toMatchObject({ vatRate: 23, totalCents: 123000 })
  })
})
