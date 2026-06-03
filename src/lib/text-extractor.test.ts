import { vi, describe, it, expect, beforeEach } from 'vitest'
import { extractText } from './text-extractor'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetText = vi.fn()
const MockPDFParse = vi.fn(function (this: { getText: typeof mockGetText }) {
  this.getText = mockGetText
})

vi.mock('pdf-parse', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get PDFParse() { return MockPDFParse },
}))

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(),
  },
}))

vi.mock('xlsx', () => ({
  read: vi.fn(),
  utils: {
    sheet_to_csv: vi.fn(),
  },
}))

vi.mock('adm-zip', () => {
  const MockAdmZip = vi.fn()
  MockAdmZip.prototype.getEntries = vi.fn()
  return { default: MockAdmZip }
})

import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import AdmZip from 'adm-zip'

// ── Tests ──────────────────────────────────────────────────────────────────

describe('extractText', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetText.mockResolvedValue({ text: 'extracted pdf text' })
    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: 'extracted docx text', messages: [] })
  })

  // PDF
  describe('.pdf files', () => {
    it('calls PDFParse and returns extracted text', async () => {
      const buffer = Buffer.from('fake pdf bytes')
      const result = await extractText(buffer, 'invoice.pdf')

      expect(PDFParse).toHaveBeenCalledWith({ data: buffer })
      expect(mockGetText).toHaveBeenCalledOnce()
      expect(result).toBe('extracted pdf text')
    })

    it('works with uppercase extension (.PDF)', async () => {
      const buffer = Buffer.from('fake pdf bytes')
      const result = await extractText(buffer, 'INVOICE.PDF')

      expect(PDFParse).toHaveBeenCalledWith({ data: buffer })
      expect(result).toBe('extracted pdf text')
    })
  })

  // DOCX
  describe('.docx files', () => {
    it('calls mammoth.extractRawText and returns extracted text', async () => {
      const buffer = Buffer.from('fake docx bytes')
      const result = await extractText(buffer, 'contract.docx')

      expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer })
      expect(result).toBe('extracted docx text')
    })

    it('works with uppercase extension (.DOCX)', async () => {
      const buffer = Buffer.from('fake docx bytes')
      const result = await extractText(buffer, 'CONTRACT.DOCX')

      expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer })
      expect(result).toBe('extracted docx text')
    })
  })

  // TXT
  describe('.txt files', () => {
    it('returns buffer decoded as UTF-8', async () => {
      const content = 'plain text content\nline two'
      const buffer = Buffer.from(content, 'utf-8')
      const result = await extractText(buffer, 'notes.txt')

      expect(result).toBe(content)
    })

    it('handles UTF-8 characters (Portuguese accents)', async () => {
      const content = 'Declaração fiscal — NIF: 123456789'
      const buffer = Buffer.from(content, 'utf-8')
      const result = await extractText(buffer, 'doc.txt')

      expect(result).toBe(content)
    })
  })

  // CSV
  describe('.csv files', () => {
    it('returns buffer decoded as UTF-8', async () => {
      const content = 'col1,col2\nval1,val2'
      const buffer = Buffer.from(content, 'utf-8')
      const result = await extractText(buffer, 'data.csv')

      expect(result).toBe(content)
    })
  })

  // XLSX / XLS
  describe('.xlsx and .xls files', () => {
    beforeEach(() => {
      vi.mocked(XLSX.read).mockReturnValue({
        SheetNames: ['Movimentos'],
        Sheets: { Movimentos: {} },
      } as never)
      vi.mocked(XLSX.utils.sheet_to_csv).mockReturnValue(
        'Data\tDescrição\tDébito\tCrédito\tSaldo\n01/01/2024\tTransferência\t\t1000.00\t5000.00'
      )
    })

    it('reads workbook and returns sheet content for .xlsx', async () => {
      const buffer = Buffer.from('fake xlsx bytes')
      const result = await extractText(buffer, 'movimentos.xlsx')

      expect(XLSX.read).toHaveBeenCalledWith(buffer, { type: 'buffer' })
      expect(result).toContain('[Folha: Movimentos]')
      expect(result).toContain('Data\tDescrição\tDébito')
    })

    it('reads workbook and returns sheet content for .xls', async () => {
      const buffer = Buffer.from('fake xls bytes')
      const result = await extractText(buffer, 'relatorio.xls')

      expect(XLSX.read).toHaveBeenCalledWith(buffer, { type: 'buffer' })
      expect(result).toContain('[Folha: Movimentos]')
    })

    it('concatenates multiple sheets', async () => {
      vi.mocked(XLSX.read).mockReturnValue({
        SheetNames: ['Janeiro', 'Fevereiro'],
        Sheets: { Janeiro: {}, Fevereiro: {} },
      } as never)
      vi.mocked(XLSX.utils.sheet_to_csv)
        .mockReturnValueOnce('Data\tValor\n01/01/2024\t100')
        .mockReturnValueOnce('Data\tValor\n01/02/2024\t200')

      const result = await extractText(Buffer.from(''), 'relatorio.xlsx')

      expect(result).toContain('[Folha: Janeiro]')
      expect(result).toContain('[Folha: Fevereiro]')
    })

    it('limits to first 100 rows per sheet', async () => {
      const manyRows = Array.from({ length: 200 }, (_, i) => `row${i}\tval${i}`).join('\n')
      vi.mocked(XLSX.utils.sheet_to_csv).mockReturnValue(manyRows)

      const result = await extractText(Buffer.from(''), 'big.xlsx')

      const rowCount = (result ?? '').split('\n').filter(l => l.startsWith('row')).length
      expect(rowCount).toBeLessThanOrEqual(100)
    })
  })

  // XML
  describe('.xml files', () => {
    it('returns raw XML content as UTF-8 text', async () => {
      const xmlContent = '<?xml version="1.0"?><AuditFile><Header><TaxRegistrationNumber>123456789</TaxRegistrationNumber></Header></AuditFile>'
      const buffer = Buffer.from(xmlContent, 'utf-8')
      const result = await extractText(buffer, 'SAFT-PT.xml')

      expect(result).toBe(xmlContent)
    })

    it('handles uppercase extension (.XML)', async () => {
      const content = '<root><element>value</element></root>'
      const result = await extractText(Buffer.from(content, 'utf-8'), 'export.XML')

      expect(result).toBe(content)
    })
  })

  // ZIP
  describe('.zip files', () => {
    it('extracts and concatenates text from each inner file', async () => {
      mockGetText.mockResolvedValue({ text: 'fatura pdf content' })

      const mockEntries = [
        {
          isDirectory: false,
          entryName: 'fatura.pdf',
          getData: () => Buffer.from('fake pdf'),
        },
        {
          isDirectory: false,
          entryName: 'recibo.txt',
          getData: () => Buffer.from('recibo content', 'utf-8'),
        },
      ]
      vi.mocked(AdmZip.prototype.getEntries).mockReturnValue(mockEntries as never)

      const result = await extractText(Buffer.from('fake zip'), 'documentos.zip')

      expect(result).toContain('[fatura.pdf]')
      expect(result).toContain('fatura pdf content')
      expect(result).toContain('[recibo.txt]')
      expect(result).toContain('recibo content')
    })

    it('skips directory entries', async () => {
      const mockEntries = [
        { isDirectory: true, entryName: 'subdir/', getData: () => Buffer.from('') },
        {
          isDirectory: false,
          entryName: 'doc.txt',
          getData: () => Buffer.from('file content', 'utf-8'),
        },
      ]
      vi.mocked(AdmZip.prototype.getEntries).mockReturnValue(mockEntries as never)

      const result = await extractText(Buffer.from('fake zip'), 'archive.zip')

      expect(result).not.toContain('[subdir/]')
      expect(result).toContain('[doc.txt]')
    })

    it('returns empty string for empty zip', async () => {
      vi.mocked(AdmZip.prototype.getEntries).mockReturnValue([])

      const result = await extractText(Buffer.from('fake zip'), 'empty.zip')

      expect(result).toBe('')
    })
  })

  // Images — handled by Claude Vision in worker, not here
  describe('image files', () => {
    it('returns placeholder for .png (handled by Claude Vision)', async () => {
      const result = await extractText(Buffer.from(''), 'scan.png')
      expect(result).toBe('[.png: text extraction not supported]')
    })

    it('returns placeholder for .jpg', async () => {
      const result = await extractText(Buffer.from(''), 'photo.jpg')
      expect(result).toBe('[.jpg: text extraction not supported]')
    })

    it('returns placeholder for .jpeg', async () => {
      const result = await extractText(Buffer.from(''), 'photo.jpeg')
      expect(result).toBe('[.jpeg: text extraction not supported]')
    })
  })

  // Unknown extensions
  describe('unknown extensions', () => {
    it('returns extension-specific placeholder for files without extension', async () => {
      const result = await extractText(Buffer.from(''), 'README')
      expect(result).toBe('[: text extraction not supported]')
    })
  })

  // Truncation
  describe('truncation at 8000 characters', () => {
    it('truncates PDF output longer than 8000 chars', async () => {
      const longText = 'a'.repeat(9000)
      mockGetText.mockResolvedValue({ text: longText })

      const result = await extractText(Buffer.from(''), 'big.pdf')

      expect(result).toHaveLength(8000 + '\n[truncated]'.length)
      expect(result!.endsWith('\n[truncated]')).toBe(true)
      expect(result!.startsWith('a'.repeat(8000))).toBe(true)
    })

    it('truncates DOCX output longer than 8000 chars', async () => {
      const longText = 'b'.repeat(10000)
      vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: longText, messages: [] })

      const result = await extractText(Buffer.from(''), 'big.docx')

      expect(result).toHaveLength(8000 + '\n[truncated]'.length)
      expect(result!.endsWith('\n[truncated]')).toBe(true)
    })

    it('truncates TXT output longer than 8000 chars', async () => {
      const longContent = 'c'.repeat(9000)
      const buffer = Buffer.from(longContent, 'utf-8')

      const result = await extractText(buffer, 'big.txt')

      expect(result).toHaveLength(8000 + '\n[truncated]'.length)
      expect(result!.endsWith('\n[truncated]')).toBe(true)
    })

    it('does not truncate output of exactly 8000 chars', async () => {
      const exactText = 'd'.repeat(8000)
      mockGetText.mockResolvedValue({ text: exactText })

      const result = await extractText(Buffer.from(''), 'exact.pdf')

      expect(result).toBe(exactText)
      expect(result).toHaveLength(8000)
    })

    it('does not truncate output shorter than 8000 chars', async () => {
      const shortText = 'short content'
      mockGetText.mockResolvedValue({ text: shortText })

      const result = await extractText(Buffer.from(''), 'short.pdf')

      expect(result).toBe(shortText)
    })
  })
})
