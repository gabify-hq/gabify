import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import { getToconlinePushQueue, DEFAULT_JOB_OPTIONS } from '@/lib/redis'
import { getPushEligibilityError } from '@/server/toconline/toconline-push-service'

/**
 * Queue TOConline pushes for validated received invoices of one client
 * (integration v1 — doc-driven, NOT tested against the real API). Per-item
 * report: ineligible documents are refused with a PT reason, eligible ones are
 * marked PENDING and enqueued on the async `toconline-push` job (one job per
 * document — the processor is idempotent).
 */

const bodySchema = z.object({
  clientId: z.string().min(1),
  documentIds: z.array(z.string().min(1)).min(1).max(50),
})

export async function POST(request: NextRequest) {
  const gate = await guard('toconline:manage')
  if (!gate.ok) return gate.response

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Dados inválidos',
        details: Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.') || 'body', i.message]),
        ),
      },
      { status: 422 },
    )
  }
  const { clientId, documentIds } = parsed.data

  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId: gate.user.officeId, deletedAt: null },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const connection = await prisma.toconlineConnection.findFirst({
    where: { officeId: gate.user.officeId, clientId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, dryRun: true, pushEnabled: true },
  })
  if (!connection) {
    return NextResponse.json(
      { error: 'O cliente não tem ligação TOConline configurada' },
      { status: 422 },
    )
  }
  if (connection.status === 'DISABLED') {
    return NextResponse.json(
      { error: 'A ligação TOConline deste cliente está desligada' },
      { status: 422 },
    )
  }
  if (!connection.pushEnabled) {
    return NextResponse.json(
      { error: 'O envio (push) está desligado nesta ligação — ative-o primeiro' },
      { status: 422 },
    )
  }

  const documents = await prisma.document.findMany({
    where: {
      id: { in: documentIds },
      officeId: gate.user.officeId,
      clientId,
      deletedAt: null,
    },
  })
  const byId = new Map(documents.map((d) => [d.id, d]))

  const items: Array<{ documentId: string; queued: boolean; error?: string }> = []
  const toQueue: string[] = []
  for (const documentId of documentIds) {
    const doc = byId.get(documentId)
    if (!doc) {
      // Cross-tenant/foreign ids look exactly like missing ones — never leak
      items.push({ documentId, queued: false, error: 'Documento não encontrado' })
      continue
    }
    if (doc.toconlinePushStatus === 'SENT') {
      items.push({ documentId, queued: false, error: 'Documento já enviado para o TOConline' })
      continue
    }
    const ineligible = getPushEligibilityError(doc)
    if (ineligible) {
      items.push({ documentId, queued: false, error: ineligible })
      continue
    }
    toQueue.push(documentId)
    items.push({ documentId, queued: true })
  }

  if (toQueue.length > 0) {
    await prisma.document.updateMany({
      where: { id: { in: toQueue } },
      data: { toconlinePushStatus: 'PENDING', toconlinePushError: null },
    })
    // Audit the request before the async jobs run (the job itself audits again
    // right before the external POST)
    await prisma.auditLog.create({
      data: {
        officeId: gate.user.officeId,
        userId: gate.user.id,
        action: 'TOCONLINE_PUSH_REQUESTED',
        entityType: 'ToconlineConnection',
        entityId: connection.id,
        metadata: { clientId, documentIds: toQueue, dryRun: connection.dryRun },
      },
    })
    const queue = getToconlinePushQueue()
    for (const documentId of toQueue) {
      await queue.add(
        'toconline-push',
        { documentId, officeId: gate.user.officeId, userId: gate.user.id },
        DEFAULT_JOB_OPTIONS,
      )
    }
  }

  return NextResponse.json({
    success: true,
    data: { items, dryRun: connection.dryRun },
  })
}
