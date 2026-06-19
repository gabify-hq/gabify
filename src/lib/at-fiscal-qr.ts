/**
 * Parser for Portuguese AT (Autoridade Tributária) fiscal QR codes.
 *
 * Format spec: Portaria n.º 195/2020, de 13 de agosto
 * Fields are separated by '*', each in the form KEY:VALUE.
 *
 * Key fields:
 *   A: NIF emitente
 *   B: NIF adquirente
 *   D: Tipo de documento (FT, FS, FR, NC, ND, GT, GR, ...)
 *   E: Estado (N=Normal, A=Anulado)
 *   F: Data (YYYYMMDD)
 *   G: Identificação do documento
 *   H: ATCUD
 *   N: Total IVA
 *   O: Total com IVA (grand total)
 *   Q: 4 primeiros caracteres do hash
 *   R: Nº certificado AT
 */

export interface ATQRData {
  /** NIF of the issuing entity */
  nifEmitter: string
  /** NIF of the buyer (may be '999999990' for anonymous) */
  nifBuyer: string | null
  /** AT document type code: FT, FS, FR, NC, ND, GT, GR, ... */
  docTypeCode: string
  /** Document status: N=Normal, A=Anulado */
  docStatus: string
  /** Issue date in YYYYMMDD format */
  dateRaw: string
  /** Document identifier (e.g. FT 28A2601/885) */
  docId: string
  /** ATCUD (unique AT identifier) */
  atcud: string | null
  /** Total VAT amount */
  totalVAT: number | null
  /** Grand total including VAT */
  totalAmount: number | null
  /** 4-char hash snippet from AT */
  hashSnippet: string | null
  /** AT certificate number */
  certNumber: string | null
}

/**
 * Parses an AT fiscal QR code string into structured data.
 * Returns null if the string doesn't look like an AT QR code.
 */
export function parseATFiscalQR(qrData: string): ATQRData | null {
  // Minimum signal: must contain 'A:' (NIF emitente) and 'O:' (total)
  if (!qrData.includes('A:') || !qrData.includes('O:')) return null

  const fields: Record<string, string> = {}
  for (const part of qrData.split('*')) {
    const colonIdx = part.indexOf(':')
    if (colonIdx > 0) {
      const key = part.substring(0, colonIdx)
      const value = part.substring(colonIdx + 1)
      fields[key] = value
    }
  }

  // Required fields
  if (!fields['A'] || !fields['D'] || !fields['O']) return null

  const totalAmount = parseFloat(fields['O'])
  if (isNaN(totalAmount)) return null

  return {
    nifEmitter: fields['A'],
    nifBuyer: fields['B'] ?? null,
    docTypeCode: fields['D'],
    docStatus: fields['E'] ?? 'N',
    dateRaw: fields['F'] ?? '',
    docId: fields['G'] ?? '',
    atcud: fields['H'] ?? null,
    totalVAT: fields['N'] ? parseFloat(fields['N']) : null,
    totalAmount,
    hashSnippet: fields['Q'] ?? null,
    certNumber: fields['R'] ?? null,
  }
}

/**
 * Maps AT document type code to Gabify DocumentType enum value.
 *
 * From the accountant's intake perspective (classifying documents received from clients):
 * - Invoices/receipts from suppliers → INVOICE_RECEIVED
 * - Simplified invoices from coffee shops, restaurants, tolls → RECEIPT
 * - Credit/debit notes → INVOICE_RECEIVED
 * - Transport guides → OTHER
 */
export function atQRDocTypeToDocumentType(docTypeCode: string): string {
  switch (docTypeCode) {
    case 'FT': return 'INVOICE_RECEIVED'    // Fatura
    case 'FS': return 'RECEIPT'             // Fatura Simplificada (sem NIF comprador)
    case 'FR': return 'INVOICE_RECEIPT'     // Fatura-Recibo (combina fatura + recibo de pagamento)
    case 'NC': return 'INVOICE_RECEIVED'    // Nota de Crédito
    case 'ND': return 'INVOICE_RECEIVED'    // Nota de Débito
    case 'GR': return 'OTHER'               // Guia de Remessa
    case 'GT': return 'OTHER'               // Guia/Talão de Transporte
    case 'RP': return 'OTHER'               // Recibo de Prémio de Seguro
    case 'RE': return 'OTHER'               // Recibo de Estorno
    case 'CS': return 'OTHER'               // Imputação a Co-seguradoras
    case 'LD': return 'OTHER'               // Imputação a Líder de Co-seguro
    case 'RA': return 'OTHER'               // Recibo de Agência
    default:   return 'OTHER'
  }
}

/**
 * Converts AT QR date (YYYYMMDD) to DD/MM/YYYY Portuguese format.
 * Returns null if the input is invalid.
 */
export function atQRDateToPT(yyyymmdd: string): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null
  const day = yyyymmdd.slice(6, 8)
  const month = yyyymmdd.slice(4, 6)
  const year = yyyymmdd.slice(0, 4)
  // Basic sanity check
  const d = parseInt(day), m = parseInt(month), y = parseInt(year)
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2000) return null
  return `${day}/${month}/${year}`
}

/**
 * Returns a human-readable document type label in Portuguese.
 */
export function atQRDocTypeLabel(docTypeCode: string): string {
  const labels: Record<string, string> = {
    FT: 'Fatura',
    FS: 'Fatura Simplificada',
    FR: 'Fatura-Recibo',
    NC: 'Nota de Crédito',
    ND: 'Nota de Débito',
    GR: 'Guia de Remessa',
    GT: 'Guia de Transporte',
  }
  return labels[docTypeCode] ?? `Documento AT (${docTypeCode})`
}
