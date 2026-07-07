import { describe, it, expect, vi } from 'vitest'
import {
  ToconlineSourceConnector,
  toconlineAttributesToSourceDocument,
} from './toconline-source-connector'
import type { ToconlineClient } from './toconline-client'

/** Documented sales-document header attributes (23% + 6% issued invoice). */
const ATTRS: Record<string, unknown> = {
  document_no: 'FT 2026/301',
  document_type: 'FT',
  date: '2026-06-20',
  due_date: '2026-07-20',
  currency_iso_code: 'EUR',
  gross_total: 148.46,
  net_total: 127.01,
  tax_payable: 21.45,
  vat_incidence_nor: 81.34,
  vat_total_nor: 18.71,
  vat_percentage_nor: 23.0,
  vat_incidence_red: 45.67,
  vat_total_red: 2.74,
  vat_percentage_red: 6.0,
  customer_business_name: 'Cliente Final Lda',
  customer_tax_registration_number: '229659179',
}

describe('toconlineAttributesToSourceDocument', () => {
  it('maps a documented sales document to the unified contract (permil rate, exact cents)', () => {
    const doc = toconlineAttributesToSourceDocument('301', ATTRS)
    expect(doc.externalId).toBe('301')
    expect(doc.documentType).toBe('FT')
    expect(doc.sequenceNumber).toBe('FT 2026/301')
    expect(doc.issueDate).toBe('2026-06-20')
    expect(doc.dueDate).toBe('2026-07-20')
    expect(doc.customerName).toBe('Cliente Final Lda')
    expect(doc.customerVat).toBe('229659179')
    expect(doc.totalCents).toBe(14846)
    expect(doc.beforeTaxesCents).toBe(12701)
    expect(doc.taxesCents).toBe(2145)
    // rate is permil in the unified contract (6% → 60, 23% → 230), cents exact
    expect(doc.vatBreakdownCents).toEqual([
      { ratePermil: 60, baseCents: 4567, amountCents: 274 },
      { ratePermil: 230, baseCents: 8134, amountCents: 1871 },
    ])
    expect(doc.currency).toBe('EUR')
    expect(doc.raw).toBe(ATTRS)
  })
})

describe('ToconlineSourceConnector', () => {
  it('lists one page per call with a page-number cursor', async () => {
    const listFinalizedSalesDocuments = vi
      .fn()
      .mockResolvedValueOnce([{ id: '301', attributes: ATTRS }])
      .mockResolvedValueOnce([])
    const client = { listFinalizedSalesDocuments } as unknown as ToconlineClient
    const connector = new ToconlineSourceConnector({ client, pageSize: 1 })

    const page1 = await connector.listIssuedDocuments()
    expect(page1.items.map((d) => d.externalId)).toEqual(['301'])
    expect(page1.nextCursor).toBe('2') // full page → resume cursor
    expect(listFinalizedSalesDocuments).toHaveBeenCalledWith({
      pageNumber: 1,
      pageSize: 1,
      updatedSince: undefined,
    })

    const page2 = await connector.listIssuedDocuments(page1.nextCursor!)
    expect(page2.items).toEqual([])
    expect(page2.nextCursor).toBeNull()
  })

  it('downloads the PDF via url_for_print + public file, null when no link', async () => {
    const getSalesDocumentPdfUrl = vi
      .fn()
      .mockResolvedValueOnce('https://files.example/301.pdf')
      .mockResolvedValueOnce(null)
    const downloadPublicFile = vi.fn().mockResolvedValue(Buffer.from('%PDF'))
    const client = { getSalesDocumentPdfUrl, downloadPublicFile } as unknown as ToconlineClient
    const connector = new ToconlineSourceConnector({ client })

    const pdf = await connector.fetchPdf('301')
    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(downloadPublicFile).toHaveBeenCalledWith('https://files.example/301.pdf')

    const none = await connector.fetchPdf('999')
    expect(none).toBeNull()
  })
})
