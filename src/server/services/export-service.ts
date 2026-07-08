import AdmZip from 'adm-zip'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { uploadToR2, downloadFromR2, getSignedDownloadUrl } from '@/lib/r2'
import { formatDatePt, periodInAppTz } from '@/lib/timezone'
import { buildExportAccount } from './snc-service'
import type { Document, Prisma } from '@prisma/client'

/**
 * File export (S3.3 + A9 + A1): ZIP with Cliente/Ano/Mês/Tipo structure,
 * lancamentos.csv (pt-PT: ';' separator, decimal comma, UTF-8 BOM, one line
 * per VAT band), resumo_iva.csv and a native-numeric .xlsx. All arithmetic in
 * integer cents. Documents transition to EXPORTED; ExportDocument keeps N:M
 * traceability so re-exports are auditable.
 */

const CSV_BASE_COLUMNS = [
  'data', 'tipo_documento', 'numero', 'fornecedor', 'nif_fornecedor', 'cliente',
  'conta_sugerida', 'descricao',
] as const
const CSV_PT_BAND_COLUMNS = [
  'base_isenta', 'base_6', 'iva_6', 'base_13', 'iva_13', 'base_23', 'iva_23',
] as const
const CSV_TAIL_COLUMNS = ['retencao', 'total', 'moeda', 'ficheiro'] as const

/** Continental rates with fixed columns; every other (region, rate) pair gets dynamic columns. */
const PT_FIXED_RATES = new Set([0, 6, 13, 23])

interface VatBand {
  region?: string
  rate: number
  baseCents: number
  vatCents: number
}

function ptMoney(cents: number): string {
  const euros = Math.trunc(Math.abs(cents) / 100)
  const rest = String(Math.abs(cents) % 100).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}${euros},${rest}`
}

/** RFC 4180 escaping (audit F3.11 — A-1): `;`, `"` or newlines force quoting. */
function csvField(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Column suffix for a non-continental band: PT-AC 16 → "ac_16". */
function bandColumnKey(band: VatBand): string {
  const region = (band.region ?? 'PT').toLowerCase().replace(/^pt-?/, '') || 'pt'
  return `${region}_${band.rate}`
}

function isFixedPtBand(band: VatBand): boolean {
  return (band.region ?? 'PT') === 'PT' && PT_FIXED_RATES.has(band.rate)
}

function centsOfDecimal(value: Prisma.Decimal | null): number {
  if (value === null) return 0
  return Math.round(Number(value) * 100)
}

const TYPE_FOLDER: Record<string, string> = {
  INVOICE_RECEIVED: 'Recebidas',
  INVOICE_RECEIPT: 'Recebidas',
  RECEIPT: 'Recebidas',
  INVOICE_ISSUED: 'Emitidas',
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
}

export type ExportResult =
  | { ok: true; batchId: string; r2Key: string; documentCount: number }
  | { ok: false; httpStatus: 404 | 422 | 500; error: string }

export async function runExport(params: {
  officeId: string
  userId: string
  clientIds?: string[]
  periodFrom: string // 'YYYY-MM'
  periodTo: string   // 'YYYY-MM'
  includeExported?: boolean
}): Promise<ExportResult> {
  const from = new Date(`${params.periodFrom}-01T00:00:00Z`)
  const [toYear, toMonth] = params.periodTo.split('-').map(Number)
  const to = new Date(Date.UTC(toYear, toMonth, 1)) // first day AFTER the period
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return { ok: false, httpStatus: 422, error: 'Período inválido (YYYY-MM)' }
  }

  // Client filter is office-scoped by construction — foreign ids match nothing
  const statusFilter = params.includeExported
    ? { in: ['VALIDATED', 'EXPORTED'] as const }
    : ('VALIDATED' as const)

  const documents = await prisma.document.findMany({
    where: {
      officeId: params.officeId,
      deletedAt: null,
      status: statusFilter as never,
      issueDate: { gte: from, lt: to },
      ...(params.clientIds && params.clientIds.length > 0
        ? { clientId: { in: params.clientIds }, client: { officeId: params.officeId } }
        : {}),
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { issueDate: 'asc' },
  })

  const batch = await prisma.exportBatch.create({
    data: {
      officeId: params.officeId,
      createdByUserId: params.userId,
      filters: {
        clientIds: params.clientIds ?? null,
        periodFrom: params.periodFrom,
        periodTo: params.periodTo,
        includeExported: params.includeExported ?? false,
      },
      documentCount: documents.length,
    },
  })

  const zip = new AdmZip()

  // Dynamic columns for regional bands (Açores/Madeira — audit F3.11/A-2):
  // money NEVER silently drops out of lancamentos.csv
  const dynamicKeys = new Set<string>()
  for (const doc of documents) {
    for (const band of ((doc.vatBreakdown as unknown as VatBand[] | null) ?? [])) {
      if (!isFixedPtBand(band)) dynamicKeys.add(bandColumnKey(band))
    }
  }
  const dynamicColumns = [...dynamicKeys].sort().flatMap((key) => [`base_${key}`, `iva_${key}`])

  const csvHeader = [
    ...CSV_BASE_COLUMNS,
    ...CSV_PT_BAND_COLUMNS,
    ...dynamicColumns,
    ...CSV_TAIL_COLUMNS,
  ].join(';')
  const csvLines: string[] = [
    '# formato: pt-PT; separador ;; decimal ,',
    csvHeader,
  ]
  const xlsxRows: Array<Record<string, string | number>> = []
  const vatTotals = new Map<string, { region: string; rate: number; baseCents: number; vatCents: number }>()

  for (const doc of documents) {
    const clientName = doc.client?.name ?? 'Sem cliente'
    const { year, month } = doc.issueDate ? periodInAppTz(doc.issueDate) : { year: 0, month: 0 }
    const folder = TYPE_FOLDER[doc.type] ?? 'Outros'
    const baseName = sanitize(`${doc.documentNumber ?? doc.id}-${doc.supplierNif ?? 'sem-nif'}`)
    const zipPath = `${sanitize(clientName)}/${year}/${String(month).padStart(2, '0')}/${folder}/${baseName}.pdf`

    if (doc.r2Key) {
      try {
        const fileBuffer = await downloadFromR2(doc.r2Key)
        zip.addFile(zipPath, fileBuffer)
      } catch (error) {
        console.warn(`[export] failed to fetch ${doc.r2Key}:`, error)
      }
    }

    const account = await buildExportAccount({
      clientId: doc.clientId,
      accountCode: doc.accountCode ?? doc.suggestedAccountCode,
    })
    const bands = (doc.vatBreakdown as unknown as VatBand[] | null) ?? []
    const withholdingCents = centsOfDecimal(doc.withholdingAmount)
    const totalCents = centsOfDecimal(doc.totalAmount)
    const dataStr = doc.issueDate ? formatDatePt(doc.issueDate) : ''

    const emit = (band: VatBand | null, isLast: boolean) => {
      const isFixed = band !== null && isFixedPtBand(band)
      const fixedCols = {
        base_isenta: isFixed && band!.rate === 0 ? band!.baseCents : 0,
        base_6: isFixed && band!.rate === 6 ? band!.baseCents : 0,
        iva_6: isFixed && band!.rate === 6 ? band!.vatCents : 0,
        base_13: isFixed && band!.rate === 13 ? band!.baseCents : 0,
        iva_13: isFixed && band!.rate === 13 ? band!.vatCents : 0,
        base_23: isFixed && band!.rate === 23 ? band!.baseCents : 0,
        iva_23: isFixed && band!.rate === 23 ? band!.vatCents : 0,
      }
      // Regional bands land in their own columns — never silently zeroed (A-2)
      const dynamicCols = new Map<string, number>()
      if (band !== null && !isFixed) {
        const key = bandColumnKey(band)
        dynamicCols.set(`base_${key}`, band.baseCents)
        dynamicCols.set(`iva_${key}`, band.vatCents)
      }

      const line = [
        csvField(dataStr),
        csvField(doc.type),
        csvField(doc.documentNumber ?? ''),
        csvField(doc.supplierName ?? ''),
        csvField(doc.supplierNif ?? ''),
        csvField(clientName),
        csvField(account),
        csvField(doc.reasoning ?? ''),
        ptMoney(fixedCols.base_isenta),
        ptMoney(fixedCols.base_6),
        ptMoney(fixedCols.iva_6),
        ptMoney(fixedCols.base_13),
        ptMoney(fixedCols.iva_13),
        ptMoney(fixedCols.base_23),
        ptMoney(fixedCols.iva_23),
        ...dynamicColumns.map((col) => ptMoney(dynamicCols.get(col) ?? 0)),
        ptMoney(isLast ? withholdingCents : 0),
        ptMoney(isLast ? totalCents : 0),
        csvField(doc.currency),
        csvField(zipPath),
      ].join(';')
      csvLines.push(line)
      xlsxRows.push({
        data: dataStr,
        tipo_documento: doc.type,
        numero: doc.documentNumber ?? '',
        fornecedor: doc.supplierName ?? '',
        nif_fornecedor: doc.supplierNif ?? '',
        cliente: clientName,
        conta_sugerida: account,
        base_isenta: fixedCols.base_isenta / 100,
        base_6: fixedCols.base_6 / 100,
        iva_6: fixedCols.iva_6 / 100,
        base_13: fixedCols.base_13 / 100,
        iva_13: fixedCols.iva_13 / 100,
        base_23: fixedCols.base_23 / 100,
        iva_23: fixedCols.iva_23 / 100,
        ...Object.fromEntries(
          dynamicColumns.map((col) => [col, (dynamicCols.get(col) ?? 0) / 100]),
        ),
        retencao: (isLast ? withholdingCents : 0) / 100,
        total: (isLast ? totalCents : 0) / 100,
        moeda: doc.currency,
        ficheiro: zipPath,
      })
    }

    if (bands.length === 0) {
      emit(null, true)
    } else {
      // One CSV line per VAT band (A9/AC-6.2.a); withholding/total on the last
      bands.forEach((band, i) => emit(band, i === bands.length - 1))
      for (const band of bands) {
        const region = band.region ?? 'PT'
        const key = `${region}|${band.rate}`
        const agg = vatTotals.get(key) ?? { region, rate: band.rate, baseCents: 0, vatCents: 0 }
        agg.baseCents += band.baseCents
        agg.vatCents += band.vatCents
        vatTotals.set(key, agg)
      }
    }
  }

  // resumo_iva.csv — sums per (region, rate), computed in integer cents (A1)
  const resumoLines = ['# formato: pt-PT; separador ;; decimal ,', 'regiao;taxa;base;iva']
  const sortedTotals = [...vatTotals.values()].sort(
    (a, b) => a.region.localeCompare(b.region) || a.rate - b.rate,
  )
  for (const agg of sortedTotals) {
    resumoLines.push(`${agg.region};${agg.rate};${ptMoney(agg.baseCents)};${ptMoney(agg.vatCents)}`)
  }

  const BOM = Buffer.from([0xef, 0xbb, 0xbf])
  zip.addFile('lancamentos.csv', Buffer.concat([BOM, Buffer.from(csvLines.join('\n'), 'utf-8')]))
  zip.addFile('resumo_iva.csv', Buffer.concat([BOM, Buffer.from(resumoLines.join('\n'), 'utf-8')]))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(xlsxRows), 'Lancamentos')
  const xlsxBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  zip.addFile('lancamentos.xlsx', xlsxBuffer)

  const r2Key = `${params.officeId}/exports/${batch.id}.zip`
  await uploadToR2(r2Key, zip.toBuffer(), 'application/zip')

  // Mark documents EXPORTED (only fresh ones change state — A9) + N:M links
  const freshIds = documents.filter((d) => d.status === 'VALIDATED').map((d) => d.id)
  if (freshIds.length > 0) {
    await prisma.document.updateMany({
      where: { id: { in: freshIds } },
      data: { status: 'EXPORTED', exportBatchId: batch.id },
    })
  }
  if (documents.length > 0) {
    await prisma.exportDocument.createMany({
      data: documents.map((d) => ({ exportBatchId: batch.id, documentId: d.id })),
      skipDuplicates: true,
    })
  }

  // AuditLog BEFORE the download URL exists (G5/AC-6.1.d)
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'EXPORT_CREATED',
      entityType: 'ExportBatch',
      entityId: batch.id,
      metadata: {
        documentCount: documents.length,
        periodFrom: params.periodFrom,
        periodTo: params.periodTo,
        includeExported: params.includeExported ?? false,
      },
    },
  })

  await prisma.exportBatch.update({
    where: { id: batch.id },
    data: { status: 'COMPLETED', r2Key },
  })

  return { ok: true, batchId: batch.id, r2Key, documentCount: documents.length }
}

/** Signed URL for the batch ZIP — 15 minutes; every download gets a fresh URL. */
export async function getExportDownloadUrl(params: {
  batchId: string
  officeId: string
}): Promise<string | null> {
  const batch = await prisma.exportBatch.findFirst({
    where: { id: params.batchId, officeId: params.officeId, status: 'COMPLETED' },
    select: { r2Key: true },
  })
  if (!batch?.r2Key) return null
  return getSignedDownloadUrl(batch.r2Key, 900)
}

export type { Document }
