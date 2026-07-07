import type { SourceConnectionStatus } from '@prisma/client'

/**
 * Non-secret DTO for a source connection (Moloni / InvoiceXpress), built
 * field-by-field so credentials can never leak to the client. `hasCredentials`
 * signals a saved connection without exposing anything sensitive.
 */
export interface SourceConnectionDTO {
  system: 'MOLONI' | 'INVOICEXPRESS'
  clientId: string
  status: SourceConnectionStatus
  pullEnabled: boolean
  lastPullAt: string | null
  lastError: string | null
  hasCredentials: boolean
  importedCount: number
  updatedAt: string
  // System-specific, non-secret display fields:
  accountName?: string // InvoiceXpress
  companyId?: number // Moloni
  companyName?: string // Moloni
}
