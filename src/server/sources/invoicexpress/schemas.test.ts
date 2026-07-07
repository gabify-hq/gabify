import { describe, it, expect } from 'vitest'
import {
  listInvoicesResponseSchema,
  errorResponseSchema,
  pdfResponseSchema,
  pdfAcceptedSchema,
} from './schemas'
import {
  listPage1,
  listPage2,
  unauthorizedResponse,
  pdfReadyResponse,
  pdfAcceptedResponse,
} from './fixtures'

/**
 * [INV] Contract tests: strict zod schemas derived from the saved docs
 * (integrations/invoicexpress/docs). Fixtures copied from the doc examples
 * must parse; unknown fields and wrong types must be rejected.
 */
describe('listInvoicesResponseSchema', () => {
  it('parses both doc-derived list pages', () => {
    expect(listInvoicesResponseSchema.parse(listPage1)).toBeTruthy()
    expect(listInvoicesResponseSchema.parse(listPage2)).toBeTruthy()
  })

  it('exposes pagination exactly as documented', () => {
    const parsed = listInvoicesResponseSchema.parse(listPage1)
    expect(parsed.pagination).toEqual({
      total_entries: 5,
      per_page: 3,
      current_page: 1,
      total_pages: 2,
    })
  })

  it('keeps list-item unit_price and quantity as strings (doc: string "1.0")', () => {
    const parsed = listInvoicesResponseSchema.parse(listPage1)
    const item = parsed.invoices[0].items[0]
    expect(typeof item.unit_price).toBe('string')
    expect(typeof item.quantity).toBe('string')
  })

  it('rejects an invoice with an undocumented extra field (strict contract)', () => {
    const mutated = {
      ...listPage1,
      invoices: [{ ...listPage1.invoices[0], undocumented_field: 1 }],
    }
    expect(() => listInvoicesResponseSchema.parse(mutated)).toThrow()
  })

  it('rejects amounts delivered as strings where the doc says number', () => {
    const mutated = {
      ...listPage1,
      invoices: [{ ...listPage1.invoices[0], total: '1230.00' }],
    }
    expect(() => listInvoicesResponseSchema.parse(mutated)).toThrow()
  })

  it('rejects a response without the pagination block', () => {
    expect(() => listInvoicesResponseSchema.parse({ invoices: [] })).toThrow()
  })
})

describe('errorResponseSchema', () => {
  it('parses the documented 401 body', () => {
    expect(errorResponseSchema.parse(unauthorizedResponse).errors.error).toBe('Invalid API key')
  })
})

describe('pdf schemas', () => {
  it('parses the documented 200 PdfResponse', () => {
    expect(pdfResponseSchema.parse(pdfReadyResponse).output.pdfUrl).toMatch(/\.pdf$/)
  })

  it('parses the documented 202 accepted body', () => {
    expect(pdfAcceptedSchema.parse(pdfAcceptedResponse).accepted.code).toBe('202')
  })
})
