import { z } from 'zod'
import { Prisma, type BankTransactionStatus, type DocumentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Assistant read-only tool catalog (anti text-to-SQL).
 *
 * The LLM NEVER writes SQL or free-form queries: it may only request one of
 * the five read tools below. Every execution is server-side, zod-validated
 * and ALWAYS scoped to the session's officeId — the officeId is injected by
 * the server and any attempt by the model to pass it as a parameter is
 * stripped before validation ([INV]).
 *
 * Architecture invariant (tested): this module contains NO write tool and no
 * Prisma write calls. All aggregation arithmetic happens in SQL over integer
 * cents (A1) — the model presents numbers, it never computes them.
 */

const DOCUMENT_STATUSES = [
  'PENDING_CLASSIFICATION', 'CLASSIFIED', 'NEEDS_REVIEW', 'REVIEWED',
  'PRE_VALIDATED', 'VALIDATED', 'EXPORTED', 'SPLIT', 'ERROR',
] as const

const BANK_TRANSACTION_STATUSES = [
  'UNRECONCILED', 'SUGGESTED', 'RECONCILED', 'IGNORED',
] as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Filters shared by the document-facing tools. */
const documentFiltersShape = {
  clientName: z.string().min(1).max(120).optional()
    .describe('Nome (ou parte do nome) do cliente do gabinete'),
  supplierName: z.string().min(1).max(120).optional()
    .describe('Nome (ou parte do nome) do fornecedor'),
  supplierNif: z.string().regex(/^\d{9}$/).optional()
    .describe('NIF do fornecedor (9 dígitos)'),
  status: z.enum(DOCUMENT_STATUSES).optional()
    .describe('Estado do documento'),
  dateFrom: z.string().regex(ISO_DATE).optional()
    .describe('Data de emissão mínima (YYYY-MM-DD)'),
  dateTo: z.string().regex(ISO_DATE).optional()
    .describe('Data de emissão máxima (YYYY-MM-DD)'),
  amountMinCents: z.number().int().min(0).optional()
    .describe('Total mínimo em cêntimos inteiros (100€ = 10000)'),
  amountMaxCents: z.number().int().min(0).optional()
    .describe('Total máximo em cêntimos inteiros'),
  text: z.string().min(1).max(200).optional()
    .describe('Texto livre — procura em fornecedor e número de documento'),
}

const searchDocumentsSchema = z.object({
  ...documentFiltersShape,
  limit: z.number().int().min(1).max(50).default(20),
}).strict()

const aggregateDocumentsSchema = z.object({
  ...documentFiltersShape,
  groupBy: z.enum(['supplier', 'client', 'vatRate', 'month']).default('supplier')
    .describe('Dimensão de agrupamento'),
  metric: z.enum(['total', 'base', 'vat']).default('total')
    .describe('Métrica somada (sempre em cêntimos inteiros)'),
}).strict()

const findDuplicateSuspectsSchema = z.object({
  clientName: documentFiltersShape.clientName,
  supplierName: documentFiltersShape.supplierName,
  dateFrom: documentFiltersShape.dateFrom,
  dateTo: documentFiltersShape.dateTo,
  limit: z.number().int().min(1).max(50).default(20),
}).strict()

const searchBankTransactionsSchema = z.object({
  accountName: z.string().min(1).max(120).optional()
    .describe('Nome (ou parte do nome) da conta bancária'),
  status: z.enum(BANK_TRANSACTION_STATUSES).optional()
    .describe('Estado de conciliação da transação'),
  dateFrom: z.string().regex(ISO_DATE).optional()
    .describe('Data de movimento mínima (YYYY-MM-DD)'),
  dateTo: z.string().regex(ISO_DATE).optional()
    .describe('Data de movimento máxima (YYYY-MM-DD)'),
  amountMinCents: z.number().int().optional()
    .describe('Montante mínimo em cêntimos COM sinal (débitos negativos)'),
  amountMaxCents: z.number().int().optional()
    .describe('Montante máximo em cêntimos COM sinal'),
  text: z.string().min(1).max(200).optional()
    .describe('Texto livre — procura na descrição do movimento'),
  limit: z.number().int().min(1).max(50).default(20),
}).strict()

const reconciliationSummarySchema = z.object({
  accountName: z.string().min(1).max(120).optional()
    .describe('Nome (ou parte do nome) da conta bancária'),
  dateFrom: z.string().regex(ISO_DATE).optional(),
  dateTo: z.string().regex(ISO_DATE).optional(),
}).strict()

type DocumentFilters = z.infer<typeof searchDocumentsSchema>

function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}
function dayEnd(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`)
}

/** Decimal(14,2) → exact integer cents. Never parseFloat (A1). */
function decimalToCents(value: Prisma.Decimal | null): number | null {
  if (value === null) return null
  return value.mul(100).toNumber()
}

function documentWhere(officeId: string, filters: Partial<DocumentFilters>): Prisma.DocumentWhereInput {
  return {
    officeId,
    deletedAt: null,
    ...(filters.clientName
      ? { client: { name: { contains: filters.clientName, mode: 'insensitive' } } }
      : {}),
    ...(filters.supplierName
      ? { supplierName: { contains: filters.supplierName, mode: 'insensitive' } }
      : {}),
    ...(filters.supplierNif ? { supplierNif: filters.supplierNif } : {}),
    ...(filters.status ? { status: filters.status as DocumentStatus } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          issueDate: {
            ...(filters.dateFrom ? { gte: dayStart(filters.dateFrom) } : {}),
            ...(filters.dateTo ? { lte: dayEnd(filters.dateTo) } : {}),
          },
        }
      : {}),
    ...(filters.amountMinCents !== undefined
      ? { totalAmount: { gte: new Prisma.Decimal(filters.amountMinCents).div(100) } }
      : {}),
    ...(filters.amountMaxCents !== undefined
      ? {
          AND: [
            { totalAmount: { lte: new Prisma.Decimal(filters.amountMaxCents).div(100) } },
          ],
        }
      : {}),
    ...(filters.text
      ? {
          OR: [
            { supplierName: { contains: filters.text, mode: 'insensitive' } },
            { documentNumber: { contains: filters.text, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
}

const documentListSelect = {
  id: true,
  type: true,
  status: true,
  supplierName: true,
  supplierNif: true,
  documentNumber: true,
  issueDate: true,
  dueDate: true,
  totalAmount: true,
  currency: true,
  flags: true,
  clientId: true,
  client: { select: { name: true } },
} satisfies Prisma.DocumentSelect

type DocumentListRow = Prisma.DocumentGetPayload<{ select: typeof documentListSelect }>

function toDocumentItem(d: DocumentListRow) {
  return {
    id: d.id,
    type: d.type,
    status: d.status,
    supplierName: d.supplierName,
    supplierNif: d.supplierNif,
    documentNumber: d.documentNumber,
    issueDate: d.issueDate ? d.issueDate.toISOString().slice(0, 10) : null,
    dueDate: d.dueDate ? d.dueDate.toISOString().slice(0, 10) : null,
    totalCents: decimalToCents(d.totalAmount),
    currency: d.currency,
    flags: d.flags,
    clientId: d.clientId,
    clientName: d.client?.name ?? null,
  }
}

// ── Executors (always officeId-scoped, read-only) ───────────────────────────

async function searchDocuments(officeId: string, input: z.infer<typeof searchDocumentsSchema>) {
  const where = documentWhere(officeId, input)
  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      take: input.limit,
      select: documentListSelect,
    }),
    prisma.document.count({ where }),
  ])
  return { items: documents.map(toDocumentItem), total, limit: input.limit }
}

async function aggregateDocuments(
  officeId: string,
  input: z.infer<typeof aggregateDocumentsSchema>,
) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`d."officeId" = ${officeId}`,
    Prisma.sql`d."deletedAt" IS NULL`,
  ]
  if (input.clientName) {
    conditions.push(Prisma.sql`c."name" ILIKE ${'%' + input.clientName + '%'}`)
  }
  if (input.supplierName) {
    conditions.push(Prisma.sql`d."supplierName" ILIKE ${'%' + input.supplierName + '%'}`)
  }
  if (input.supplierNif) {
    conditions.push(Prisma.sql`d."supplierNif" = ${input.supplierNif}`)
  }
  if (input.status) {
    conditions.push(Prisma.sql`d."status"::text = ${input.status}`)
  }
  if (input.dateFrom) {
    conditions.push(Prisma.sql`d."issueDate" >= ${dayStart(input.dateFrom)}`)
  }
  if (input.dateTo) {
    conditions.push(Prisma.sql`d."issueDate" <= ${dayEnd(input.dateTo)}`)
  }
  if (input.amountMinCents !== undefined) {
    conditions.push(Prisma.sql`ROUND(d."totalAmount" * 100) >= ${input.amountMinCents}`)
  }
  if (input.amountMaxCents !== undefined) {
    conditions.push(Prisma.sql`ROUND(d."totalAmount" * 100) <= ${input.amountMaxCents}`)
  }
  if (input.text) {
    const pattern = '%' + input.text + '%'
    conditions.push(
      Prisma.sql`(d."supplierName" ILIKE ${pattern} OR d."documentNumber" ILIKE ${pattern})`,
    )
  }

  if (input.groupBy === 'vatRate') {
    // Integer-cents SUM straight from the vatBreakdown JSONB (A1) — the
    // arithmetic never leaves PostgreSQL.
    const rows = await prisma.$queryRaw<
      Array<{ key: string; base_cents: bigint; vat_cents: bigint; doc_count: bigint }>
    >(Prisma.sql`
      SELECT
        elem->>'rate' AS key,
        COALESCE(SUM((elem->>'baseCents')::bigint), 0) AS base_cents,
        COALESCE(SUM((elem->>'vatCents')::bigint), 0) AS vat_cents,
        COUNT(DISTINCT d."id") AS doc_count
      FROM "Document" d
      LEFT JOIN "Client" c ON c."id" = d."clientId"
      CROSS JOIN LATERAL jsonb_array_elements(d."vatBreakdown") AS elem
      WHERE ${Prisma.join(conditions, ' AND ')}
        AND jsonb_typeof(d."vatBreakdown") = 'array'
      GROUP BY 1
      ORDER BY 1
    `)
    const groups = rows.map((row) => {
      const base = Number(row.base_cents)
      const vat = Number(row.vat_cents)
      const valueCents = input.metric === 'base' ? base : input.metric === 'vat' ? vat : base + vat
      return { key: row.key, valueCents, count: Number(row.doc_count) }
    })
    return { groupBy: input.groupBy, metric: input.metric, unit: 'cents', groups }
  }

  const keyExpr =
    input.groupBy === 'supplier'
      ? Prisma.sql`COALESCE(d."supplierName", d."supplierNif", 'Desconhecido')`
      : input.groupBy === 'client'
        ? Prisma.sql`COALESCE(c."name", 'Sem cliente')`
        : Prisma.sql`to_char(d."issueDate", 'YYYY-MM')`
  const metricColumn =
    input.metric === 'base'
      ? Prisma.sql`d."netAmount"`
      : input.metric === 'vat'
        ? Prisma.sql`d."vatAmount"`
        : Prisma.sql`d."totalAmount"`
  if (input.groupBy === 'month') {
    conditions.push(Prisma.sql`d."issueDate" IS NOT NULL`)
  }

  const rows = await prisma.$queryRaw<
    Array<{ key: string; value_cents: bigint; doc_count: bigint }>
  >(Prisma.sql`
    SELECT
      ${keyExpr} AS key,
      COALESCE(SUM(ROUND(${metricColumn} * 100)), 0)::bigint AS value_cents,
      COUNT(*) AS doc_count
    FROM "Document" d
    LEFT JOIN "Client" c ON c."id" = d."clientId"
    WHERE ${Prisma.join(conditions, ' AND ')}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 50
  `)
  return {
    groupBy: input.groupBy,
    metric: input.metric,
    unit: 'cents',
    groups: rows.map((row) => ({
      key: row.key,
      valueCents: Number(row.value_cents),
      count: Number(row.doc_count),
    })),
  }
}

async function findDuplicateSuspects(
  officeId: string,
  input: z.infer<typeof findDuplicateSuspectsSchema>,
) {
  const where: Prisma.DocumentWhereInput = {
    ...documentWhere(officeId, input),
    flags: { has: 'DUPLICATE_SUSPECT' },
  }
  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      select: { ...documentListSelect, duplicateOfId: true },
    }),
    prisma.document.count({ where }),
  ])
  return {
    items: documents.map((d) => ({ ...toDocumentItem(d), duplicateOfId: d.duplicateOfId })),
    total,
    limit: input.limit,
  }
}

async function searchBankTransactions(
  officeId: string,
  input: z.infer<typeof searchBankTransactionsSchema>,
) {
  const where: Prisma.BankTransactionWhereInput = {
    officeId,
    ...(input.accountName
      ? { bankAccount: { name: { contains: input.accountName, mode: 'insensitive' } } }
      : {}),
    ...(input.status ? { status: input.status as BankTransactionStatus } : {}),
    ...(input.dateFrom || input.dateTo
      ? {
          bookingDate: {
            ...(input.dateFrom ? { gte: dayStart(input.dateFrom) } : {}),
            ...(input.dateTo ? { lte: dayEnd(input.dateTo) } : {}),
          },
        }
      : {}),
    ...(input.amountMinCents !== undefined ? { amountCents: { gte: input.amountMinCents } } : {}),
    ...(input.amountMaxCents !== undefined
      ? { AND: [{ amountCents: { lte: input.amountMaxCents } }] }
      : {}),
    ...(input.text ? { description: { contains: input.text, mode: 'insensitive' } } : {}),
  }
  const [transactions, total] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      orderBy: [{ bookingDate: 'desc' }, { id: 'desc' }],
      take: input.limit,
      select: {
        id: true,
        bookingDate: true,
        description: true,
        amountCents: true,
        status: true,
        bankAccount: { select: { id: true, name: true, client: { select: { name: true } } } },
      },
    }),
    prisma.bankTransaction.count({ where }),
  ])
  return {
    items: transactions.map((t) => ({
      id: t.id,
      bookingDate: t.bookingDate.toISOString().slice(0, 10),
      description: t.description,
      amountCents: t.amountCents,
      status: t.status,
      accountId: t.bankAccount.id,
      accountName: t.bankAccount.name,
      clientName: t.bankAccount.client.name,
    })),
    total,
    limit: input.limit,
  }
}

async function reconciliationSummary(
  officeId: string,
  input: z.infer<typeof reconciliationSummarySchema>,
) {
  const where: Prisma.BankTransactionWhereInput = {
    officeId,
    ...(input.accountName
      ? { bankAccount: { name: { contains: input.accountName, mode: 'insensitive' } } }
      : {}),
    ...(input.dateFrom || input.dateTo
      ? {
          bookingDate: {
            ...(input.dateFrom ? { gte: dayStart(input.dateFrom) } : {}),
            ...(input.dateTo ? { lte: dayEnd(input.dateTo) } : {}),
          },
        }
      : {}),
  }
  const grouped = await prisma.bankTransaction.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
    _sum: { amountCents: true },
  })
  const byStatus = Object.fromEntries(
    BANK_TRANSACTION_STATUSES.map((status) => {
      const row = grouped.find((g) => g.status === status)
      return [
        status,
        { count: row?._count._all ?? 0, sumCents: row?._sum.amountCents ?? 0 },
      ]
    }),
  )
  return { byStatus, unit: 'cents' }
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export interface AssistantTool {
  description: string
  inputSchema: z.ZodType
  execute: (officeId: string, input: never) => Promise<unknown>
}

/**
 * The CLOSED read-only catalog. Adding a tool here requires it to be a pure
 * read — the acceptance architecture test rejects any Prisma write call in
 * this module.
 */
export const assistantToolCatalog = {
  search_documents: {
    description:
      'Procura documentos (faturas, recibos, …) do gabinete com filtros combináveis. ' +
      'Lista paginada (máx 50). Montantes em cêntimos inteiros.',
    inputSchema: searchDocumentsSchema,
    execute: searchDocuments,
  },
  aggregate_documents: {
    description:
      'Agrega documentos por fornecedor, cliente, taxa de IVA ou mês, somando total, base ' +
      'ou IVA em cêntimos inteiros. A soma é feita na base de dados — apresenta os valores ' +
      'devolvidos, nunca calcules tu.',
    inputSchema: aggregateDocumentsSchema,
    execute: aggregateDocuments,
  },
  find_duplicate_suspects: {
    description:
      'Lista documentos marcados como suspeitos de duplicado (flag DUPLICATE_SUSPECT), ' +
      'com referência ao documento original quando conhecida.',
    inputSchema: findDuplicateSuspectsSchema,
    execute: findDuplicateSuspects,
  },
  search_bank_transactions: {
    description:
      'Procura movimentos bancários importados, com filtros por conta, estado de conciliação, ' +
      'período, montante (cêntimos com sinal — débitos negativos) e texto.',
    inputSchema: searchBankTransactionsSchema,
    execute: searchBankTransactions,
  },
  reconciliation_summary: {
    description:
      'Resumo de conciliação bancária: contagem e soma (cêntimos) de movimentos por estado ' +
      '(por conciliar, sugeridos, conciliados, ignorados), opcionalmente por conta e período.',
    inputSchema: reconciliationSummarySchema,
    execute: reconciliationSummary,
  },
} as const satisfies Record<string, AssistantTool>

export type AssistantToolName = keyof typeof assistantToolCatalog

export type AssistantToolResult =
  | { ok: true; tool: AssistantToolName; data: unknown }
  | { ok: false; tool: string; error: string }

/** Anthropic `tools` array derived from the zod catalog. */
export function getAnthropicToolDefinitions() {
  return Object.entries(assistantToolCatalog).map(([name, tool]) => ({
    name,
    description: tool.description,
    input_schema: z.toJSONSchema(tool.inputSchema) as Record<string, unknown>,
  }))
}

/**
 * Executes one catalog tool for the given office.
 *
 * - `officeId` comes from the SESSION, never from the model. Any officeId-like
 *   key in the model input is stripped and ignored ([INV]).
 * - Invalid input is rejected by zod and reported as a tool error so the
 *   conversation loop can continue ([INV]).
 */
export async function executeAssistantTool(
  officeId: string,
  name: string,
  rawInput: unknown,
): Promise<AssistantToolResult> {
  const tool = (assistantToolCatalog as Record<string, AssistantTool>)[name]
  if (!tool) {
    return { ok: false, tool: name, error: `Ferramenta desconhecida: ${name}` }
  }

  const inputObject =
    rawInput !== null && typeof rawInput === 'object' && !Array.isArray(rawInput)
      ? { ...(rawInput as Record<string, unknown>) }
      : {}
  // Server-side tenancy: the model cannot choose the office.
  delete inputObject.officeId
  delete inputObject.office_id

  const parsed = tool.inputSchema.safeParse(inputObject)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    return { ok: false, tool: name, error: `Parâmetros inválidos — ${detail}` }
  }

  try {
    const data = await tool.execute(officeId, parsed.data as never)
    return { ok: true, tool: name as AssistantToolName, data }
  } catch {
    return { ok: false, tool: name, error: 'Erro ao executar a ferramenta' }
  }
}
