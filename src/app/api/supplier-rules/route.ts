import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import { createSupplierRule } from '@/server/services/supplier-rule-service'

const createRuleSchema = z.object({
  supplierNif: z.string().regex(/^\d{9}$/),
  clientId: z.string().nullish(),
  defaultDocumentType: z.string().nullish(),
  defaultAccountCode: z.string().nullish(),
  defaultVatTreatment: z.string().nullish(),
  autoValidate: z.boolean().default(false),
  createdFromReviewId: z.string().nullish(),
})

/** Rules are created by explicit human action only (S3.2). */
export async function POST(request: NextRequest) {
  const gate = await guard('document:review')
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = createRuleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 422 })
  }

  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, officeId: gate.user.officeId, deletedAt: null },
      select: { id: true },
    })
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  const rule = await createSupplierRule({
    officeId: gate.user.officeId,
    supplierNif: parsed.data.supplierNif,
    clientId: parsed.data.clientId,
    defaultDocumentType: parsed.data.defaultDocumentType as never,
    defaultAccountCode: parsed.data.defaultAccountCode,
    defaultVatTreatment: parsed.data.defaultVatTreatment,
    autoValidate: parsed.data.autoValidate,
    createdFromReviewId: parsed.data.createdFromReviewId,
    createdByUserId: gate.user.id,
  })
  return NextResponse.json({ success: true, data: rule }, { status: 201 })
}

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

export async function GET(request: NextRequest) {
  const gate = await guard('document:read')
  if (!gate.ok) return gate.response

  const params = request.nextUrl.searchParams
  const take = Math.min(Math.max(Number(params.get('limit')) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  const cursor = params.get('cursor')

  const rules = await prisma.supplierRule.findMany({
    where: { officeId: gate.user.officeId, active: true },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  const hasMore = rules.length > take
  const items = hasMore ? rules.slice(0, take) : rules
  return NextResponse.json({
    success: true,
    data: { items, nextCursor: hasMore ? items[items.length - 1].id : null },
  })
}
