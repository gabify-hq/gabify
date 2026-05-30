// Gabify — Global TypeScript Types
// Mirror of Prisma enums + domain types

export type UserRole = 'OWNER' | 'ACCOUNTANT' | 'VIEWER'

export type EmailProvider = 'OUTLOOK' | 'GMAIL' | 'IMAP'

export type EmailStatus =
  | 'UNREAD'
  | 'READ'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'ARCHIVED'
  | 'IGNORED'

export type ActionType =
  | 'DRAFT_REPLY'
  | 'FORWARD'
  | 'ARCHIVE'
  | 'REQUEST_DOCS'

export type ActionStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SENT'
  | 'EDITED_SENT'

export type DocumentType =
  | 'INVOICE_RECEIVED'
  | 'INVOICE_ISSUED'
  | 'RECEIPT'
  | 'BANK_STATEMENT'
  | 'PAYROLL'
  | 'TAX_DOCUMENT'
  | 'AT_COMMUNICATION'
  | 'SOCIAL_SECURITY'
  | 'CONTRACT'
  | 'BALANCE_SHEET'
  | 'INCOME_STATEMENT'
  | 'OTHER'

export type DocumentStatus =
  | 'PENDING_CLASSIFICATION'
  | 'CLASSIFIED'
  | 'NEEDS_REVIEW'
  | 'REVIEWED'

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING'

// ─────────────────────────────────────────
// Email Provider Domain Types
// ─────────────────────────────────────────

export interface SyncResult {
  provider: EmailProvider
  emailAccountId: string
  messagesProcessed: number
  newMessages: number
  errors: string[]
  deltaLink?: string   // Outlook: updated deltaLink after sync
  historyId?: string   // Gmail: updated historyId after sync
}

export interface WatchResult {
  provider: EmailProvider
  subscriptionId?: string  // Outlook subscription ID
  expiresAt?: Date         // Outlook subscription expiry
  pubSubSubscription?: string  // Gmail Pub/Sub subscription name
}

export interface EmailDraft {
  subject?: string
  bodyText: string
  bodyHtml?: string
  toEmails?: string[]
  ccEmails?: string[]
}

// ─────────────────────────────────────────
// Document Classification
// ─────────────────────────────────────────

export interface ClassificationResult {
  type: DocumentType
  confidence: number
  reasoning: string       // one sentence in Portuguese
  extractedDate?: string  // DD/MM/YYYY
  extractedAmount?: number
  extractedVATNumber?: string
}

// ─────────────────────────────────────────
// Client Matching
// ─────────────────────────────────────────

export interface ClientMatchResult {
  clientId: string | null
  score: number         // 0.0-1.0
  matchedBy: 'exact_email' | 'known_email' | 'domain' | 'none'
}

// ─────────────────────────────────────────
// API Response Shapes
// ─────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T
}

export interface ApiError {
  error: string
  details?: unknown
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError
