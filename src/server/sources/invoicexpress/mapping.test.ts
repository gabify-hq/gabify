import { describe, it, expect } from 'vitest'
import { mapListInvoiceToSourceDocument, splitSequenceNumber, toApiDate, toIsoDate } from './mapping'
import { invoiceWithRetention, creditNote, multiRateInvoiceReceipt, TEST_API_KEY } from './fixtures'
import { listInvoicesResponseSchema } from './schemas'
import { listPage1 } from './fixtures'

describe('mapListInvoiceToSourceDocument', () => {
  it('[INV] maps invoice with IVA 23% + IRS retention to exact cents (unified contract)', () => {
    const doc = mapListInvoiceToSourceDocument(invoiceWithRetention)
    expect(doc.externalId).toBe('900001')
    expect(doc.documentType).toBe('Invoice')
    expect(doc.beforeTaxesCents).toBe(100000)
    expect(doc.taxesCents).toBe(23000)
    expect(doc.totalCents).toBe(123000)
    // rate is expressed in permil in the unified contract (23% → 230)
    expect(doc.vatBreakdownCents).toEqual([{ ratePermil: 230, baseCents: 100000, amountCents: 23000 }])
    expect(doc.withholdingCents).toBe(25000)
    expect(doc.retentionPercentRaw).toBe('25.0')
  })

  it('splits sequence_number into series + number', () => {
    expect(splitSequenceNumber('A/28')).toEqual({ series: 'A', number: 28 })
    expect(splitSequenceNumber('NC/3')).toEqual({ series: 'NC', number: 3 })
    const doc = mapListInvoiceToSourceDocument(invoiceWithRetention)
    expect(doc.series).toBe('A')
    expect(doc.number).toBe(28)
    expect(doc.sequenceNumber).toBe('A/28')
  })

  it('[INV] maps a credit note with coherent NEGATIVE cents everywhere', () => {
    const doc = mapListInvoiceToSourceDocument(creditNote)
    expect(doc.documentType).toBe('CreditNote')
    expect(doc.beforeTaxesCents).toBe(-5000)
    expect(doc.taxesCents).toBe(-1150)
    expect(doc.totalCents).toBe(-6150)
    expect(doc.vatBreakdownCents).toEqual([{ ratePermil: 230, baseCents: -5000, amountCents: -1150 }])
    expect(doc.lines[0].subtotalCents).toBe(-5000)
    expect(doc.lines[0].taxAmountCents).toBe(-1150)
    // internal coherence: total = base + VAT
    expect(doc.beforeTaxesCents! + doc.taxesCents!).toBe(doc.totalCents)
    expect(doc.withholdingCents).toBeNull()
  })

  it('[INV] groups multi-rate items into a per-rate VAT breakdown (19.99 case included)', () => {
    const doc = mapListInvoiceToSourceDocument(multiRateInvoiceReceipt)
    expect(doc.beforeTaxesCents).toBe(11999)
    expect(doc.taxesCents).toBe(1060)
    expect(doc.totalCents).toBe(13059)
    expect(doc.vatBreakdownCents).toEqual([
      { ratePermil: 60, baseCents: 10000, amountCents: 600 },
      { ratePermil: 230, baseCents: 1999, amountCents: 460 },
    ])
  })

  it('converts dd/mm/yyyy dates to ISO yyyy-mm-dd', () => {
    const doc = mapListInvoiceToSourceDocument(invoiceWithRetention)
    expect(doc.issueDate).toBe('2026-06-27')
    expect(doc.dueDate).toBe('2026-07-27')
  })

  it('rejects malformed dates in both directions', () => {
    expect(() => toIsoDate('2026-06-27')).toThrow(/dd\/mm\/yyyy/i)
    expect(() => toApiDate('27/06/2026')).toThrow(/iso/i)
  })

  it('maps customer name and external id; NIF (customerVat) is null (not exposed by the API)', () => {
    const doc = mapListInvoiceToSourceDocument(invoiceWithRetention)
    expect(doc.customerName).toBe('João Camões & Associados')
    expect(doc.customerExternalId).toBe('1310176')
    expect(doc.customerVat).toBeNull()
  })

  it('maps currency "Euro" to ISO "EUR" and keeps the raw value', () => {
    const doc = mapListInvoiceToSourceDocument(invoiceWithRetention)
    expect(doc.currency).toBe('EUR')
    expect(doc.currencyRaw).toBe('Euro')
  })

  it('preserves the raw API item and never embeds the api_key in it', () => {
    const doc = mapListInvoiceToSourceDocument(invoiceWithRetention)
    expect(doc.raw).toMatchObject({ id: 900001, type: 'Invoice' })
    expect(JSON.stringify(doc.raw)).not.toContain(TEST_API_KEY)
  })

  it('rejects undocumented document types with a clear error', () => {
    const mutated = { ...invoiceWithRetention, type: 'MysteryDocument' }
    expect(() => mapListInvoiceToSourceDocument(mutated)).toThrow(/type/i)
  })

  it('rejects undocumented document statuses with a clear error', () => {
    const mutated = { ...invoiceWithRetention, status: 'quantum' }
    expect(() => mapListInvoiceToSourceDocument(mutated)).toThrow(/status/i)
  })

  it('accepts every invoice in the doc-derived fixture pages (round trip with schema)', () => {
    const page = listInvoicesResponseSchema.parse(listPage1)
    for (const invoice of page.invoices) {
      const doc = mapListInvoiceToSourceDocument(invoice)
      expect(doc.externalId).toBe(String(invoice.id))
    }
  })
})
