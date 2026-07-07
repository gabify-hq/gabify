import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { guard } from '@/server/authz/guard'
import type { DocumentStatus, Prisma } from '@prisma/client'

/**
 * GET /api/documents (S5.2) — filterable document listing.
 * All filters combine with AND; office-scoped; cursor pagination
 * (default 50, max 200) like every other list route.
 */

const DOCUMENT_STATUSES = [
  'PENDING_CLASSIFICATION', 'CLASSIFIED', 'NEEDS_REVIEW', 'REVIEWED',
  'PRE_VALIDATED', 'VALIDATED', 'EXPORTED', 'SPLIT', 'ERROR',
] as const

const querySchema = z.object({
  status: z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()).filter((s) => s !== ''))
    .pipe(z.array(z.enum(DOCUMENT_STATUSES)).min(1))
    .optional(),
  clientId: z.string().min(1).optional(),
  flag: z.string().min(1).max(64).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().min(1).max(200).optional(),
  rootOnly: z.enum(['1', 'true']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
})

export async function GET(request: NextRequest) {
  const gate = await guard('document:read')
  if (!gate.ok) return gate.response

  const raw = Object.fromEntries(
    [...request.nextUrl.searchParams.entries()].filter(([, v]) => v !== ''),
  )
  const parsed = querySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Filtros inválidos' }, { status: 422 })
  }
  const { status, clientId, flag, from, to, q, rootOnly, limit, cursor } = parsed.data

  const where: Prisma.DocumentWhereInput = {
    officeId: gate.user.officeId,
    deletedAt: null,
    ...(status ? { status: { in: status as DocumentStatus[] } } : {}),
    ...(clientId ? { clientId } : {}),
    ...(flag ? { flags: { has: flag } } : {}),
    ...(rootOnly ? { parentDocumentId: null } : {}),
    ...(from || to
      ? {
          issueDate: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { supplierName: { contains: q, mode: 'insensitive' } },
            { documentNumber: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        version: true,
        status: true,
        type: true,
        confidence: true,
        supplierName: true,
        supplierNif: true,
        documentNumber: true,
        issueDate: true,
        totalAmount: true,
        currency: true,
        flags: true,
        originalFilename: true,
        clientId: true,
        createdAt: true,
        client: { select: { name: true } },
        attachment: { select: { filename: true } },
      },
    }),
    prisma.document.count({ where }),
  ])

  const hasMore = documents.length > limit
  const page = hasMore ? documents.slice(0, limit) : documents
  const items = page.map((d) => ({
    id: d.id,
    version: d.version,
    status: d.status,
    type: d.type,
    confidence: d.confidence,
    supplierName: d.supplierName,
    supplierNif: d.supplierNif,
    documentNumber: d.documentNumber,
    issueDate: d.issueDate ? d.issueDate.toISOString().slice(0, 10) : null,
    // Money stays a decimal string — never a JS float (A1)
    totalAmount: d.totalAmount !== null ? String(d.totalAmount) : null,
    currency: d.currency,
    flags: d.flags,
    filename: d.originalFilename ?? d.attachment?.filename ?? d.id,
    clientId: d.clientId,
    clientName: d.client?.name ?? null,
    createdAt: d.createdAt.toISOString(),
  }))

  return NextResponse.json({
    success: true,
    data: {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      total,
    },
  })
}
