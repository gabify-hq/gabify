/**
 * Generic source pull runner — shared by every document-source connector
 * (Moloni, InvoiceXpress). Given a connector (unified contract) and a
 * per-client context, it walks every page, de-duplicates against the generic
 * `SourceEntityMap`, imports each new issued document as an API_PULL `Document`
 * and records the import in an immutable `AuditLog` — all atomically.
 *
 * Invariants (mirrors the TOConline pull):
 *  - [dedup] a document whose externalId is already in SourceEntityMap
 *    (SALES_DOCUMENT) is a no-op — re-pull imports nothing;
 *  - [no AI] pulled documents are API-exact; the parsing pipeline is NEVER
 *    invoked (this module imports no AI code);
 *  - [cents] amounts are integer cents from the connector; the boundary to
 *    Decimal columns / JSONB lives in buildDocumentFromSource;
 *  - [audit] a Document + its SourceEntityMap row + an AuditLog entry are
 *    written in ONE transaction, so a crash never leaves a half-import.
 *
 * The per-system service owns credentials, token persistence and connection
 * state; this runner is pure orchestration over the contract.
 */
import type { SourceSystem } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { uploadToR2 } from '@/lib/r2'
import type { DocumentSourceConnector, SourceDocument } from './types'
import { buildDocumentFromSource } from './source-document-to-document'

const MAX_PAGES = 500 // hard safety cap

export interface SourcePullContext {
  officeId: string
  clientId: string
  system: SourceSystem
  /** classificationSource tag, e.g. "moloni-pull". */
  classificationSource: string
  /** Audit action, e.g. "MOLONI_PULL". */
  auditAction: string
  userId: string | null
}

export interface SourcePullHooks {
  /**
   * Resolves the buyer (final customer) NIF for a document. Moloni carries it
   * inline; InvoiceXpress resolves it out-of-band with a cache so N documents of
   * the same customer cost ONE API call.
   */
  resolveBuyerNif(doc: SourceDocument): Promise<string | null>
}

export interface SourcePullResult {
  ok: boolean
  imported: number
  skippedKnown: number
  error?: string
}

const NO_NIF: SourcePullHooks = { resolveBuyerNif: async (doc) => doc.customerVat }

export async function runSourcePull(
  connector: DocumentSourceConnector,
  ctx: SourcePullContext,
  hooks: SourcePullHooks = NO_NIF,
): Promise<SourcePullResult> {
  const counts = { imported: 0, skippedKnown: 0 }

  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await connector.listIssuedDocuments(cursor)

    for (const doc of result.items) {
      const known = await prisma.sourceEntityMap.findUnique({
        where: {
          system_entityType_externalId_clientId: {
            system: ctx.system,
            entityType: 'SALES_DOCUMENT',
            externalId: doc.externalId,
            clientId: ctx.clientId,
          },
        },
        select: { id: true },
      })
      if (known) {
        counts.skippedKnown += 1
        continue
      }

      const buyerNif = await hooks.resolveBuyerNif(doc)
      const createData = buildDocumentFromSource(doc, {
        officeId: ctx.officeId,
        clientId: ctx.clientId,
        classificationSource: ctx.classificationSource,
        buyerNif,
      })

      // PDF is best effort — an import without a PDF is still a valid import.
      let r2Key: string | null = null
      if (connector.fetchPdf) {
        try {
          const pdf = await connector.fetchPdf(doc.externalId)
          if (pdf) {
            r2Key = `${ctx.officeId}/${ctx.system.toLowerCase()}-pull/${ctx.clientId}/${doc.externalId}.pdf`
            await uploadToR2(r2Key, pdf, 'application/pdf')
          }
        } catch {
          r2Key = null
        }
      }

      await prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: { ...createData, r2Key, mimeType: r2Key ? 'application/pdf' : null },
          select: { id: true },
        })
        await tx.sourceEntityMap.create({
          data: {
            officeId: ctx.officeId,
            clientId: ctx.clientId,
            system: ctx.system,
            entityType: 'SALES_DOCUMENT',
            externalId: doc.externalId,
            documentId: created.id,
          },
        })
        await tx.auditLog.create({
          data: {
            officeId: ctx.officeId,
            userId: ctx.userId,
            action: ctx.auditAction,
            entityType: 'Document',
            entityId: created.id,
            aiGenerated: false,
            metadata: { externalId: doc.externalId, system: ctx.system },
          },
        })
      })
      counts.imported += 1
    }

    cursor = result.nextCursor ?? undefined
    if (cursor === undefined) break
  }

  return { ok: true, ...counts }
}
