/**
 * ExportTarget — the destination abstraction the spec reserved for accounting
 * software integrations (SPEC_GABIFY_V2 §7). Two implementations:
 *
 * - FileExportTarget: the existing ZIP/CSV/XLSX export (S3.3), delegated
 *   unchanged to export-service.runExport — zero behaviour change.
 * - ToconlineExportTarget: pushes validated received invoices to TOConline
 *   (doc-driven v1, NOT tested against the real API — INTEGRATION_NOTES.md).
 *
 * Each target consumes its own request shape (a period export and a document
 * push are genuinely different operations), discriminated by `kind` so
 * callers go through one factory and business code never imports a concrete
 * target directly (same philosophy as EmailProvider).
 */

export type ExportTargetKind = 'FILE' | 'TOCONLINE'

export interface FileExportRequest {
  kind: 'FILE'
  officeId: string
  userId: string
  clientIds?: string[]
  periodFrom: string // 'YYYY-MM'
  periodTo: string // 'YYYY-MM'
  includeExported?: boolean
}

export interface ToconlineExportRequest {
  kind: 'TOCONLINE'
  officeId: string
  userId: string
  documentIds: string[]
}

export type ExportTargetRequest = FileExportRequest | ToconlineExportRequest

export interface ExportTargetItemResult {
  documentId: string
  ok: boolean
  detail?: string
}

export type ExportTargetResult =
  | { ok: true; kind: 'FILE'; batchId: string; documentCount: number }
  | { ok: true; kind: 'TOCONLINE'; items: ExportTargetItemResult[] }
  | { ok: false; kind: ExportTargetKind; error: string }

export interface ExportTarget {
  readonly kind: ExportTargetKind
  run(request: ExportTargetRequest): Promise<ExportTargetResult>
}
