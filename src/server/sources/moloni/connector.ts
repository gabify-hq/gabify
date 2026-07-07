/**
 * MoloniConnector — DocumentSourceConnector implementation for Moloni.
 *
 * Pure: receives credentials/token state by parameter, returns data.
 * No persistence, no schema access (post-merge slice — see HANDOFF_MOLONI.md).
 */
import type { DocumentSourceConnector, Page, SourceDocument } from '../types'
import type { MoloniClientDeps, MoloniCredentials, MoloniTokenState } from './client'

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

export class MoloniConnector implements DocumentSourceConnector {
  constructor(options: MoloniConnectorOptions) {
    void options
    throw new Error('Not implemented (RED)')
  }

  async listIssuedDocuments(cursor?: string): Promise<Page<SourceDocument>> {
    void cursor
    throw new Error('Not implemented (RED)')
  }

  async fetchPdf(externalId: string): Promise<Buffer | null> {
    void externalId
    throw new Error('Not implemented (RED)')
  }
}
