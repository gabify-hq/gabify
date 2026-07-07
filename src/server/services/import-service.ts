import { z } from 'zod'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic'
import { isValidNif } from '@/lib/nif'
import { parsePtDate } from '@/lib/dates'
import { centsFromDecimalString, decimalStringFromCents, COHERENCE_TOLERANCE_CENTS } from '@/lib/money'
import { normalizeDocumentNumber } from './extraction'
import type { ImportBatch } from '@prisma/client'

/**
 * Spreadsheet import (S2.4): parse → AI-proposed column mapping → HUMAN
 * confirmation → documents. Import never happens without the confirmation
 * step (AC-2.5.c). Rows are validated (NIF checksum, arithmetic coherence)
 * and errors reported line by line.
 */

export interface ParsedSheet {
  headers: string[]
  rows: Array<Record<string, string>>
}

export function parseSheet(buffer: Buffer, filename: string): ParsedSheet {
  if (filename.toLowerCase().endsWith('.csv')) {
    // PT CSVs use ';' — parse manually (xlsx defaults to comma)
    const text = buffer.toString('utf-8').replace(/^﻿/, '')
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
    const headers = lines[0].split(';').map((h) => h.trim())
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(';')
      const row: Record<string, string> = {}
      headers.forEach((h, i) => {
        row[h] = (cells[i] ?? '').trim()
      })
      return row
    })
    return { headers, rows }
  }

  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: '' })
  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  return { headers, rows }
}

const MAPPING_SCHEMA = z.object({
  mapping: z.object({
    date: z.string(),
    documentNumber: z.string(),
    supplierNif: z.string(),
    netAmount: z.string(),
    vatRate: z.string(),
    totalAmount: z.string(),
  }),
})

export type ColumnMapping = z.infer<typeof MAPPING_SCHEMA>['mapping']

/** Proposes a column mapping via Claude (5-row sample); heuristic fallback. */
export async function proposeMapping(sheet: ParsedSheet): Promise<ColumnMapping> {
  try {
    const sample = sheet.rows.slice(0, 5)
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Colunas de uma folha de lançamentos PT: ${JSON.stringify(sheet.headers)}. Amostra: ${JSON.stringify(sample)}. Devolve APENAS JSON {"mapping":{"date":"<coluna>","documentNumber":"<coluna>","supplierNif":"<coluna>","netAmount":"<coluna>","vatRate":"<coluna>","totalAmount":"<coluna>"}}`,
        },
      ],
    })
    const raw = (response.content[0] as { text: string }).text
    return MAPPING_SCHEMA.parse(JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, ''))).mapping
  } catch {
    // Heuristic fallback on common PT header names
    const find = (...names: string[]) =>
      sheet.headers.find((h) => names.includes(h.toLowerCase())) ?? sheet.headers[0]
    return {
      date: find('data', 'date'),
      documentNumber: find('numero', 'número', 'nº doc', 'documento'),
      supplierNif: find('nif', 'contribuinte'),
      netAmount: find('base', 'valor base', 'incidencia'),
      vatRate: find('taxa_iva', 'taxa', 'iva'),
      totalAmount: find('total', 'valor total'),
    }
  }
}

export interface ImportReport {
  imported: number
  errors: Array<{ line: number; reason: string }>
}

/**
 * Confirms a pending batch with a (possibly edited) mapping and creates the
 * documents. Fails with CONFLICT when the batch is not pending — a batch can
 * never be imported twice, and never without confirmation.
 */
export async function confirmImportBatch(params: {
  batchId: string
  officeId: string
  mapping: ColumnMapping
}): Promise<{ ok: true; report: ImportReport } | { ok: false; httpStatus: 404 | 409 }> {
  const batch = await prisma.importBatch.findFirst({
    where: { id: params.batchId, officeId: params.officeId },
  })
  if (!batch) return { ok: false, httpStatus: 404 }

  // Conditional transition — never double-import (same pattern as A3/A7)
  const claimed = await prisma.importBatch.updateMany({
    where: { id: batch.id, status: 'PENDING_CONFIRMATION' },
    data: { status: 'IMPORTED', confirmedMapping: params.mapping as object },
  })
  if (claimed.count === 0) return { ok: false, httpStatus: 409 }

  const rows = batch.rowsData as Array<Record<string, string>>
  const report: ImportReport = { imported: 0, errors: [] }
  const m = params.mapping

  for (const [index, row] of rows.entries()) {
    const line = index + 1
    try {
      const nif = (row[m.supplierNif] ?? '').trim()
      if (!isValidNif(nif)) {
        report.errors.push({ line, reason: `NIF inválido (dígito de controlo): ${nif}` })
        continue
      }
      const issueDate = parsePtDate(row[m.date] ?? '')
      if (!issueDate) {
        report.errors.push({ line, reason: `Data inválida: ${row[m.date]}` })
        continue
      }
      const netCents = centsFromDecimalString(row[m.netAmount] ?? '')
      const totalCents = centsFromDecimalString(row[m.totalAmount] ?? '')
      const rate = Number((row[m.vatRate] ?? '').replace(',', '.'))
      const vatCents = Math.round((netCents * rate) / 100)
      if (Math.abs(netCents + vatCents - totalCents) > COHERENCE_TOLERANCE_CENTS) {
        report.errors.push({ line, reason: `base+IVA não corresponde ao total (${row[m.totalAmount]})` })
        continue
      }

      const documentNumber = normalizeDocumentNumber(row[m.documentNumber] ?? '')
      await prisma.document.create({
        data: {
          officeId: params.officeId,
          source: 'IMPORT',
          extractionSource: 'IMPORT',
          status: 'NEEDS_REVIEW', // estado direto para revisão — sem parse IA
          type: 'INVOICE_RECEIVED',
          confidence: 1,
          clientId: batch.clientId,
          supplierNif: nif,
          documentNumber,
          documentNumberRaw: row[m.documentNumber]?.trim() !== documentNumber ? row[m.documentNumber] : null,
          issueDate,
          netAmount: decimalStringFromCents(netCents),
          vatAmount: decimalStringFromCents(vatCents),
          totalAmount: decimalStringFromCents(totalCents),
          vatBreakdown: [{ region: 'PT', rate, baseCents: netCents, vatCents }],
          extractedDate: issueDate,
          extractedAmount: totalCents / 100,
          extractedVATNumber: nif,
          originalFilename: batch.filename,
        },
      })
      report.imported += 1
    } catch (error) {
      report.errors.push({
        line,
        reason: error instanceof Error ? error.message : 'Linha inválida',
      })
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { report: report as object },
  })

  return { ok: true, report }
}

export interface DetectedHeader {
  original: string
  normalized: string
}

export async function createImportBatch(params: {
  officeId: string
  userId: string
  filename: string
  buffer: Buffer
  clientId?: string | null
}): Promise<{
  batch: ImportBatch
  proposedMapping: ColumnMapping
  sample: Array<Record<string, string>>
  headers: DetectedHeader[]
}> {
  const sheet = parseSheet(params.buffer, params.filename)
  const proposedMapping = await proposeMapping(sheet)

  const batch = await prisma.importBatch.create({
    data: {
      officeId: params.officeId,
      createdByUserId: params.userId,
      filename: params.filename,
      clientId: params.clientId ?? null,
      proposedMapping: proposedMapping as object,
      rowsData: sheet.rows as object,
    },
  })
  return {
    batch,
    proposedMapping,
    sample: sheet.rows.slice(0, 5),
    // File order preserved (S5.3) — the mapping UI needs the real columns,
    // not whatever keys survive in the sample rows
    headers: sheet.headers.map((h) => ({ original: h, normalized: h.trim().toLowerCase() })),
  }
}
