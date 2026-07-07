import { pushDocumentToToconline, type ToconlinePushDeps } from '@/server/toconline/toconline-push-service'
import type {
  ExportTarget,
  ExportTargetItemResult,
  ExportTargetRequest,
  ExportTargetResult,
} from './ExportTarget'

/**
 * TOConline destination (integration v1 — doc-driven, NOT tested against the
 * real API; INTEGRATION_NOTES.md). Pushes each document through the
 * toconline-push flow: supplier resolution with EntityMap cache, documented
 * idempotency filter, dry-run previews when the connection is in dry-run.
 */
export class ToconlineExportTarget implements ExportTarget {
  readonly kind = 'TOCONLINE' as const

  constructor(private readonly deps: ToconlinePushDeps = {}) {}

  async run(request: ExportTargetRequest): Promise<ExportTargetResult> {
    if (request.kind !== 'TOCONLINE') {
      return { ok: false, kind: 'TOCONLINE', error: 'ToconlineExportTarget only handles TOCONLINE requests' }
    }
    const items: ExportTargetItemResult[] = []
    for (const documentId of request.documentIds) {
      const outcome = await pushDocumentToToconline(
        { documentId, officeId: request.officeId, userId: request.userId },
        this.deps,
      )
      items.push({
        documentId,
        ok: outcome.ok,
        detail: outcome.ok
          ? outcome.mode === 'DRY_RUN'
            ? 'dry-run preview'
            : outcome.warning
          : outcome.error,
      })
    }
    return { ok: true, kind: 'TOCONLINE', items }
  }
}
