import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Contract validation of generated payloads against the OpenAPI spec saved in
 * `integrations/toconline/openapi.json` (downloaded from the official
 * SwaggerHub reference — never edited by hand).
 *
 * The spec's line schema for POST /api/v1/commercial_purchases_documents is
 * visibly truncated (only item/tax ids), while the official markdown page
 * (integrations/toconline/docs/apis_compras_documentos-de-compra.md)
 * documents the full line payload. Contract = spec properties ∪ the fields
 * documented on that page (INTEGRATION_NOTES.md ambiguity #2). Nothing
 * outside that union is allowed.
 */

interface OpenApiSchema {
  type?: string
  properties?: Record<string, OpenApiSchema>
  items?: OpenApiSchema
}

interface OpenApiSpec {
  paths: Record<
    string,
    Record<
      string,
      { requestBody?: { content?: Record<string, { schema?: OpenApiSchema }> } }
    >
  >
}

let cachedSpec: OpenApiSpec | null = null
function loadSpec(): OpenApiSpec {
  if (!cachedSpec) {
    const specPath = resolve(__dirname, '../../integrations/toconline/openapi.json')
    cachedSpec = JSON.parse(readFileSync(specPath, 'utf-8')) as OpenApiSpec
  }
  return cachedSpec
}

function requestSchema(path: string, method: string): OpenApiSchema {
  const op = loadSpec().paths[path]?.[method]
  const content = op?.requestBody?.content ?? {}
  const first = Object.values(content)[0]
  if (!first?.schema) throw new Error(`No request schema in saved spec for ${method} ${path}`)
  return first.schema
}

/**
 * Line fields documented on the saved markdown page for the v1 purchases POST
 * but missing from the spec's (truncated) line schema.
 */
const DOC_PAGE_LINE_FIELDS: Record<string, 'string' | 'number'> = {
  description: 'string',
  quantity: 'number',
  unit_price: 'number',
  settlement_expression: 'string',
  tax_code: 'string',
  tax_percentage: 'number',
  tax_country_region: 'string',
  item_code: 'string',
  unit_of_measure: 'string',
}

function typeOfSchema(schema: OpenApiSchema): string | undefined {
  return schema.type
}

function assertPrimitive(key: string, value: unknown, expected: string | undefined, errors: string[]) {
  if (expected === undefined || value === null || value === undefined) return
  const actual = typeof value
  const wanted = expected === 'integer' ? 'number' : expected
  if (wanted === 'array' || wanted === 'object') return
  if (actual !== wanted) errors.push(`${key}: expected ${wanted}, got ${actual}`)
}

/** Throws with the full error list when the payload violates the saved contract. */
export function assertPurchasePayloadMatchesContract(payload: Record<string, unknown>): void {
  const schema = requestSchema('/api/v1/commercial_purchases_documents', 'post')
  const props = schema.properties ?? {}
  const lineProps = props.lines?.items?.properties ?? {}
  const errors: string[] = []

  for (const [key, value] of Object.entries(payload)) {
    if (!(key in props)) {
      errors.push(`unknown top-level field not in saved spec: ${key}`)
      continue
    }
    if (key === 'lines') continue
    assertPrimitive(key, value, typeOfSchema(props[key]), errors)
  }

  const lines = payload.lines
  if (!Array.isArray(lines) || lines.length === 0) {
    errors.push('lines must be a non-empty array')
  } else {
    lines.forEach((line, i) => {
      if (typeof line !== 'object' || line === null) {
        errors.push(`lines[${i}] is not an object`)
        return
      }
      for (const [key, value] of Object.entries(line as Record<string, unknown>)) {
        const fromSpec = key in lineProps ? typeOfSchema(lineProps[key]) : undefined
        const fromDocPage = DOC_PAGE_LINE_FIELDS[key]
        if (fromSpec === undefined && fromDocPage === undefined) {
          errors.push(`lines[${i}].${key} not documented in spec nor in the saved doc page`)
          continue
        }
        assertPrimitive(`lines[${i}].${key}`, value, fromSpec ?? fromDocPage, errors)
      }
    })
  }

  if (errors.length > 0) {
    throw new Error(`Purchase payload violates the saved TOConline contract:\n- ${errors.join('\n- ')}`)
  }
}

/** Supplier creation payload (JSONAPI) against the saved spec + doc page table. */
export function assertSupplierPayloadMatchesContract(payload: Record<string, unknown>): void {
  const errors: string[] = []
  const data = payload.data as { type?: unknown; attributes?: Record<string, unknown> } | undefined
  if (!data || data.type !== 'suppliers') {
    errors.push('payload.data.type must be "suppliers" (doc page payload example)')
  }
  // Attribute table on the saved page docs/apis_empresa_fornecedores.md
  const allowed = new Set([
    'tax_registration_number',
    'business_name',
    'website',
    'is_taxable',
    'is_tax_exempt',
    'self_billing',
    'document_series_id',
    'internal_observations',
    'tax_country_region',
    'is_independent_worker',
  ])
  const attrs = data?.attributes ?? {}
  for (const key of Object.keys(attrs)) {
    if (!allowed.has(key)) errors.push(`unknown supplier attribute: ${key}`)
  }
  if (!attrs['tax_registration_number']) errors.push('tax_registration_number is mandatory')
  if (!attrs['business_name']) errors.push('business_name is mandatory')

  if (errors.length > 0) {
    throw new Error(`Supplier payload violates the saved TOConline contract:\n- ${errors.join('\n- ')}`)
  }
}
