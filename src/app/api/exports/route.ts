import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import { runExport } from '@/server/services/export-service'

const exportSchema = z.object({
  clientIds: z.array(z.string()).optional(),
  periodFrom: z.string().regex(/^\d{4}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}$/),
  includeExported: z.boolean().default(false),
})

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

  const result = await runExport({
    officeId: gate.user.officeId,
    userId: gate.user.id,
    clientIds: parsed.data.clientIds,
    periodFrom: parsed.data.periodFrom,
    periodTo: parsed.data.periodTo,
    includeExported: parsed.data.includeExported,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }
  return NextResponse.json(
    { success: true, data: { batchId: result.batchId, documentCount: result.documentCount } },
    { status: 201 },
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
