import type { DocumentType } from '@/types'

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
