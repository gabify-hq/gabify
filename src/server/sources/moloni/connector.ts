/**
 * MoloniConnector — DocumentSourceConnector implementation for Moloni.
 *
 * Pure: receives credentials/token state by parameter, returns data.
 * No persistence, no schema access (post-merge slice — see HANDOFF_MOLONI.md).
 *
 * Flow per page (integrations/moloni/docs/):
 * 1. documents/getAll (company_id, qty ≤ 50, offset) — summaries only
 * 2. drop drafts client-side (status 0 — INTEGRATION_NOTES_MOLONI.md §3)
 * 3. documents/getOne per remaining document — the doc offers no batch
 *    detail endpoint, so lines/taxes require one call each (rate limited)
 * 4. map to SourceDocument with all values in cents
 */
import type { DocumentSourceConnector, Page, SourceDocument } from '../types'
import {
  MoloniApiClient,
  MoloniApiError,
  type MoloniClientDeps,
  type MoloniCredentials,
  type MoloniTokenState,
} from './client'
import {
  moloniDocumentDetailSchema,
  moloniGetAllResponseSchema,
  moloniPdfLinkResponseSchema,
} from './schemas'
import { mapMoloniDocument } from './mapper'
import type { z } from 'zod'

/** Doc maximum for documents/getAll qty. */
const MAX_PAGE_SIZE = 50
const DRAFT_STATUS = 0

export interface MoloniConnectorOptions {
  credentials: MoloniCredentials
  /** Moloni company to pull from (companies/getAll of the account). */
  companyId: number
  /** Page size for documents/getAll — doc maximum is 50. */
  pageSize?: number
  /** Previously stored token state, if any. */
  tokenState?: MoloniTokenState
  deps?: MoloniClientDeps
}

function parseOffsetCursor(cursor: string): number {
  const offset = Number(cursor)
  if (!Number.isInteger(offset) || offset < 0) {
    throw new MoloniApiError('validation', `Invalid Moloni pagination cursor: ${cursor}`)
  }
  return offset
}

function parseContract<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  context: string
): z.infer<Schema> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new MoloniApiError(
      'contract',
      `Moloni ${context} response does not match the documented shape: ${result.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.code}`)
        .join('; ')}`
    )
  }
  return result.data
}

export class MoloniConnector implements DocumentSourceConnector {
  private readonly client: MoloniApiClient
  private readonly companyId: number
  private readonly pageSize: number
  /**
   * External ids already returned by this instance — offset pagination can
   * repeat documents across pages when the collection shifts upstream.
   */
  private readonly seenExternalIds = new Set<string>()

  constructor(options: MoloniConnectorOptions) {
    this.client = new MoloniApiClient(options.credentials, options.deps, options.tokenState)
    this.companyId = options.companyId
    this.pageSize = Math.min(options.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
  }

  async listIssuedDocuments(cursor?: string): Promise<Page<SourceDocument>> {
    const offset = cursor === undefined ? 0 : parseOffsetCursor(cursor)
    const rawSummaries = await this.client.call('documents/getAll', {
      company_id: this.companyId,
      qty: this.pageSize,
      offset,
    })
    const summaries = parseContract(moloniGetAllResponseSchema, rawSummaries, 'documents/getAll')

    const toFetch = summaries.filter(
      (summary) =>
        summary.status !== DRAFT_STATUS && !this.seenExternalIds.has(String(summary.document_id))
    )

    const items: SourceDocument[] = []
    for (const summary of toFetch) {
      const rawDetail = await this.client.call('documents/getOne', {
        company_id: this.companyId,
        document_id: summary.document_id,
      })
      const detail = parseContract(moloniDocumentDetailSchema, rawDetail, 'documents/getOne')
      items.push(mapMoloniDocument(detail))
      this.seenExternalIds.add(String(summary.document_id))
    }

    // A full raw page means more documents may follow; the doc exposes no
    // total count (INTEGRATION_NOTES_MOLONI.md §3).
    const nextCursor =
      summaries.length === this.pageSize ? String(offset + summaries.length) : null
    return { items, nextCursor }
  }

  async fetchPdf(externalId: string): Promise<Buffer | null> {
    try {
      const rawLink = await this.client.call('documents/getPDFLink', {
        company_id: this.companyId,
        document_id: Number(externalId),
        // Without signed the downloaded PDF is not signed (getpdflink doc
        // page) — an unsigned invoice is useless for accounting.
        signed: 1,
      })
      const link = parseContract(moloniPdfLinkResponseSchema, rawLink, 'documents/getPDFLink')
      return await this.client.fetchBinary(link.url)
    } catch (error) {
      // Drafts and unknown ids are refused by the API (4xx) — that is a
      // "no PDF available" outcome, not a failure.
      if (error instanceof MoloniApiError && error.kind === 'validation') {
        return null
      }
      throw error
    }
  }
}
