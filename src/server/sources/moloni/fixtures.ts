/**
 * Doc-derived Moloni API fixtures.
 *
 * Every shape below is copied from the response examples in
 * integrations/moloni/docs/ (fetched 2026-07-07). Field sets must stay in
 * sync with those pages — the contract tests in schemas.test.ts enforce it.
 * Values are floats on purpose: that is what the Moloni doc specifies, and
 * the whole point of the mapper is converting them to cents exactly once.
 */
import type { MoloniDocumentDetail } from './schemas'

/** Grant response — integrations/moloni/docs/autenticacao.md §3º Passo. */
export function grantResponseFixture(overrides?: {
  accessToken?: string
  refreshToken?: string
}) {
  return {
    access_token: overrides?.accessToken ?? 'bad936989865c810e14a81ea9fc2cd8ea8d5e9f6',
    expires_in: 3600,
    token_type: 'bearer',
    scope: null,
    refresh_token: overrides?.refreshToken ?? '96f84474f2ed3ae07e4e1b5d08fe1893d08a204f',
  }
}

/** Auth error — integrations/moloni/docs/controlo-de-erros.md. */
export const authErrorFixture = {
  error: 'invalid_grant',
  error_description: 'Token is no longer valid',
}

/**
 * documents/getOne response — integrations/moloni/docs/documents_documents_getone.md.
 *
 * Invoice with three lines across two VAT rates. Amounts chosen to break
 * naive float arithmetic:
 *   23%: bases 19.99 + 0.30 = 20.29 → 2029c, tax 4.60 + 0.07 → 467c
 *    6%: base 10.00 → 1000c, tax 0.60 → 60c
 * Total (net_value) 35.56 → 3556c.
 */
export const invoiceMultiRateDetail = {
  document_id: 11111,
  company_id: 5,
  document_type_id: 1,
  customer_id: 77,
  supplier_id: 0,
  salesman_id: 0,
  document_set_id: 3,
  number: 42,
  date: '2026-06-30 00:00:00',
  expiration_date: null,
  year: 2026,
  your_reference: '',
  our_reference: '',
  entity_number: '77',
  entity_name: 'Cliente Exemplo Lda',
  entity_vat: '123456789',
  entity_address: 'Rua de Exemplo 1',
  entity_city: 'Lisboa',
  entity_zip_code: '1000-001',
  entity_country: 'Portugal',
  alternate_address_id: 0,
  attached_file: '',
  notes: '',
  salesman_commission: 0.0,
  deduction_id: 0,
  deduction_percentage: 0.0,
  deduction_name: '',
  special_discount: 0.0,
  financial_discount: 0.0,
  gross_value: 30.29,
  comercial_discount_value: 0.0,
  financial_discount_value: 0.0,
  taxes_value: 5.27,
  deduction_value: 0.0,
  net_value: 35.56,
  reconciled_value: 0.0,
  delivery_method_id: 0,
  delivery_method_name: '',
  vehicle_id: 0,
  vehicle_name: '',
  vehicle_number_plate: '',
  delivery_datetime: null,
  delivery_departure_address: '',
  delivery_departure_city: '',
  delivery_departure_zip_code: '',
  delivery_departure_country: 0,
  delivery_destination_address: '',
  delivery_destination_city: '',
  delivery_destination_zip_code: '',
  delivery_destination_country: 0,
  related_documents_notes: '',
  status: 1,
  transport_code: '',
  transport_code_set_by: 0,
  rsa_hash: 'mF9a',
  hash_control: 1,
  exchange_currency_id: 0,
  exchange_total_value: 0.0,
  exchange_rate: 0.0,
  document_type: { document_type_id: 1, saft_code: 'FT' },
  document_set: { document_set_id: 3, name: 'A' },
  products: [
    {
      ean: '',
      order: 0,
      product_id: 201,
      category_id: 10,
      reference: 'SRV-A',
      name: 'Serviço A',
      summary: '',
      price: 19.99,
      unit_id: 1,
      unit_name: 'Unidade',
      unit_short_name: 'un',
      discount: 0.0,
      qty: 1,
      exemption_reason: '',
      taxes: [
        {
          tax_id: 1,
          type: 1,
          saft_type: 1,
          vat_type: 'NOR',
          stamp_tax: '',
          name: 'IVA 23%',
          value: 23.0,
          fiscal_zone: 'Continente',
          order: 0,
          cumulative: 0,
          incidence_value: 19.99,
          total_value: 4.6,
        },
      ],
    },
    {
      ean: '',
      order: 1,
      product_id: 202,
      category_id: 10,
      reference: 'PRD-B',
      name: 'Produto B',
      summary: '',
      price: 5.0,
      unit_id: 1,
      unit_name: 'Unidade',
      unit_short_name: 'un',
      discount: 0.0,
      qty: 2,
      exemption_reason: '',
      taxes: [
        {
          tax_id: 2,
          type: 1,
          saft_type: 1,
          vat_type: 'RED',
          stamp_tax: '',
          name: 'IVA 6%',
          value: 6.0,
          fiscal_zone: 'Continente',
          order: 0,
          cumulative: 0,
          incidence_value: 10.0,
          total_value: 0.6,
        },
      ],
    },
    {
      ean: '',
      order: 2,
      product_id: 203,
      category_id: 10,
      reference: 'SRV-C',
      name: 'Serviço C',
      summary: '',
      price: 0.1,
      unit_id: 1,
      unit_name: 'Unidade',
      unit_short_name: 'un',
      discount: 0.0,
      qty: 3,
      exemption_reason: '',
      taxes: [
        {
          tax_id: 1,
          type: 1,
          saft_type: 1,
          vat_type: 'NOR',
          stamp_tax: '',
          name: 'IVA 23%',
          value: 23.0,
          fiscal_zone: 'Continente',
          order: 0,
          cumulative: 0,
          incidence_value: 0.3,
          total_value: 0.07,
        },
      ],
    },
  ],
  associated_documents: [],
  payments: [],
}

/**
 * Invoice with a VAT-exempt line (taxes empty, exemption_reason filled) —
 * per documents_documents_getone.md: "o conjunto taxes poderá estar vazio
 * (caso em que o campo exemption_reason ... estará forçosamente preenchido)".
 */
export const invoiceWithExemptLineDetail = {
  ...invoiceMultiRateDetail,
  document_id: 22222,
  number: 43,
  gross_value: 119.99,
  taxes_value: 4.67,
  net_value: 124.66,
  products: [
    invoiceMultiRateDetail.products[0],
    invoiceMultiRateDetail.products[2],
    {
      ...invoiceMultiRateDetail.products[1],
      product_id: 204,
      reference: 'FRM-D',
      name: 'Formação D',
      price: 100.0,
      qty: 1,
      exemption_reason: 'M07',
      taxes: [],
    },
  ],
}

/** A draft (status 0) — must never leave the connector. */
export const draftDetail = {
  ...invoiceMultiRateDetail,
  document_id: 99999,
  number: 0,
  status: 0,
}

/**
 * documents/getAll summary item derived from a getOne detail —
 * integrations/moloni/docs/documents_documents_getall.md (summary shape has
 * no products/payments/associated_documents and no per-entity city fields).
 */
export function summaryOf(detail: MoloniDocumentDetail) {
  return {
    document_id: detail.document_id,
    document_type_id: detail.document_type_id,
    document_set_id: detail.document_set_id,
    number: detail.number,
    date: detail.date,
    expiration_date: detail.expiration_date,
    your_reference: detail.your_reference,
    our_reference: detail.our_reference,
    entity_number: detail.entity_number,
    entity_name: detail.entity_name,
    entity_vat: detail.entity_vat,
    entity_address: detail.entity_address,
    gross_value: detail.gross_value,
    comercial_discount_value: detail.comercial_discount_value,
    financial_discount_value: detail.financial_discount_value,
    taxes_value: detail.taxes_value,
    deduction_value: detail.deduction_value,
    net_value: detail.net_value,
    status: detail.status,
    transport_code: detail.transport_code,
    transport_code_set_by: detail.transport_code_set_by,
    exchange_currency_id: detail.exchange_currency_id,
    exchange_total_value: detail.exchange_total_value,
    exchange_rate: detail.exchange_rate,
    document_type: detail.document_type,
    document_set: detail.document_set,
    exchange_currency: { currency_id: 1, iso4217: 'EUR', symbol: '€' },
  }
}

/** getPDFLink response — integrations/moloni/docs/documents_documents_getpdflink.md. */
export function pdfLinkFixture(documentId: number) {
  return { url: `https://mock.moloni.local/pdf/${documentId}.pdf` }
}
