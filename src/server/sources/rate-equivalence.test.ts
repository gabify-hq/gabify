/**
 * U1 unification proof: the Moloni and InvoiceXpress connectors now share ONE
 * representation of the VAT rate (permil) and ONE money boundary (cents). These
 * tests assert numeric equivalence between the two mappers so the merge cannot
 * silently change any amount (regression-zero).
 */
import { describe, it, expect } from 'vitest'
import { percentToPermil as ivxPercentToPermil } from './invoicexpress/money'
import { percentToPermil as moloniPercentToPermil } from './moloni/money'
import { mapListInvoiceToSourceDocument } from './invoicexpress/mapping'
import { mapMoloniDocument } from './moloni/mapper'
import { multiRateInvoiceReceipt } from './invoicexpress/fixtures'
import { invoiceMultiRateDetail } from './moloni/fixtures'

describe('VAT rate representation is unified on permil', () => {
  it('both connectors convert the same percent rate to the same permil integer', () => {
    for (const percent of [0, 6, 13, 23, 6.5, 23.0]) {
      const permil = Math.round(percent * 10)
      expect(ivxPercentToPermil(percent)).toBe(permil)
      expect(moloniPercentToPermil(percent)).toBe(permil)
      expect(ivxPercentToPermil(percent)).toBe(moloniPercentToPermil(percent))
    }
  })

  it('both mappers emit vatBreakdownCents.ratePermil (never a percent field)', () => {
    const ivx = mapListInvoiceToSourceDocument(multiRateInvoiceReceipt)
    const moloni = mapMoloniDocument(invoiceMultiRateDetail)
    for (const entry of [...ivx.vatBreakdownCents, ...moloni.vatBreakdownCents]) {
      expect(entry).toHaveProperty('ratePermil')
      expect(entry).not.toHaveProperty('rate')
    }
    // both express standard IVA as 230 permil
    expect(ivx.vatBreakdownCents.map((e) => e.ratePermil)).toContain(230)
    expect(moloni.vatBreakdownCents.map((e) => e.ratePermil)).toContain(230)
  })
})

describe('cents boundary is unified (19.99 case, half away from zero)', () => {
  it('the 19.99 @ 23% line yields 1999 base cents in the InvoiceXpress mapper', () => {
    const ivx = mapListInvoiceToSourceDocument(multiRateInvoiceReceipt)
    const standard = ivx.vatBreakdownCents.find((e) => e.ratePermil === 230)
    expect(standard?.baseCents).toBe(1999)
  })

  it('the Moloni multi-rate document keeps exact per-rate cents', () => {
    const moloni = mapMoloniDocument(invoiceMultiRateDetail)
    expect(moloni.vatBreakdownCents).toEqual([
      { ratePermil: 60, baseCents: 1000, amountCents: 60 },
      { ratePermil: 230, baseCents: 2029, amountCents: 467 },
    ])
  })
})
