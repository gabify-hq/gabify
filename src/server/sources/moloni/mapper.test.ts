/**
 * [INV] Mapper suite — Moloni getOne detail → SourceDocument, with every
 * monetary value converted to cents exactly.
 */
import { describe, expect, it } from 'vitest'
import { mapMoloniDocument } from './mapper'
import { invoiceMultiRateDetail, invoiceWithExemptLineDetail } from './fixtures'

describe('mapMoloniDocument', () => {
  it('maps identity fields from the doc-shaped detail', () => {
    const doc = mapMoloniDocument(invoiceMultiRateDetail)
    expect(doc.externalId).toBe('11111')
    expect(doc.documentType).toBe('FT')
    expect(doc.series).toBe('A')
    expect(doc.number).toBe(42)
    expect(doc.issueDate).toBe('2026-06-30')
    expect(doc.customerName).toBe('Cliente Exemplo Lda')
    expect(doc.customerVat).toBe('123456789')
    expect(doc.currency).toBe('EUR')
    expect(doc.raw).toBe(invoiceMultiRateDetail)
  })

  it('normalises an empty entity_vat to null', () => {
    const doc = mapMoloniDocument({ ...invoiceMultiRateDetail, entity_vat: '' })
    expect(doc.customerVat).toBeNull()
  })

  it('converts the document total to cents (35.56 → 3556)', () => {
    const doc = mapMoloniDocument(invoiceMultiRateDetail)
    expect(doc.totalCents).toBe(3556)
  })

  it('maps lines with unit prices in cents', () => {
    const doc = mapMoloniDocument(invoiceMultiRateDetail)
    expect(doc.lines).toEqual([
      {
        description: 'Serviço A',
        quantity: 1,
        unitPriceCents: 1999,
        discountPercent: 0,
        exemptionReason: null,
      },
      {
        description: 'Produto B',
        quantity: 2,
        unitPriceCents: 500,
        discountPercent: 0,
        exemptionReason: null,
      },
      {
        description: 'Serviço C',
        quantity: 3,
        unitPriceCents: 10,
        discountPercent: 0,
        exemptionReason: null,
      },
    ])
  })

  it('aggregates the VAT breakdown per rate, exact to the cent', () => {
    const doc = mapMoloniDocument(invoiceMultiRateDetail)
    // 23%: bases 19.99 + 0.30 (float sum would be 20.290000000000003),
    //      amounts 4.60 + 0.07
    //  6%: base 10.00, amount 0.60
    expect(doc.vatBreakdownCents).toEqual([
      { ratePermil: 60, baseCents: 1000, amountCents: 60 },
      { ratePermil: 230, baseCents: 2029, amountCents: 467 },
    ])
  })

  it('keeps exempt lines out of the breakdown but carries the reason', () => {
    const doc = mapMoloniDocument(invoiceWithExemptLineDetail)
    expect(doc.vatBreakdownCents).toEqual([
      { ratePermil: 230, baseCents: 2029, amountCents: 467 },
    ])
    const exemptLine = doc.lines.find((l) => l.description === 'Formação D')
    expect(exemptLine).toBeDefined()
    expect(exemptLine?.exemptionReason).toBe('M07')
    expect(exemptLine?.unitPriceCents).toBe(10000)
  })
})
