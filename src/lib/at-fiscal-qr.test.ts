import { describe, it, expect } from 'vitest'
import {
  parseATFiscalQR,
  atQRDocTypeToDocumentType,
  atQRDateToPT,
  atQRDocTypeLabel,
} from './at-fiscal-qr'

// Real QR code format from Oficina da Carne receipt:
// NIF: 514777648, date: 2026-01-14, total: 66.49, doc type: FR
const SAMPLE_FR_QR =
  'A:514777648*B:514282320*C:PT*D:FR*E:N*F:20260114*G:FT 28A2601/885*H:ABCD1234-1*I1:PT*I3:41.23*I4:5.36*I5:16.18*I6:3.72*N:9.08*O:66.49*Q:AbCd*R:196'

const SAMPLE_FT_QR =
  'A:123456789*B:987654321*C:PT*D:FT*E:N*F:20250301*G:FT A/100*H:EFGH5678-5*I1:PT*I3:100.00*I4:23.00*N:23.00*O:123.00*Q:XxYy*R:200'

const SAMPLE_FS_QR =
  'A:555666777*B:999999990*C:PT*D:FS*E:N*F:20260601*G:FS B/50*N:2.30*O:12.30*Q:ZzWw*R:100'

describe('parseATFiscalQR', () => {
  it('parses a valid Fatura-Recibo QR code', () => {
    const result = parseATFiscalQR(SAMPLE_FR_QR)
    expect(result).not.toBeNull()
    expect(result!.nifEmitter).toBe('514777648')
    expect(result!.nifBuyer).toBe('514282320')
    expect(result!.docTypeCode).toBe('FR')
    expect(result!.docStatus).toBe('N')
    expect(result!.dateRaw).toBe('20260114')
    expect(result!.docId).toBe('FT 28A2601/885')
    expect(result!.totalAmount).toBe(66.49)
    expect(result!.totalVAT).toBe(9.08)
  })

  it('parses a Fatura QR code', () => {
    const result = parseATFiscalQR(SAMPLE_FT_QR)
    expect(result).not.toBeNull()
    expect(result!.docTypeCode).toBe('FT')
    expect(result!.totalAmount).toBe(123.00)
    expect(result!.nifEmitter).toBe('123456789')
  })

  it('parses a Fatura Simplificada without buyer NIF', () => {
    const result = parseATFiscalQR(SAMPLE_FS_QR)
    expect(result).not.toBeNull()
    expect(result!.docTypeCode).toBe('FS')
    expect(result!.nifBuyer).toBe('999999990')
    expect(result!.totalAmount).toBe(12.30)
  })

  it('returns null for non-AT QR codes', () => {
    expect(parseATFiscalQR('https://www.example.com')).toBeNull()
    expect(parseATFiscalQR('just some text')).toBeNull()
    expect(parseATFiscalQR('')).toBeNull()
  })

  it('returns null when missing required O: field', () => {
    expect(parseATFiscalQR('A:514777648*D:FR*E:N')).toBeNull()
  })

  it('returns null when missing required A: field', () => {
    expect(parseATFiscalQR('B:999999990*D:FT*O:50.00')).toBeNull()
  })

  it('returns null when O: is not a valid number', () => {
    expect(parseATFiscalQR('A:514777648*D:FR*O:invalid')).toBeNull()
  })
})

describe('atQRDocTypeToDocumentType', () => {
  it('maps FT (Fatura) to INVOICE_RECEIVED', () => {
    expect(atQRDocTypeToDocumentType('FT')).toBe('INVOICE_RECEIVED')
  })

  it('maps FR (Fatura-Recibo) to INVOICE_RECEIVED', () => {
    expect(atQRDocTypeToDocumentType('FR')).toBe('INVOICE_RECEIVED')
  })

  it('maps FS (Fatura Simplificada) to RECEIPT', () => {
    expect(atQRDocTypeToDocumentType('FS')).toBe('RECEIPT')
  })

  it('maps NC (Nota de Crédito) to INVOICE_RECEIVED', () => {
    expect(atQRDocTypeToDocumentType('NC')).toBe('INVOICE_RECEIVED')
  })

  it('maps ND (Nota de Débito) to INVOICE_RECEIVED', () => {
    expect(atQRDocTypeToDocumentType('ND')).toBe('INVOICE_RECEIVED')
  })

  it('maps GR (Guia de Remessa) to OTHER', () => {
    expect(atQRDocTypeToDocumentType('GR')).toBe('OTHER')
  })

  it('maps unknown codes to OTHER', () => {
    expect(atQRDocTypeToDocumentType('XX')).toBe('OTHER')
  })
})

describe('atQRDateToPT', () => {
  it('converts YYYYMMDD to DD/MM/YYYY', () => {
    expect(atQRDateToPT('20260114')).toBe('14/01/2026')
  })

  it('converts another valid date', () => {
    expect(atQRDateToPT('20250301')).toBe('01/03/2025')
  })

  it('returns null for empty string', () => {
    expect(atQRDateToPT('')).toBeNull()
  })

  it('returns null for wrong length', () => {
    expect(atQRDateToPT('2026-01-14')).toBeNull()
    expect(atQRDateToPT('202601')).toBeNull()
  })

  it('returns null for invalid date values', () => {
    expect(atQRDateToPT('20261345')).toBeNull() // month 13
  })

  it('returns null for year before 2000', () => {
    expect(atQRDateToPT('19991231')).toBeNull()
  })
})

describe('atQRDocTypeLabel', () => {
  it('returns Portuguese label for known codes', () => {
    expect(atQRDocTypeLabel('FT')).toBe('Fatura')
    expect(atQRDocTypeLabel('FR')).toBe('Fatura-Recibo')
    expect(atQRDocTypeLabel('FS')).toBe('Fatura Simplificada')
    expect(atQRDocTypeLabel('NC')).toBe('Nota de Crédito')
  })

  it('returns fallback for unknown codes', () => {
    expect(atQRDocTypeLabel('XX')).toBe('Documento AT (XX)')
  })
})
