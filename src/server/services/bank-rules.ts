import { prisma } from '@/lib/prisma'
import { normalizeMatchText } from './bank-matching'
import type { BankRule } from '@prisma/client'

/**
 * Bank rules engine (fase C3, Kabilio parity). Rules run BEFORE scoring;
 * first active match by ascending priority wins.
 *
 * IGNORE marks the transaction IGNORED with a ReconciliationEntry referencing
 * the rule (system action, audited). SUGGEST_CLIENT redirects candidate
 * matching to the target client — it never reconciles anything by itself.
 */

export interface RuleMatchInput {
  description: string
  amountCents: number
}

/** Pure matcher. CONTAINS/EQUALS are case- and accent-insensitive; SIMPLE_REGEX
 * is applied case-insensitively to the raw description (invalid patterns never match). */
export function ruleMatches(
  rule: Pick<BankRule, 'matchType' | 'pattern' | 'amountMinCents' | 'amountMaxCents'>,
  tx: RuleMatchInput,
): boolean {
  if (rule.amountMinCents !== null && tx.amountCents < rule.amountMinCents) return false
  if (rule.amountMaxCents !== null && tx.amountCents > rule.amountMaxCents) return false

  const description = normalizeMatchText(tx.description)
  const pattern = normalizeMatchText(rule.pattern)
  if (rule.matchType === 'CONTAINS') return pattern !== '' && description.includes(pattern)
  if (rule.matchType === 'EQUALS') return description === pattern
  try {
    return new RegExp(rule.pattern, 'i').test(tx.description)
  } catch {
    return false
  }
}

export type RuleOutcome =
  | { kind: 'ignored'; ruleId: string }
  | { kind: 'suggestClient'; targetClientId: string; ruleId: string }
  | null

/**
 * Applies the first matching active rule to an UNRECONCILED transaction.
 * IGNORE creates the entry + AuditLog and flips the status atomically.
 */
export async function applyRulesBeforeMatching(params: {
  officeId: string
  transaction: {
    id: string
    bankAccountId: string
    description: string
    amountCents: number
    status: string
  }
}): Promise<RuleOutcome> {
  if (params.transaction.status !== 'UNRECONCILED') return null

  const rules = await prisma.bankRule.findMany({
    where: {
      officeId: params.officeId,
      active: true,
      OR: [{ bankAccountId: null }, { bankAccountId: params.transaction.bankAccountId }],
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })

  const match = rules.find((rule) =>
    ruleMatches(rule, {
      description: params.transaction.description,
      amountCents: params.transaction.amountCents,
    }),
  )
  if (!match) return null

  if (match.action === 'SUGGEST_CLIENT') {
    return match.targetClientId
      ? { kind: 'suggestClient', targetClientId: match.targetClientId, ruleId: match.id }
      : null
  }

  // IGNORE — atomic: claim + entry + audit stand or fall together
  await prisma.$transaction(async (db) => {
    const claimed = await db.bankTransaction.updateMany({
      where: { id: params.transaction.id, officeId: params.officeId, status: 'UNRECONCILED' },
      data: { status: 'IGNORED', version: { increment: 1 } },
    })
    if (claimed.count === 0) return // lost a race — someone else acted first

    await db.reconciliationEntry.create({
      data: {
        officeId: params.officeId,
        bankTransactionId: params.transaction.id,
        documentIds: [],
        ignored: true,
        ignoreReason: `Regra bancária: ${match.pattern}`,
        ruleId: match.id,
        reconciledByUserId: null, // system action
      },
    })
    await db.auditLog.create({
      data: {
        officeId: params.officeId,
        userId: null,
        action: 'BANK_TRANSACTION_IGNORED',
        entityType: 'BankTransaction',
        entityId: params.transaction.id,
        metadata: { ruleId: match.id, pattern: match.pattern, byRule: true },
      },
    })
  })
  return { kind: 'ignored', ruleId: match.id }
}
