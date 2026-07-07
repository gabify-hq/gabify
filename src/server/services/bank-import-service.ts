import { createHash } from 'crypto'
import { z } from 'zod'
import { fileTypeFromBuffer } from 'file-type'
import { prisma } from '@/lib/prisma'
import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic'
import { parsePtDate } from '@/lib/dates'
import { centsFromBankAmount } from '@/lib/bank-amount'
import { parseSheet, type ParsedSheet } from './import-service'
import type { BankStatementImport } from '@prisma/client'

/**
 * Bank statement import (fase C1): upload → automatic column detection
 * (PT-header heuristic first, AI fallback) → MANDATORY human confirmation →
 * transactions. Mirrors the spreadsheet-import wizard (AC-2.5.c): nothing is
 * written to BankTransaction before the mapping is confirmed.
 *
 * Duplicate rows (dedupHash) are skipped and reported — never a 500.
 * Re-importing the same file (fileHash) is a 409 unless explicitly forced.
 */

export const MAX_BANK_FILE_BYTES = 10 * 1024 * 1024

const BANK_MAPPING_FIELDS = z.object({
  bookingDate: z.string().min(1),
  description: z.string().min(1),
  amount: z.string().min(1).optional(), // single signed column…
  debit: z.string().min(1).optional(), // …or separate debit/credit columns
  credit: z.string().min(1).optional(),
  valueDate: z.string().min(1).optional(),
  balance: z.string().min(1).optional(),
  externalRef: z.string().min(1).optional(),
})

export const BANK_MAPPING_SCHEMA = BANK_MAPPING_FIELDS.refine(
  (m) => m.amount !== undefined || m.debit !== undefined || m.credit !== undefined,
  { message: 'Mapping needs an amount column or debit/credit columns' },
)

export type BankColumnMapping = z.infer<typeof BANK_MAPPING_SCHEMA>

const AI_MAPPING_SCHEMA = z.object({ mapping: BANK_MAPPING_SCHEMA })

/** Lowercase, accent-stripped, space-collapsed header for heuristic matching. */
function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Common PT bank-statement header names (spec C1). */
const HEADER_PATTERNS: Array<{ field: keyof BankColumnMapping; patterns: RegExp[] }> = [
  { field: 'valueDate', patterns: [/^data[- ]?valor$/] },
  {
    field: 'bookingDate',
    patterns: [/^data$/, /^data (mov|movimento|operacao|lancamento|contabilistica)/],
  },
  {
    field: 'description',
    patterns: [/^descri(cao|tivo)/, /^movimento(s)?$/, /^designacao$/, /^detalhe/, /^historico$/],
  },
  { field: 'amount', patterns: [/^montante$/, /^valor$/, /^importancia$/, /^quantia$/] },
  { field: 'debit', patterns: [/^debito$/, /^a debito$/, /^debitos$/] },
  { field: 'credit', patterns: [/^credito$/, /^a credito$/, /^creditos$/] },
  { field: 'balance', patterns: [/^saldo/] },
  { field: 'externalRef', patterns: [/^referencia/, /^ref$/, /^num? (operacao|documento)/] },
]

/** Heuristic column detection; null when the required columns are not found. */
export function detectBankColumns(headers: string[]): BankColumnMapping | null {
  const mapping: Partial<Record<keyof BankColumnMapping, string>> = {}
  for (const header of headers) {
    const normalized = normalizeHeader(header)
    for (const { field, patterns } of HEADER_PATTERNS) {
      if (mapping[field] !== undefined) continue
      if (patterns.some((p) => p.test(normalized))) {
        mapping[field] = header
        break
      }
    }
  }
  const parsed = BANK_MAPPING_SCHEMA.safeParse(mapping)
  return parsed.success ? parsed.data : null
}

/** AI fallback — same pattern as the document import (5-row sample, strict zod). */
async function proposeMappingViaAi(sheet: ParsedSheet): Promise<BankColumnMapping> {
  const sample = sheet.rows.slice(0, 5)
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content:
          `Colunas de um extrato bancário PT: ${JSON.stringify(sheet.headers)}. ` +
          `Amostra: ${JSON.stringify(sample)}. ` +
          `Devolve APENAS JSON {"mapping":{"bookingDate":"<coluna da data do movimento>",` +
          `"description":"<coluna do descritivo>","amount":"<coluna do montante com sinal, se existir>",` +
          `"debit":"<coluna de débito, se separada>","credit":"<coluna de crédito, se separada>",` +
          `"valueDate":"<coluna da data-valor, se existir>","balance":"<coluna do saldo, se existir>",` +
          `"externalRef":"<coluna de referência, se existir>"}} — omite chaves sem coluna correspondente.`,
      },
    ],
  })
  const raw = (response.content[0] as { text: string }).text
  return AI_MAPPING_SCHEMA.parse(
    JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '')),
  ).mapping
}

export type BankFileValidation =
  | { ok: true }
  | { ok: false; httpStatus: 413 | 415 | 422; error: string }

/** Magic-byte validation (A4): extension alone is never trusted. */
export async function validateBankStatementFile(
  buffer: Buffer,
  filename: string,
): Promise<BankFileValidation> {
  if (buffer.length > MAX_BANK_FILE_BYTES) {
    return { ok: false, httpStatus: 413, error: 'Ficheiro excede o limite de 10MB' }
  }
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext !== 'csv' && ext !== 'xlsx') {
    return { ok: false, httpStatus: 415, error: 'Apenas CSV ou XLSX' }
  }
  const detected = await fileTypeFromBuffer(buffer)
  if (ext === 'xlsx') {
    // XLSX is an OOXML/ZIP container
    const mime = detected?.mime ?? ''
    const isOoxml = mime === 'application/zip' || mime.includes('officedocument.spreadsheetml')
    if (!isOoxml) {
      console.warn(
        `[bank-import] magic-byte mismatch: "${filename}" claims XLSX but is ${detected?.mime ?? 'unknown'} — rejected`,
      )
      return { ok: false, httpStatus: 422, error: 'O conteúdo do ficheiro não corresponde a XLSX' }
    }
    return { ok: true }
  }
  // CSV is plain text — any detected binary signature is a mismatch
  if (detected) {
    console.warn(
      `[bank-import] magic-byte mismatch: "${filename}" claims CSV but is ${detected.mime} — rejected`,
    )
    return { ok: false, httpStatus: 422, error: 'O conteúdo do ficheiro não corresponde a CSV' }
  }
  return { ok: true }
}

export function sha256Hex(buffer: Buffer | string): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Trim + collapse internal whitespace; dedup compares uppercase (A8 style). */
function normalizeDescription(description: string): string {
  return description.replace(/\s+/g, ' ').trim()
}

export function bankTransactionDedupHash(params: {
  bankAccountId: string
  bookingDate: Date
  amountCents: number
  description: string
}): string {
  const day = params.bookingDate.toISOString().slice(0, 10)
  const desc = normalizeDescription(params.description).toUpperCase()
  return sha256Hex(`${params.bankAccountId}|${day}|${params.amountCents}|${desc}`)
}

export type CreateBankImportResult =
  | {
      ok: true
      import: BankStatementImport
      proposedMapping: BankColumnMapping
      mappingSource: 'heuristic' | 'ai'
      sample: Array<Record<string, string>>
      headers: Array<{ original: string; normalized: string }>
    }
  | { ok: false; httpStatus: 404 | 409 | 413 | 415 | 422; error: string; canForce?: boolean }

/** Step 1 of the wizard: parse, detect columns, persist PENDING import. */
export async function createBankStatementImport(params: {
  officeId: string
  userId: string
  bankAccountId: string
  filename: string
  buffer: Buffer
  force?: boolean
}): Promise<CreateBankImportResult> {
  const account = await prisma.bankAccount.findFirst({
    where: { id: params.bankAccountId, officeId: params.officeId },
    select: { id: true },
  })
  if (!account) return { ok: false, httpStatus: 404, error: 'Conta bancária não encontrada' }

  const validation = await validateBankStatementFile(params.buffer, params.filename)
  if (!validation.ok) return validation

  const fileHash = sha256Hex(params.buffer)
  if (!params.force) {
    const existing = await prisma.bankStatementImport.findFirst({
      where: {
        officeId: params.officeId,
        bankAccountId: params.bankAccountId,
        fileHash,
        status: { in: ['PENDING', 'PROCESSED'] },
      },
      select: { id: true },
    })
    if (existing) {
      return {
        ok: false,
        httpStatus: 409,
        error: 'Este ficheiro já foi importado para esta conta',
        canForce: true,
      }
    }
  }

  let sheet: ParsedSheet
  try {
    sheet = parseSheet(params.buffer, params.filename)
  } catch {
    return { ok: false, httpStatus: 422, error: 'Não foi possível ler o ficheiro' }
  }
  if (sheet.rows.length === 0) {
    return { ok: false, httpStatus: 422, error: 'O ficheiro não tem movimentos' }
  }

  let proposedMapping = detectBankColumns(sheet.headers)
  let mappingSource: 'heuristic' | 'ai' = 'heuristic'
  if (!proposedMapping) {
    try {
      proposedMapping = await proposeMappingViaAi(sheet)
      mappingSource = 'ai'
    } catch {
      return {
        ok: false,
        httpStatus: 422,
        error: 'Não foi possível detetar as colunas do extrato — verifique o ficheiro',
      }
    }
  }

  const created = await prisma.bankStatementImport.create({
    data: {
      officeId: params.officeId,
      bankAccountId: params.bankAccountId,
      filename: params.filename,
      fileHash,
      mappingSource,
      proposedMapping: proposedMapping as object,
      rowsData: sheet.rows as object,
      rowCount: sheet.rows.length,
      importedByUserId: params.userId,
    },
  })

  return {
    ok: true,
    import: created,
    proposedMapping,
    mappingSource,
    sample: sheet.rows.slice(0, 5),
    headers: sheet.headers.map((h) => ({ original: h, normalized: normalizeHeader(h) })),
  }
}

export interface BankImportReport {
  imported: number
  skippedDuplicates: Array<{ line: number; reason: string }>
  errors: Array<{ line: number; reason: string }>
}

export type ConfirmBankImportResult =
  | { ok: true; report: BankImportReport }
  | { ok: false; httpStatus: 404 | 409 | 422; error: string; details?: Record<string, string> }

interface ParsedRow {
  line: number
  bookingDate: Date
  valueDate: Date | null
  description: string
  amountCents: number
  balanceCents: number | null
  externalRef: string | null
  dedupHash: string
}

function parseRow(
  row: Record<string, string>,
  line: number,
  m: BankColumnMapping,
  bankAccountId: string,
): { ok: true; row: ParsedRow } | { ok: false; reason: string } {
  const bookingDate = parsePtDate(row[m.bookingDate] ?? '')
  if (!bookingDate) return { ok: false, reason: `Data inválida: "${row[m.bookingDate] ?? ''}"` }

  const description = normalizeDescription(row[m.description] ?? '')
  if (description === '') return { ok: false, reason: 'Descrição em falta' }

  let amountCents: number
  try {
    const single = m.amount !== undefined ? (row[m.amount] ?? '').trim() : ''
    const debit = m.debit !== undefined ? (row[m.debit] ?? '').trim() : ''
    const credit = m.credit !== undefined ? (row[m.credit] ?? '').trim() : ''
    if (single !== '') {
      amountCents = centsFromBankAmount(single)
    } else if (debit !== '' && credit !== '') {
      return { ok: false, reason: 'Linha com débito e crédito em simultâneo' }
    } else if (debit !== '') {
      amountCents = -Math.abs(centsFromBankAmount(debit)) // débito = negativo
    } else if (credit !== '') {
      amountCents = Math.abs(centsFromBankAmount(credit))
    } else {
      return { ok: false, reason: 'Montante em falta' }
    }
  } catch {
    return { ok: false, reason: 'Montante ilegível' }
  }

  let valueDate: Date | null = null
  if (m.valueDate !== undefined && (row[m.valueDate] ?? '').trim() !== '') {
    valueDate = parsePtDate(row[m.valueDate])
  }
  let balanceCents: number | null = null
  if (m.balance !== undefined && (row[m.balance] ?? '').trim() !== '') {
    try {
      balanceCents = centsFromBankAmount(row[m.balance])
    } catch {
      balanceCents = null // saldo é informativo — nunca chumba a linha
    }
  }
  const externalRef =
    m.externalRef !== undefined && (row[m.externalRef] ?? '').trim() !== ''
      ? row[m.externalRef].trim()
      : null

  return {
    ok: true,
    row: {
      line,
      bookingDate,
      valueDate,
      description,
      amountCents,
      balanceCents,
      externalRef,
      dedupHash: bankTransactionDedupHash({ bankAccountId, bookingDate, amountCents, description }),
    },
  }
}

/**
 * Step 2 of the wizard: human-confirmed mapping → transactions.
 * Conditional PENDING→PROCESSED transition — an import can never be confirmed
 * twice (same pattern as A3/A7/ImportBatch).
 */
export async function confirmBankStatementImport(params: {
  importId: string
  officeId: string
  mapping: unknown
}): Promise<ConfirmBankImportResult> {
  const pending = await prisma.bankStatementImport.findFirst({
    where: { id: params.importId, officeId: params.officeId },
  })
  if (!pending) return { ok: false, httpStatus: 404, error: 'Import não encontrado' }

  const parsedMapping = BANK_MAPPING_SCHEMA.safeParse(params.mapping)
  if (!parsedMapping.success) {
    return {
      ok: false,
      httpStatus: 422,
      error: 'Mapeamento de colunas inválido',
      details: Object.fromEntries(
        parsedMapping.error.issues.map((i) => [i.path.join('.') || 'mapping', i.message]),
      ),
    }
  }
  const mapping = parsedMapping.data

  const claimed = await prisma.bankStatementImport.updateMany({
    where: { id: pending.id, status: 'PENDING' },
    data: { status: 'PROCESSED', confirmedMapping: mapping as object },
  })
  if (claimed.count === 0) {
    return { ok: false, httpStatus: 409, error: 'Import já confirmado' }
  }

  const rows = pending.rowsData as Array<Record<string, string>>
  const report: BankImportReport = { imported: 0, skippedDuplicates: [], errors: [] }

  const parsedRows: ParsedRow[] = []
  for (const [index, row] of rows.entries()) {
    const line = index + 1
    const parsed = parseRow(row, line, mapping, pending.bankAccountId)
    if (!parsed.ok) {
      report.errors.push({ line, reason: parsed.reason })
      continue
    }
    parsedRows.push(parsed.row)
  }

  // Duplicates — in-file and against previous imports — are skipped and
  // reported, never a 500 (unique (officeId, dedupHash) backs this up in SQL).
  const existing = await prisma.bankTransaction.findMany({
    where: { officeId: params.officeId, dedupHash: { in: parsedRows.map((r) => r.dedupHash) } },
    select: { dedupHash: true },
  })
  const seen = new Set(existing.map((t) => t.dedupHash))
  const toCreate: ParsedRow[] = []
  for (const row of parsedRows) {
    if (seen.has(row.dedupHash)) {
      report.skippedDuplicates.push({ line: row.line, reason: 'Movimento duplicado — ignorado' })
      continue
    }
    seen.add(row.dedupHash)
    toCreate.push(row)
  }

  if (toCreate.length > 0) {
    await prisma.bankTransaction.createMany({
      data: toCreate.map((row) => ({
        officeId: params.officeId,
        bankAccountId: pending.bankAccountId,
        importId: pending.id,
        bookingDate: row.bookingDate,
        valueDate: row.valueDate,
        description: row.description,
        amountCents: row.amountCents,
        balanceCents: row.balanceCents,
        externalRef: row.externalRef,
        dedupHash: row.dedupHash,
      })),
      skipDuplicates: true, // belt-and-braces against concurrent confirms
    })
    report.imported = toCreate.length
  }

  const dates = parsedRows.map((r) => r.bookingDate.getTime())
  await prisma.bankStatementImport.update({
    where: { id: pending.id },
    data: {
      errorReport: report as object,
      periodFrom: dates.length > 0 ? new Date(Math.min(...dates)) : null,
      periodTo: dates.length > 0 ? new Date(Math.max(...dates)) : null,
    },
  })

  // C2 wiring: deterministic matching (zero AI, cheap) runs right after import
  const { runMatchingForImport } = await import('./bank-matching')
  await runMatchingForImport({ officeId: params.officeId, importId: pending.id })

  return { ok: true, report }
}
