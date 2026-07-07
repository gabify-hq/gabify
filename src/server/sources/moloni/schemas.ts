/**
 * Strict zod schemas derived from the Moloni API documentation saved in
 * integrations/moloni/docs/. Nothing here is invented: every field maps 1:1
 * to a response example on the corresponding doc page. Schemas are strict so
 * that any drift between the saved doc, the test fixtures and the mock
 * server fails loudly.
 *
 * Doc pages:
 * - grant:      autenticacao.md ("A resposta chega em formato JSON")
 * - auth error: controlo-de-erros.md §Erros de autenticação
 * - getAll:     documents_documents_getall.md §Resposta
 * - getOne:     documents_documents_getone.md §Resposta
 * - getPDFLink: documents_documents_getpdflink.md §Resposta
 */
import { z } from 'zod'

/** Grant response (authorization_code / password / refresh_token grants). */
export const moloniGrantResponseSchema = z.strictObject({
  access_token: z.string(),
  expires_in: z.number().int(),
  token_type: z.string(),
  scope: z.string().nullable(),
  refresh_token: z.string(),
})

/** HTTP 400 body on authentication errors. */
export const moloniAuthErrorSchema = z.strictObject({
  error: z.string(),
  error_description: z.string(),
})

const moloniDocumentTypeSchema = z.strictObject({
  document_type_id: z.number().int(),
  saft_code: z.string(),
})

const moloniDocumentSetSchema = z.strictObject({
  document_set_id: z.number().int(),
  name: z.string(),
})

const moloniExchangeCurrencySchema = z.strictObject({
  currency_id: z.number().int(),
  iso4217: z.string(),
  symbol: z.string(),
})

/** One item of the documents/getAll response array. */
export const moloniDocumentSummarySchema = z.strictObject({
  document_id: z.number().int(),
  document_type_id: z.number().int(),
  document_set_id: z.number().int(),
  number: z.number().int(),
  date: z.string(),
  expiration_date: z.string().nullable(),
  your_reference: z.string(),
  our_reference: z.string(),
  entity_number: z.string(),
  entity_name: z.string(),
  entity_vat: z.string(),
  entity_address: z.string(),
  gross_value: z.number(),
  comercial_discount_value: z.number(),
  financial_discount_value: z.number(),
  taxes_value: z.number(),
  deduction_value: z.number(),
  net_value: z.number(),
  status: z.number().int(),
  transport_code: z.string(),
  transport_code_set_by: z.number().int(),
  exchange_currency_id: z.number().int(),
  exchange_total_value: z.number(),
  exchange_rate: z.number(),
  document_type: moloniDocumentTypeSchema,
  document_set: moloniDocumentSetSchema,
  // "dependendo se foi definido uma conversão monetária, a estrutura
  // exchange_currency poderá não existir" (getOne page; applied
  // conservatively to the summary too)
  exchange_currency: moloniExchangeCurrencySchema.optional(),
})

export const moloniGetAllResponseSchema = z.array(moloniDocumentSummarySchema)

const moloniProductTaxSchema = z.strictObject({
  tax_id: z.number().int(),
  type: z.number().int(),
  saft_type: z.number().int(),
  vat_type: z.string(),
  stamp_tax: z.string(),
  name: z.string(),
  value: z.number(),
  fiscal_zone: z.string(),
  order: z.number().int(),
  cumulative: z.number().int(),
  incidence_value: z.number(),
  total_value: z.number(),
})

const moloniProductSupplierSchema = z.strictObject({
  supplier_id: z.number().int(),
  number: z.string(),
  name: z.string(),
  vat: z.string(),
})

const moloniDocumentProductSchema = z.strictObject({
  ean: z.string(),
  order: z.number().int(),
  product_id: z.number().int(),
  category_id: z.number().int(),
  reference: z.string(),
  name: z.string(),
  summary: z.string(),
  price: z.number(),
  unit_id: z.number().int(),
  unit_name: z.string(),
  unit_short_name: z.string(),
  discount: z.number(),
  qty: z.number(),
  exemption_reason: z.string(),
  // "Dentro de cada elemento de products, poderá não existir a estrutura
  // supplier" (getOne page)
  supplier: moloniProductSupplierSchema.optional(),
  // "o conjunto taxes poderá estar vazio" (getOne page)
  taxes: z.array(moloniProductTaxSchema),
})

const moloniSalesmanSchema = z.strictObject({
  salesman_id: z.number().int(),
  number: z.string(),
  name: z.string(),
  vat: z.string(),
})

const moloniAssociatedDocumentSchema = z.strictObject({
  associated_id: z.number().int(),
  value: z.number(),
})

const moloniPaymentSchema = z.strictObject({
  payment_method_id: z.number().int(),
  payment_method_name: z.string(),
  date: z.string(),
  value: z.number(),
  notes: z.string(),
})

/** documents/getOne response. */
export const moloniDocumentDetailSchema = z.strictObject({
  document_id: z.number().int(),
  company_id: z.number().int(),
  document_type_id: z.number().int(),
  customer_id: z.number().int(),
  supplier_id: z.number().int(),
  salesman_id: z.number().int(),
  document_set_id: z.number().int(),
  number: z.number().int(),
  date: z.string(),
  expiration_date: z.string().nullable(),
  year: z.number().int(),
  your_reference: z.string(),
  our_reference: z.string(),
  entity_number: z.string(),
  entity_name: z.string(),
  entity_vat: z.string(),
  entity_address: z.string(),
  entity_city: z.string(),
  entity_zip_code: z.string(),
  entity_country: z.string(),
  alternate_address_id: z.number().int(),
  attached_file: z.string(),
  notes: z.string(),
  salesman_commission: z.number(),
  deduction_id: z.number().int(),
  deduction_percentage: z.number(),
  deduction_name: z.string(),
  special_discount: z.number(),
  financial_discount: z.number(),
  gross_value: z.number(),
  comercial_discount_value: z.number(),
  financial_discount_value: z.number(),
  taxes_value: z.number(),
  deduction_value: z.number(),
  net_value: z.number(),
  reconciled_value: z.number(),
  delivery_method_id: z.number().int(),
  delivery_method_name: z.string(),
  vehicle_id: z.number().int(),
  vehicle_name: z.string(),
  vehicle_number_plate: z.string(),
  delivery_datetime: z.string().nullable(),
  delivery_departure_address: z.string(),
  delivery_departure_city: z.string(),
  delivery_departure_zip_code: z.string(),
  delivery_departure_country: z.number().int(),
  delivery_destination_address: z.string(),
  delivery_destination_city: z.string(),
  delivery_destination_zip_code: z.string(),
  delivery_destination_country: z.number().int(),
  related_documents_notes: z.string(),
  status: z.number().int(),
  transport_code: z.string(),
  transport_code_set_by: z.number().int(),
  rsa_hash: z.string(),
  hash_control: z.number().int(),
  exchange_currency_id: z.number().int(),
  exchange_total_value: z.number(),
  exchange_rate: z.number(),
  // "poderá não existir" — getOne page
  exchange_currency: moloniExchangeCurrencySchema.optional(),
  document_type: moloniDocumentTypeSchema,
  document_set: moloniDocumentSetSchema,
  // "Dependendo se foi definido um vendedor ou não, a estrutura salesman
  // poderá não existir" — getOne page
  salesman: moloniSalesmanSchema.optional(),
  products: z.array(moloniDocumentProductSchema),
  associated_documents: z.array(moloniAssociatedDocumentSchema),
  payments: z.array(moloniPaymentSchema),
})

/** documents/getPDFLink response. */
export const moloniPdfLinkResponseSchema = z.strictObject({
  url: z.string(),
})

export type MoloniGrantResponse = z.infer<typeof moloniGrantResponseSchema>
export type MoloniDocumentSummary = z.infer<typeof moloniDocumentSummarySchema>
export type MoloniDocumentDetail = z.infer<typeof moloniDocumentDetailSchema>
export type MoloniProductTax = z.infer<typeof moloniProductTaxSchema>
