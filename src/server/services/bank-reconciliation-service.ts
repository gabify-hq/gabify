import { prisma } from '@/lib/prisma'
import { can } from '@/server/authz/can'
import { centsFromDecimalString } from '@/lib/money'
import { validateReconciliationTotals } from './bank-matching'
import type { UserRole } from '@prisma/client'

/**
 * Reconciliation actions (fase C3). Optimistic locking on the transaction
 * (version + conditional status transition, A7 pattern) — losers get 409.
 * Everything (claim, entry, document linkage, suggestion statuses, AuditLog)
 * commits atomically; the AuditLog row exists iff the action happened.
 * Documents are marked via reconciledEntryId — their state machine is never
 * touched. Undo reverts both sides and is audited.
 */

export type ReconcileResult =
  | { ok: true; status: 'RECONCILED' | 'IGNORED' | 'UNRECONCILED'; version: number }
  | {
      ok: false
      httpStatus: 400 | 404 | 409 | 422
      error: string
      details?: Record<string, string>
    }

class ReconcileConflict extends Error {}

export async function reconcileTransaction(params: {
  officeId: string
  userId: string
  role: UserRole
  transactionId: string
  expectedVersion: number
  documentIds?: string[]
  ignore?: boolean
  reason?: string
}): Promise<ReconcileResult> {
  if (!can(params.role, 'bank:reconcile')) {
    return { ok: false, httpStatus: 404, error: 'Não encontrado' }
  }

  const tx = await prisma.bankTransaction.findFirst({
    where: { id: params.transactionId, officeId: params.officeId },
    include: { office: { select: { reconciliationToleranceCents: true } } },
  })
  if (!tx) return { ok: false, httpStatus: 404, error: 'Transação não encontrada' }

  const ignore = params.ignore === true
  const documentIds = [...new Set(params.documentIds ?? [])]

  if (ignore) {
    if (!params.reason || params.reason.trim() === '') {
      return { ok: false, httpStatus: 400, error: 'Motivo obrigatório para ignorar' }
    }
  } else if (documentIds.length === 0) {
    return { ok: false, httpStatus: 400, error: 'Indique documentos ou ignore com motivo' }
  }

  let totalsCents: number[] = []
  if (!ignore) {
    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds }, officeId: params.officeId, deletedAt: null },
      select: { id: true, status: true, totalAmount: true, reconciledEntryId: true },
    })
    if (documents.length !== documentIds.length) {
      return { ok: false, httpStatus: 404, error: 'Documento não encontrado' }
    }
    const fieldErrors: Record<string, string> = {}
    for (const doc of documents) {
      if (doc.status !== 'VALIDATED' && doc.status !== 'EXPORTED') {
        fieldErrors[doc.id] = 'Documento não validado — só documentos validados/exportados conciliam'
      } else if (doc.reconciledEntryId !== null) {
        fieldErrors[doc.id] = 'Documento já conciliado'
      } else if (doc.totalAmount === null) {
        fieldErrors[doc.id] = 'Documento sem total'
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      const alreadyReconciled = Object.values(fieldErrors).some((m) => m.includes('já conciliado'))
      return {
        ok: false,
        httpStatus: alreadyReconciled ? 409 : 422,
        error: 'Documentos não elegíveis',
        details: fieldErrors,
      }
    }

    totalsCents = documents.map((d) => centsFromDecimalString(String(d.totalAmount)))
    const totals = validateReconciliationTotals({
      transactionAmountCents: tx.amountCents,
      documentTotalsCents: totalsCents,
      toleranceCents: tx.office.reconciliationToleranceCents,
    })
    if (!totals.ok) {
      return {
        ok: false,
        httpStatus: 422,
        error: `A soma dos documentos não corresponde ao movimento (desvio ${totals.deltaCents} cêntimos)`,
      }
    }
  }

  const targetStatus = ignore ? ('IGNORED' as const) : ('RECONCILED' as const)
  try {
    await prisma.$transaction(async (db) => {
      const claimed = await db.bankTransaction.updateMany({
        where: {
          id: tx.id,
          officeId: params.officeId,
          version: params.expectedVersion,
          status: { in: ['UNRECONCILED', 'SUGGESTED'] },
        },
        data: { status: targetStatus, version: { increment: 1 } },
      })
      if (claimed.count === 0) throw new ReconcileConflict()

      const entry = await db.reconciliationEntry.create({
        data: {
          officeId: params.officeId,
          bankTransactionId: tx.id,
          documentIds,
          ignored: ignore,
          ignoreReason: ignore ? params.reason!.trim() : null,
          reconciledByUserId: params.userId,
        },
      })

      if (!ignore) {
        const linked = await db.document.updateMany({
          where: { id: { in: documentIds }, officeId: params.officeId, reconciledEntryId: null },
          data: { reconciledEntryId: entry.id },
        })
        // A concurrent reconcile grabbed one of the documents — roll everything back
        if (linked.count !== documentIds.length) throw new ReconcileConflict()

        await db.reconciliationSuggestion.updateMany({
          where: { bankTransactionId: tx.id, documentId: { in: documentIds } },
          data: { status: 'ACCEPTED' },
        })
        await db.reconciliationSuggestion.updateMany({
          where: { bankTransactionId: tx.id, documentId: { notIn: documentIds } },
          data: { status: 'REJECTED' },
        })
      }

      await db.auditLog.create({
        data: {
          officeId: params.officeId,
          userId: params.userId,
          action: ignore ? 'BANK_TRANSACTION_IGNORED' : 'BANK_TRANSACTION_RECONCILED',
          entityType: 'BankTransaction',
          entityId: tx.id,
          approvedById: params.userId,
          approvedAt: new Date(),
          metadata: {
            entryId: entry.id,
            documentIds,
            ...(ignore ? { reason: params.reason!.trim() } : { totalsCents }),
          },
        },
      })
    })
  } catch (error) {
    if (error instanceof ReconcileConflict) {
      const fresh = await prisma.bankTransaction.findUnique({
        where: { id: tx.id },
        select: { status: true },
      })
      return {
        ok: false,
        httpStatus: 409,
        error: 'Transação atualizada por outro utilizador ou já conciliada',
        details: fresh ? { currentStatus: fresh.status } : undefined,
      }
    }
    throw error
  }

  const updated = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx.id } })
  return { ok: true, status: targetStatus, version: updated.version }
}

export async function unreconcileTransaction(params: {
  officeId: string
  userId: string
  role: UserRole
  transactionId: string
}): Promise<ReconcileResult> {
  if (!can(params.role, 'bank:reconcile')) {
    return { ok: false, httpStatus: 404, error: 'Não encontrado' }
  }

  const tx = await prisma.bankTransaction.findFirst({
    where: { id: params.transactionId, officeId: params.officeId },
    include: { entry: true },
  })
  if (!tx) return { ok: false, httpStatus: 404, error: 'Transação não encontrada' }
  if (!tx.entry) {
    return { ok: false, httpStatus: 409, error: 'Transação não está conciliada nem ignorada' }
  }
  const entry = tx.entry

  try {
    await prisma.$transaction(async (db) => {
      const reverted = await db.bankTransaction.updateMany({
        where: {
          id: tx.id,
          officeId: params.officeId,
          status: { in: ['RECONCILED', 'IGNORED'] },
        },
        data: { status: 'UNRECONCILED', version: { increment: 1 } },
      })
      if (reverted.count === 0) throw new ReconcileConflict()

      await db.document.updateMany({
        where: { reconciledEntryId: entry.id },
        data: { reconciledEntryId: null },
      })
      await db.reconciliationSuggestion.updateMany({
        where: { bankTransactionId: tx.id, status: { in: ['ACCEPTED', 'REJECTED'] } },
        data: { status: 'PENDING' },
      })
      await db.reconciliationEntry.delete({ where: { id: entry.id } })

      await db.auditLog.create({
        data: {
          officeId: params.officeId,
          userId: params.userId,
          action: 'BANK_TRANSACTION_UNRECONCILED',
          entityType: 'BankTransaction',
          entityId: tx.id,
          metadata: {
            entryId: entry.id,
            documentIds: entry.documentIds,
            wasIgnored: entry.ignored,
            ignoreReason: entry.ignoreReason,
          },
        },
      })
    })
  } catch (error) {
    if (error instanceof ReconcileConflict) {
      return { ok: false, httpStatus: 409, error: 'Transação já revertida' }
    }
    throw error
  }

  const updated = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx.id } })
  return { ok: true, status: 'UNRECONCILED', version: updated.version }
}
