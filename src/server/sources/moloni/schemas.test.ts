/**
 * [INV] Contract suite — the mock fixtures must match the response shapes
 * saved from the Moloni doc, and the schemas must be strict enough to catch
 * any undocumented field creeping into fixtures or mock responses.
 */
import { describe, expect, it } from 'vitest'
import {
  moloniAuthErrorSchema,
  moloniDocumentDetailSchema,
  moloniGetAllResponseSchema,
  moloniGrantResponseSchema,
  moloniPdfLinkResponseSchema,
} from './schemas'
import {
  authErrorFixture,
  draftDetail,
  grantResponseFixture,
  invoiceMultiRateDetail,
  invoiceWithExemptLineDetail,
  pdfLinkFixture,
  summaryOf,
} from './fixtures'

describe('contract: fixtures conform to the saved doc shapes', () => {
  it('grant response matches autenticacao.md', () => {
    expect(() => moloniGrantResponseSchema.parse(grantResponseFixture())).not.toThrow()
  })

  it('auth error matches controlo-de-erros.md', () => {
    expect(() => moloniAuthErrorSchema.parse(authErrorFixture)).not.toThrow()
  })

  it('getAll summaries match documents_documents_getall.md', () => {
    const page = [summaryOf(invoiceMultiRateDetail), summaryOf(draftDetail)]
    expect(() => moloniGetAllResponseSchema.parse(page)).not.toThrow()
  })

  it('getOne details match documents_documents_getone.md', () => {
    expect(() => moloniDocumentDetailSchema.parse(invoiceMultiRateDetail)).not.toThrow()
    expect(() => moloniDocumentDetailSchema.parse(invoiceWithExemptLineDetail)).not.toThrow()
    expect(() => moloniDocumentDetailSchema.parse(draftDetail)).not.toThrow()
  })

  it('getPDFLink response matches documents_documents_getpdflink.md', () => {
    expect(() => moloniPdfLinkResponseSchema.parse(pdfLinkFixture(11111))).not.toThrow()
  })
})

describe('contract: schemas are strict (undocumented fields rejected)', () => {
  it('rejects an extra field on the grant response', () => {
    const result = moloniGrantResponseSchema.safeParse({
      ...grantResponseFixture(),
      undocumented_field: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an extra field on a getAll summary', () => {
    const result = moloniGetAllResponseSchema.safeParse([
      { ...summaryOf(invoiceMultiRateDetail), undocumented_field: true },
    ])
    expect(result.success).toBe(false)
  })

  it('rejects an extra field on a getOne detail', () => {
    const result = moloniDocumentDetailSchema.safeParse({
      ...invoiceMultiRateDetail,
      undocumented_field: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an extra field nested in a product tax entry', () => {
    const detail = structuredClone(invoiceMultiRateDetail) as Record<string, unknown>
    const products = detail.products as Array<{ taxes: Array<Record<string, unknown>> }>
    products[0].taxes[0].undocumented_field = true
    const result = moloniDocumentDetailSchema.safeParse(detail)
    expect(result.success).toBe(false)
  })

  it('rejects a missing documented field', () => {
    const { net_value: _dropped, ...withoutNetValue } = invoiceMultiRateDetail
    const result = moloniDocumentDetailSchema.safeParse(withoutNetValue)
    expect(result.success).toBe(false)
  })
})
