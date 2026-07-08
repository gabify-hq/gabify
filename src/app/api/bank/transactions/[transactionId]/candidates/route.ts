import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'

const MAX_CANDIDATES = 20

/**
 * GET /api/bank/transactions/[transactionId]/candidates?q= (audit F3.10).
 * Manual-reconciliation search: VALIDATED/EXPORTED, unreconciled documents of
 * the transaction's account CLIENT, matched by document number or supplier
 * name. The reconcile endpoint keeps the sum validation — this only finds.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  const gate = await guard('bank:read')
  if (!gate.ok) return gate.response

  const { transactionId } = await params
  const tx = await prisma.bankTransaction.findFirst({
    where: { id: transactionId, officeId: gate.user.officeId },
    select: { id: true, bankAccount: { select: { clientId: true } } },
  })
  if (!tx) {
    return NextResponse.json({ error: 'Transação não encontrada' }, { status: 404 })
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()

  const documents = await prisma.document.findMany({
    where: {
      officeId: gate.user.officeId,
      clientId: tx.bankAccount.clientId,
      deletedAt: null,
      status: { in: ['VALIDATED', 'EXPORTED'] },
      reconciledEntryId: null,
      ...(q !== ''
        ? {
            OR: [
              { documentNumber: { contains: q, mode: 'insensitive' } },
              { supplierName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { issueDate: 'desc' },
    take: MAX_CANDIDATES,
    select: {
      id: true,
      documentNumber: true,
      supplierName: true,
      issueDate: true,
      totalAmount: true,
    },
  })

  return NextResponse.json({
    success: true,
    data: {
      items: documents.map((doc) => ({
        id: doc.id,
        documentNumber: doc.documentNumber,
        supplierName: doc.supplierName,
        issueDate: doc.issueDate ? doc.issueDate.toISOString().slice(0, 10) : null,
        totalAmount: doc.totalAmount ? String(doc.totalAmount) : null,
      })),
    },
  })
}
