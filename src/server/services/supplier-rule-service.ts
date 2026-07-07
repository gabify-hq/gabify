import { prisma } from '@/lib/prisma'
import type { DocumentType, SupplierRule } from '@prisma/client'

/**
 * Explicit per-supplier rules (S3.2 — differentiator vs Kabilio).
 * Rules are ALWAYS created by a human click — the system only suggests.
 */

export async function createSupplierRule(params: {
  officeId: string
  supplierNif: string
  clientId?: string | null
  defaultDocumentType?: DocumentType | null
  defaultAccountCode?: string | null
  defaultVatTreatment?: string | null
  autoValidate?: boolean
  createdFromReviewId?: string | null
  createdByUserId: string
}): Promise<SupplierRule> {
  const rule = await prisma.supplierRule.create({
    data: {
      officeId: params.officeId,
      clientId: params.clientId ?? null,
      supplierNif: params.supplierNif,
      defaultDocumentType: params.defaultDocumentType ?? null,
      defaultAccountCode: params.defaultAccountCode ?? null,
      defaultVatTreatment: params.defaultVatTreatment ?? null,
      autoValidate: params.autoValidate ?? false,
      createdFromReviewId: params.createdFromReviewId ?? null,
    },
  })
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.createdByUserId,
      action: 'SUPPLIER_RULE_CREATED',
      entityType: 'SupplierRule',
      entityId: rule.id,
      metadata: { supplierNif: params.supplierNif, autoValidate: rule.autoValidate },
    },
  })
  return rule
}

/** Most specific active rule for a supplier: client rule beats office-wide rule. */
export async function findRuleForSupplier(
  officeId: string,
  supplierNif: string,
  clientId: string | null
): Promise<SupplierRule | null> {
  const rules = await prisma.supplierRule.findMany({
    where: { officeId, supplierNif, active: true },
  })
  if (clientId) {
    const specific = rules.find((r) => r.clientId === clientId)
    if (specific) return specific
  }
  return rules.find((r) => r.clientId === null) ?? null
}

export interface RuleSuggestion {
  supplierNif: string
  defaultAccountCode: string
  occurrences: number
}

/**
 * Learning (S3.2): when human reviews corrected the SAME account for the SAME
 * supplier 3+ times, propose a rule. Never creates one — the UI offers a
 * one-click creation; silence is guaranteed by construction.
 */
export async function suggestRuleForSupplier(
  officeId: string,
  supplierNif: string
): Promise<RuleSuggestion | null> {
  const reviews = await prisma.documentReview.findMany({
    where: {
      decision: 'correct',
      document: { officeId, supplierNif, deletedAt: null },
    },
    select: { after: true },
  })

  const counts = new Map<string, number>()
  for (const review of reviews) {
    const after = review.after as { accountCode?: string | null } | null
    if (after?.accountCode) {
      counts.set(after.accountCode, (counts.get(after.accountCode) ?? 0) + 1)
    }
  }

  for (const [accountCode, occurrences] of counts) {
    if (occurrences >= 3) {
      const existing = await prisma.supplierRule.findFirst({
        where: { officeId, supplierNif, defaultAccountCode: accountCode, active: true },
      })
      if (!existing) return { supplierNif, defaultAccountCode: accountCode, occurrences }
    }
  }
  return null
}
