import { FileExportTarget } from './FileExportTarget'
import { ToconlineExportTarget } from './ToconlineExportTarget'
import type { ExportTarget, ExportTargetKind } from './ExportTarget'

/** The only place that branches on the target kind (EmailProvider precedent). */
export function createExportTarget(kind: ExportTargetKind): ExportTarget {
  switch (kind) {
    case 'FILE':
      return new FileExportTarget()
    case 'TOCONLINE':
      return new ToconlineExportTarget()
  }
}

export type {
  ExportTarget,
  ExportTargetKind,
  ExportTargetRequest,
  ExportTargetResult,
  ExportTargetItemResult,
  FileExportRequest,
  ToconlineExportRequest,
} from './ExportTarget'
export { FileExportTarget } from './FileExportTarget'
export { ToconlineExportTarget } from './ToconlineExportTarget'
