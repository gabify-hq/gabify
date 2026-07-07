import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import { getExportQueue, DEFAULT_JOB_OPTIONS } from '@/lib/redis'

const exportSchema = z.object({
  clientIds: z.array(z.string()).optional(),
  periodFrom: z.string().regex(/^\d{4}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}$/),
  includeExported: z.boolean().default(false),
})

/**
 * Enqueues an export job (audit F1.3) — the engine runs in the worker, never
 * inside the request (a 500-document ZIP would blow the HTTP timeout/memory).
 * The history (GET below) shows the batch as soon as the engine starts it.
 */
export async function POST(request: NextRequest) {
  const gate = await guard('export:run', { denyStatus: 403 })
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = exportSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
  }

  const job = await getExportQueue().add(
    'run-export',
    {
      officeId: gate.user.officeId,
      userId: gate.user.id,
      clientIds: parsed.data.clientIds,
      periodFrom: parsed.data.periodFrom,
      periodTo: parsed.data.periodTo,
      includeExported: parsed.data.includeExported,
    },
    DEFAULT_JOB_OPTIONS,
  )

  return NextResponse.json(
    { success: true, data: { queued: true, jobId: (job as { id?: string })?.id ?? null } },
    { status: 202 },
  )
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

/** Export history — who/when/filters (S3.3). */
export async function GET(request: NextRequest) {
  const gate = await guard('document:read')
  if (!gate.ok) return gate.response

  const params = request.nextUrl.searchParams
  const take = Math.min(Math.max(Number(params.get('limit')) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  const cursor = params.get('cursor')

  const batches = await prisma.exportBatch.findMany({
    where: { officeId: gate.user.officeId },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      filters: true,
      documentCount: true,
      createdByUserId: true,
      createdAt: true,
    },
  })
  const hasMore = batches.length > take
  const items = hasMore ? batches.slice(0, take) : batches
  return NextResponse.json({
    success: true,
    data: { items, nextCursor: hasMore ? items[items.length - 1].id : null },
  })
}
