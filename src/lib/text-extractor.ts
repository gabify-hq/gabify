import path from 'path'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

const MAX_CHARS = 8000

function truncate(text: string): string {
  if (text.length > MAX_CHARS) {
    return text.slice(0, MAX_CHARS) + '\n[truncated]'
  }
  return text
}

/**
 * Extracts plain text from a document buffer based on the filename extension.
 *
 * Supported formats:
 * - .pdf  → pdf-parse (PDFParse class)
 * - .docx → mammoth
 * - .txt, .csv → UTF-8 string conversion
 * - .xlsx, .xls → not supported (returns placeholder)
 * - other → not supported (returns placeholder)
 *
 * Output is capped at 8000 characters to stay within Claude context limits.
 */
export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase()

  switch (ext) {
    case '.pdf': {
      const parser = new PDFParse({ data: buffer })
      const result = await parser.getText()
      return truncate(result.text)
    }

    case '.docx': {
      const result = await mammoth.extractRawText({ buffer })
      return truncate(result.value)
    }

    case '.txt':
    case '.csv': {
      return truncate(buffer.toString('utf-8'))
    }

    case '.xlsx':
    case '.xls': {
      return '[XLSX: text extraction not supported]'
    }

    default: {
      return `[${ext}: text extraction not supported]`
    }
  }
}
