/**
 * TOConline API response fixtures — copied VERBATIM (values included) from the
 * official documentation pages saved in `integrations/toconline/docs/`.
 * Never invent fields here: every shape must point to its source.
 */

/** docs/autenticacao-detalhada.md §2.2 — response of POST {OAUTH_URL}/token (authorization_code). */
export const TOKEN_RESPONSE = {
  access_token: '10dc1d36e24b790540d087ea238ec345abd1a02daa73ae45a09',
  expires_in: 14400,
  refresh_token: 'f71824c9e4675a8aa9661f18ae5341e977d37',
  token_type: 'Bearer',
}

/**
 * docs/autenticacao-detalhada.md §2.3 — response of POST {OAUTH_URL}/token
 * (refresh_token). NOTE: the documented example carries NO refresh_token,
 * although the surrounding text mentions "o novo refresh_token". The client
 * must keep the previous refresh token when the field is absent (conservative
 * reading — INTEGRATION_NOTES.md).
 */
export const REFRESH_RESPONSE = {
  access_token: 'b5604dacd4257355cb3692c79fe39490429b',
  expires_in: 14400,
  token_type: 'Bearer',
}

/** docs/apis_empresa_fornecedores.md — "Criar Fornecedor" response example. */
export const SUPPLIER_CREATED_RESPONSE = {
  data: {
    type: 'suppliers',
    id: '7',
    attributes: {
      tax_registration_number: '533186331',
      business_name: 'A Empresa',
      website: null,
      is_taxable: false,
      is_tax_exempt: false,
      tax_exemption_reason_id: null,
      self_billing: null,
      document_series_id: null,
      internal_observations: null,
      tax_country_region: 'PT',
      is_independent_worker: false,
      country_iso_alpha_2: 'PT',
      saft_import_id: null,
      accounting_number: null,
      trusted_email_source: false,
    },
  },
}

/**
 * Shape of a suppliers list item — same attributes as the documented single
 * supplier response (docs/apis_empresa_fornecedores.md, "Obter Fornecedor por
 * Id" example), wrapped in the JSONAPI list envelope `{"data": [...]}` shown
 * in docs/autenticacao-detalhada.md §3.
 */
export function supplierListResponse(
  suppliers: Array<{ id: string; tax_registration_number: string; business_name: string }>,
) {
  return {
    data: suppliers.map((s) => ({
      type: 'suppliers',
      id: s.id,
      attributes: {
        tax_registration_number: s.tax_registration_number,
        business_name: s.business_name,
        website: null,
        is_taxable: false,
        is_tax_exempt: false,
        tax_exemption_reason_id: null,
        self_billing: null,
        document_series_id: null,
        internal_observations: null,
        tax_country_region: 'PT',
        is_independent_worker: false,
        country_iso_alpha_2: 'PT',
        saft_import_id: null,
        accounting_number: null,
        trusted_email_source: false,
      },
    })),
  }
}

/**
 * Purchases list envelope for GET /api/commercial_purchases_documents.
 * JSONAPI `{"data":[{"type","id","attributes"}]}` per docs/autenticacao-detalhada.md §3;
 * attribute names (`status`, `supplier_tax_registration_number`,
 * `external_reference`) come from the documented v0 payload/filters
 * (docs/apis_versoes-anteriores_compras_documentos-de-compra.md).
 */
export function purchasesListResponse(
  purchases: Array<{
    id: string
    status: number
    supplier_tax_registration_number: string
    external_reference: string | null
  }>,
) {
  return {
    data: purchases.map((p) => ({
      type: 'commercial_purchases_documents',
      id: p.id,
      attributes: {
        status: p.status,
        supplier_tax_registration_number: p.supplier_tax_registration_number,
        external_reference: p.external_reference,
      },
    })),
  }
}

/**
 * Response of POST /api/v1/commercial_purchases_documents. The saved spec
 * declares `200` with no schema — conservative reading (INTEGRATION_NOTES.md
 * ambiguity #3): JSONAPI envelope with the created id, like every other
 * documented response.
 */
export function purchaseCreatedResponse(id: string) {
  return { data: { type: 'commercial_purchases_documents', id } }
}

// ── Sales documents (pull slice) ─────────────────────────────────────────────

/**
 * Attributes of a finalized sales document — subset of the full response
 * example in docs/apis_versoes-anteriores_vendas_documentos-de-venda.md
 * ("Exemplo de Response" of the finalize step, FT 2023/3). Every field name
 * below appears verbatim in that saved example.
 */
export interface SalesDocumentAttributes {
  document_no: string
  document_type: string
  status: number
  date: string
  due_date: string | null
  gross_total: number
  net_total: number
  tax_payable: number
  retention_value: number
  customer_business_name: string
  customer_tax_registration_number: string
  customer_tax_country_region: string
  currency_iso_code: string
  external_reference: string | null
  updated_at: string
  vat_incidence_ise: number
  vat_incidence_red: number
  vat_incidence_int: number
  vat_incidence_nor: number
  vat_total_red: number
  vat_total_int: number
  vat_total_nor: number
  vat_percentage_red: number | null
  vat_percentage_int: number | null
  vat_percentage_nor: number | null
}

/** Doc-example defaults (FT 2023/3) — override per test. */
export function salesDocumentAttributes(
  overrides: Partial<SalesDocumentAttributes> = {},
): SalesDocumentAttributes {
  return {
    document_no: 'FT 2023/3',
    document_type: 'FT',
    status: 1,
    date: '2023-01-01',
    due_date: '2023-01-01',
    gross_total: 11.38,
    net_total: 9.25,
    tax_payable: 2.13,
    retention_value: 0,
    customer_business_name: 'Ricardo Ribeiro',
    customer_tax_registration_number: '229659179',
    customer_tax_country_region: 'PT',
    currency_iso_code: 'EUR',
    external_reference: null,
    updated_at: '2024-02-22 18:21:13.512872',
    vat_incidence_ise: 0,
    vat_incidence_red: 0,
    vat_incidence_int: 0,
    vat_incidence_nor: 9.25,
    vat_total_red: 0,
    vat_total_int: 0,
    vat_total_nor: 2.13,
    vat_percentage_red: null,
    vat_percentage_int: null,
    vat_percentage_nor: 23.0,
    ...overrides,
  }
}

/** JSONAPI list envelope (docs/autenticacao-detalhada.md §3). */
export function salesDocumentsListResponse(
  documents: Array<{ id: string; attributes: SalesDocumentAttributes }>,
) {
  return {
    data: documents.map((d) => ({
      type: 'commercial_sales_documents',
      id: d.id,
      attributes: d.attributes,
    })),
  }
}

/**
 * Lines of a sales document — attribute names from the line attribute table
 * in docs/apis_versoes-anteriores_vendas_documentos-de-venda.md ("Atualizar
 * Linha…": description, quantity, unit_price, amount, tax_percentage,
 * tax_country_region; "equivalente à que é obtida após criação ou obtenção").
 */
export function salesDocumentLinesResponse(
  lines: Array<{
    id: string
    description: string
    quantity: number
    unit_price: number
    amount: number
    tax_percentage: number
    tax_country_region: string
  }>,
) {
  return {
    data: lines.map((l) => ({
      type: 'commercial_sales_document_lines',
      id: l.id,
      attributes: {
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        amount: l.amount,
        tax_percentage: l.tax_percentage,
        tax_country_region: l.tax_country_region,
      },
    })),
  }
}

/**
 * GET /api/url_for_print/{salesDocumentId} — response copied from the saved
 * spec example (operationId with url {scheme, host, port, path}); the download
 * link is scheme://host/path per docs/apis_vendas_descarregar-pdf-….md.
 */
export function urlForPrintResponse(id: string, host: string, path: string) {
  return {
    data: {
      attributes: { url: { host, path, port: 443, scheme: 'https' } },
      id,
      type: 'url_for_print',
    },
  }
}
