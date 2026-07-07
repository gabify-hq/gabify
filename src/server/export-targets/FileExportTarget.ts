import { runExport } from '@/server/services/export-service'
import type { ExportTarget, ExportTargetRequest, ExportTargetResult } from './ExportTarget'

/**
 * File destination (S3.3): ZIP with Cliente/Ano/Mês/Tipo + lancamentos.csv +
 * resumo_iva.csv + .xlsx. Thin delegation to the existing runExport — the
 * current export flow is unchanged; this adapter only gives it the
 * ExportTarget shape reserved by the spec.
 */
export class FileExportTarget implements ExportTarget {
  readonly kind = 'FILE' as const

  async run(request: ExportTargetRequest): Promise<ExportTargetResult> {
    if (request.kind !== 'FILE') {
      return { ok: false, kind: 'FILE', error: 'FileExportTarget only handles FILE requests' }
    }
    const result = await runExport({
      officeId: request.officeId,
      userId: request.userId,
      clientIds: request.clientIds,
      periodFrom: request.periodFrom,
      periodTo: request.periodTo,
      includeExported: request.includeExported,
    })
    if (!result.ok) {
      return { ok: false, kind: 'FILE', error: result.error }
    }
    return {
      ok: true,
      kind: 'FILE',
      batchId: result.batchId,
      documentCount: result.documentCount,
    }
  }
}
