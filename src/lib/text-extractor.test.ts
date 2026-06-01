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

import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

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
  describe('.xlsx files', () => {
    it('returns unsupported placeholder for .xlsx', async () => {
      const result = await extractText(Buffer.from(''), 'report.xlsx')
      expect(result).toBe('[XLSX: text extraction not supported]')
    })

    it('returns unsupported placeholder for .xls', async () => {
      const result = await extractText(Buffer.from(''), 'report.xls')
      expect(result).toBe('[XLSX: text extraction not supported]')
    })
  })

  // Unknown extensions
  describe('unknown extensions', () => {
    it('returns extension-specific placeholder for .png', async () => {
      const result = await extractText(Buffer.from(''), 'scan.png')
      expect(result).toBe('[.png: text extraction not supported]')
    })

    it('returns extension-specific placeholder for .jpg', async () => {
      const result = await extractText(Buffer.from(''), 'photo.jpg')
      expect(result).toBe('[.jpg: text extraction not supported]')
    })

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
      expect(result.endsWith('\n[truncated]')).toBe(true)
      expect(result.startsWith('a'.repeat(8000))).toBe(true)
    })

    it('truncates DOCX output longer than 8000 chars', async () => {
      const longText = 'b'.repeat(10000)
      vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: longText, messages: [] })

      const result = await extractText(Buffer.from(''), 'big.docx')

      expect(result).toHaveLength(8000 + '\n[truncated]'.length)
      expect(result.endsWith('\n[truncated]')).toBe(true)
    })

    it('truncates TXT output longer than 8000 chars', async () => {
      const longContent = 'c'.repeat(9000)
      const buffer = Buffer.from(longContent, 'utf-8')

      const result = await extractText(buffer, 'big.txt')

      expect(result).toHaveLength(8000 + '\n[truncated]'.length)
      expect(result.endsWith('\n[truncated]')).toBe(true)
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
