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
