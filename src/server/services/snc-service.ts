import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic'

/**
 * SNC v1 (S3.4 + A13): account SUGGESTION, never decision.
 * Priority: supplier history (zero AI) → Claude, zod-validated against the
 * seeded taxonomy. Sensitive limited-deductibility accounts (621x/625x/626x
 * refeições) force a VAT review on the first occurrence per supplier — only a
 * human-created SupplierRule automates from then on. The system never does
 * autonomous fiscal interpretation.
 */

interface SncSeedEntry {
  code: string
  label: string
  suggestible?: boolean
  sensitive?: boolean
}

const SNC_TAXONOMY: SncSeedEntry[] = [
  { code: '6221', label: 'Trabalhos especializados' },
  { code: '6222', label: 'Publicidade e propaganda' },
  { code: '6223', label: 'Vigilância e segurança' },
  { code: '6224', label: 'Honorários' },
  { code: '6226', label: 'Conservação e reparação' },
  { code: '6231', label: 'Ferramentas e utensílios de desgaste rápido' },
  { code: '6232', label: 'Livros e documentação técnica' },
  { code: '6241', label: 'Eletricidade' },
  { code: '6242', label: 'Água' },
  { code: '6248', label: 'Outros fluidos' },
  { code: '6251', label: 'Deslocações e estadas', sensitive: true },
  { code: '6252', label: 'Transportes de pessoal', sensitive: true },
  { code: '6261', label: 'Rendas e alugueres', sensitive: true },
  { code: '6262', label: 'Comunicação' },
  { code: '6263', label: 'Seguros' },
  { code: '6267', label: 'Limpeza, higiene e conforto' },
  { code: '6268', label: 'Outros serviços' },
  { code: '311', label: 'Compras — mercadorias' },
  { code: '312', label: 'Compras — matérias-primas' },
  { code: '43', label: 'Ativos fixos tangíveis' },
  { code: '45', label: 'Investimentos em curso' },
  { code: '6811', label: 'Impostos diretos' },
  // 63x pessoal — fora de âmbito de sugestão automática (S3.4): nunca sugerir
  { code: '63', label: 'Gastos com o pessoal', suggestible: false },
  { code: '211', label: 'Clientes c/c' },
  { code: '221', label: 'Fornecedores c/c' },
  { code: '24321', label: 'IVA dedutível — taxa reduzida' },
  { code: '24322', label: 'IVA dedutível — taxa intermédia' },
  { code: '24323', label: 'IVA dedutível — taxa normal' },
]

/** Seeds the SNC taxonomy via service (idempotent — S3.4). */
export async function seedSncTaxonomy(): Promise<void> {
  for (const entry of SNC_TAXONOMY) {
    await prisma.sncAccount.upsert({
      where: { code: entry.code },
      create: {
        code: entry.code,
        label: entry.label,
        suggestible: entry.suggestible ?? true,
        sensitive: entry.sensitive ?? false,
      },
      update: {
        label: entry.label,
        suggestible: entry.suggestible ?? true,
        sensitive: entry.sensitive ?? false,
      },
    })
  }
}

const AI_SNC_SCHEMA = z.object({
  accountCode: z.string(),
  vatTreatment: z.enum(['DEDUTIVEL_TOTAL', 'NAO_DEDUTIVEL', 'AUTOLIQUIDACAO', 'ISENTO']),
  confidence: z.number().min(0).max(1),
})

export type SncSuggestionResult =
  | { ok: true; accountCode: string; vatTreatment: string | null; sncSource: 'HISTORY' | 'AI' }
  | { ok: false; reason: 'NOT_FOUND' | 'NO_SUPPLIER' | 'INVALID_CODE' | 'AI_FAILED' }

/**
 * Suggests an SNC account for a document. History first (zero AI); Claude as
 * fallback with strict validation against the taxonomy. The suggestion NEVER
 * changes the document state by itself — except the A13 sensitive gate, which
 * forces a VAT review on the supplier's first occurrence.
 */
export async function suggestSncForDocument(params: {
  documentId: string
  officeId: string
}): Promise<SncSuggestionResult> {
  const doc = await prisma.document.findFirst({
    where: { id: params.documentId, officeId: params.officeId, deletedAt: null },
  })
  if (!doc) return { ok: false, reason: 'NOT_FOUND' }
  if (!doc.supplierNif) return { ok: false, reason: 'NO_SUPPLIER' }

  // 1) History: last human-validated account for this supplier (zero AI)
  const historic = await prisma.document.findFirst({
    where: {
      officeId: params.officeId,
      supplierNif: doc.supplierNif,
      accountCode: { not: null },
      id: { not: doc.id },
      deletedAt: null,
    },
    orderBy: { updatedAt: 'desc' },
    select: { accountCode: true, vatTreatment: true },
  })
  if (historic?.accountCode) {
    await applySuggestion(doc.id, params.officeId, doc.supplierNif, historic.accountCode, historic.vatTreatment, 'HISTORY')
    return { ok: true, accountCode: historic.accountCode, vatTreatment: historic.vatTreatment, sncSource: 'HISTORY' }
  }

  // 2) AI suggestion, validated against the taxonomy
  const taxonomy = await prisma.sncAccount.findMany({ where: { suggestible: true } })
  const codes = new Set(taxonomy.map((t) => t.code))

  let parsed: z.infer<typeof AI_SNC_SCHEMA>
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content:
            `Sugere a conta SNC para este documento de contabilidade PT. Fornecedor: ${doc.supplierName ?? '?'} (NIF ${doc.supplierNif}). ` +
            `Tipo: ${doc.type}. Descrição: ${doc.reasoning ?? '-'}. ` +
            `Contas permitidas: ${taxonomy.map((t) => `${t.code} (${t.label})`).join(', ')}. ` +
            `Devolve APENAS JSON: {"accountCode":"<code>","vatTreatment":"DEDUTIVEL_TOTAL|NAO_DEDUTIVEL|AUTOLIQUIDACAO|ISENTO","confidence":0.0-1.0}`,
        },
      ],
    })
    const raw = (response.content[0] as { text: string }).text
    parsed = AI_SNC_SCHEMA.parse(JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '')))
  } catch (error) {
    console.warn(`[snc] AI suggestion failed for document ${doc.id}:`, error)
    return { ok: false, reason: 'AI_FAILED' }
  }

  if (!codes.has(parsed.accountCode)) {
    // Invented code: discarded, document goes to review — NEVER persisted (AC-5.1.b)
    await prisma.document.update({
      where: { id: doc.id },
      data: { status: 'NEEDS_REVIEW' },
    })
    return { ok: false, reason: 'INVALID_CODE' }
  }

  await applySuggestion(doc.id, params.officeId, doc.supplierNif, parsed.accountCode, parsed.vatTreatment, 'AI')
  return { ok: true, accountCode: parsed.accountCode, vatTreatment: parsed.vatTreatment, sncSource: 'AI' }
}

async function applySuggestion(
  documentId: string,
  officeId: string,
  supplierNif: string,
  accountCode: string,
  vatTreatment: string | null,
  sncSource: 'HISTORY' | 'AI'
): Promise<void> {
  const account = await prisma.sncAccount.findUnique({ where: { code: accountCode } })

  // A13 sensitive gate: limited-deductibility accounts require a human VAT
  // decision on the FIRST occurrence per supplier — unless a human rule exists
  let sensitiveGate = false
  if (account?.sensitive) {
    const humanRule = await prisma.supplierRule.findFirst({
      where: { officeId, supplierNif, active: true },
      select: { id: true },
    })
    if (!humanRule) sensitiveGate = true
  }

  await prisma.document.update({
    where: { id: documentId },
    data: {
      suggestedAccountCode: accountCode,
      suggestedVatTreatment: vatTreatment,
      sncSource,
      ...(sensitiveGate
        ? { status: 'NEEDS_REVIEW', flags: { push: 'VAT_SENSITIVE' } }
        : {}),
    },
  })
}

/** Export account resolution (AC-5.1.e): client-specific override wins. */
export async function buildExportAccount(params: {
  clientId: string | null
  accountCode: string | null
}): Promise<string> {
  if (!params.accountCode) return ''
  if (!params.clientId) return params.accountCode
  const client = await prisma.client.findUnique({
    where: { id: params.clientId },
    select: { accountOverrides: true },
  })
  const overrides = (client?.accountOverrides ?? {}) as Record<string, string>
  return overrides[params.accountCode] ?? params.accountCode
}
