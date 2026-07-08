import type {
  ActionStatus,
  DocumentSource,
  DocumentStatus,
  DocumentType,
  EmailStatus,
} from '@/types'

/**
 * Server → UI data transfer objects (S1.6).
 * These replace the former Mock* types — server components map Prisma rows to
 * these shapes; client components never see Prisma models or mock data.
 */

export interface EmailDTO {
  id: string
  clientId: string | null
  clientName: string | null
  fromEmail: string
  fromName: string
  subject: string
  bodyText: string
  receivedAt: Date
  status: EmailStatus
  hasAttachments: boolean
  attachmentCount: number
  hasAction: boolean
  actionId?: string
}

export interface EmailActionDTO {
  id: string
  emailId: string
  type: 'DRAFT_REPLY' | 'REQUEST_DOCS' | 'ARCHIVE'
  status: ActionStatus
  draftContent: string
  editedContent?: string | null
  aiModel: string
  createdAt: Date
}

export interface DocumentDTO {
  id: string
  clientId: string
  clientName: string
  filename: string
  type: DocumentType
  typeLabel: string
  confidence: number
  /** REAL lifecycle state (audit F1.2) — never collapsed into 3 display buckets. */
  status: DocumentStatus
  /** Intake source (how the file entered Gabify) + pt-PT label. */
  source: DocumentSource
  sourceLabel: string
  extractedDate: string | null
  extractedAmount: number | null
  extractedVATNumber: string | null
  r2Key: string
  createdAt: Date
  period: string // MM/YYYY
  classificationSource: string | null
}

/** Minimal client option for dropdowns/filters. */
export interface ClientOptionDTO {
  id: string
  name: string
}
