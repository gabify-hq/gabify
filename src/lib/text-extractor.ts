import path from 'path'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import AdmZip from 'adm-zip'

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
 * - .pdf       → pdf-parse (PDFParse class)
 * - .docx      → mammoth
 * - .txt, .csv → UTF-8 string conversion
 * - .xlsx, .xls → xlsx (first 100 rows per sheet)
 * - .xml       → UTF-8 (SAF-T and e-factura)
 * - .zip       → recursive extraction of each inner file
 * - images     → placeholder (worker routes to Claude Vision)
 * - other      → placeholder
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
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheets: string[] = []
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' })
        // First 100 rows — enough for headers + sample data for classification
        const sample = csv.split('\n').slice(0, 100).join('\n')
        sheets.push(`[Folha: ${sheetName}]\n${sample}`)
      }
      return truncate(sheets.join('\n\n'))
    }

    case '.xml': {
      // SAF-T, e-factura, AT communications — return raw XML, Claude understands it
      return truncate(buffer.toString('utf-8'))
    }

    case '.zip': {
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries()
      const parts: string[] = []
      for (const entry of entries) {
        if (entry.isDirectory) continue
        const innerBuffer = entry.getData()
        const innerText = await extractText(innerBuffer, entry.entryName)
        parts.push(`[${entry.entryName}]\n${innerText}`)
      }
      return truncate(parts.join('\n\n---\n\n'))
    }

    default: {
      return `[${ext}: text extraction not supported]`
    }
  }
}
