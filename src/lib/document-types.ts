import type { DocumentType, DocumentSource, DocumentStatus } from '@/types'

/**
 * PT-PT display labels for document types (UI strings — the only sanctioned
 * Portuguese in code). Production home of what previously lived in mock-data.
 */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE_RECEIVED: 'Fatura recebida',
  INVOICE_ISSUED: 'Fatura emitida',
  INVOICE_RECEIPT: 'Fatura-Recibo',
  RECEIPT: 'Recibo',
  BANK_STATEMENT: 'Extrato bancário',
  PAYROLL: 'Recibo de vencimento',
  TAX_DOCUMENT: 'Documento fiscal',
  AT_COMMUNICATION: 'Comunicação AT',
  SOCIAL_SECURITY: 'Segurança Social',
  CONTRACT: 'Contrato',
  BALANCE_SHEET: 'Balanço',
  INCOME_STATEMENT: 'Dem. resultados',
  OTHER: 'Outro',
}

/**
 * PT-PT labels for the document INTAKE source (how the file entered Gabify).
 * Distinct from `classificationSource`, which says how it was READ.
 */
export const DOCUMENT_SOURCE_LABELS: Record<DocumentSource, string> = {
  EMAIL: 'Email',
  MANUAL_UPLOAD: 'Carregado',
  IMPORT: 'Folha importada',
  PORTAL_UPLOAD: 'Portal do cliente',
  API_PULL: 'Importado da fonte',
}

/** PT-PT labels for the REAL document lifecycle states (audit F1.2). */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  PENDING_CLASSIFICATION: 'Em processamento',
  CLASSIFIED: 'Classificado',
  NEEDS_REVIEW: 'A rever',
  REVIEWED: 'Arquivado',
  PRE_VALIDATED: 'Pré-validado',
  VALIDATED: 'Validado',
  EXPORTED: 'Exportado',
  SPLIT: 'Dividido',
}
