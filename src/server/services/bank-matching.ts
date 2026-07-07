import { prisma } from '@/lib/prisma'
import { centsFromDecimalString, decimalStringFromCents } from '@/lib/money'
import type { DocumentType, Prisma } from '@prisma/client'

/**
 * Deterministic reconciliation matching engine (fase C2) — pure scoring, no AI.
 *
 * Weights: AMOUNT 50 (eliminatory), DATE 25, NIF/NAME bridge 20, REFERENCE +15.
 * scoreTotal ≥ 75 → autoMatch suggestion and the transaction becomes SUGGESTED;
 * 45–74 → review suggestion (autoMatch=false, status untouched); < 45 → nothing.
 *
 * autoMatch only PRE-SELECTS in the UI — reconciling is ALWAYS a human action
 * in v1. Payments (debit) match received documents; receipts (credit) match
 * issued ones. Max 5 suggestions per transaction, best score first.
 */

export const AUTO_MATCH_THRESHOLD = 75
export const SUGGESTION_THRESHOLD = 45
export const MAX_SUGGESTIONS_PER_TRANSACTION = 5

const DEBIT_DOCUMENT_TYPES: DocumentType[] = ['INVOICE_RECEIVED', 'INVOICE_RECEIPT', 'RECEIPT']
const CREDIT_DOCUMENT_TYPES: DocumentType[] = ['INVOICE_ISSUED']

export interface ScoreBreakdown {
  amount: number
  date: number
  entity: number
  reference: number
}

export interface CandidateDocument {
  totalCents: number
  dueDate: Date | null
  issueDate: Date | null
  supplierNif: string | null
  supplierName: string | null
  documentNumber: string | null
}

/** Uppercase, accent-stripped, whitespace-collapsed text for entity matching. */
export function normalizeMatchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Supplier NIF present in the description (digit-boundary — never inside a longer number). */
function nifInDescription(description: string, nif: string): boolean {
  return new RegExp(`(^|\\D)${escapeRegExp(nif)}(\\D|$)`).test(description)
}

/** Normalized supplier name (≥ 4 chars) present with word boundaries. */
function nameInDescription(normalizedDescription: string, supplierName: string): boolean {
  const name = normalizeMatchText(supplierName)
  if (name.length < 4) return false
  return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(name)}([^A-Z0-9]|$)`).test(normalizedDescription)
}

/** Document number present in the description (space-insensitive compare). */
function referenceInDescription(normalizedDescription: string, documentNumber: string): boolean {
  const compactRef = normalizeMatchText(documentNumber).replace(/\s+/g, '')
  if (compactRef.length < 3) return false
  return normalizedDescription.replace(/\s+/g, '').includes(compactRef)
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Scores one candidate document against a bank transaction.
 * Returns null when the amount is outside tolerance — amount is eliminatory.
 */
export function scoreCandidate(params: {
  transactionAmountCents: number
  bookingDate: Date
  description: string
  document: CandidateDocument
  toleranceCents: number
}): { total: number; breakdown: ScoreBreakdown } | null {
  const { document: doc } = params

  // AMOUNT (50) — eliminatory
  const absAmount = Math.abs(params.transactionAmountCents)
  const amountDelta = Math.abs(absAmount - doc.totalCents)
  let amount: number
  if (amountDelta === 0) amount = 50
  else if (amountDelta <= params.toleranceCents) amount = 45
  else return null

  // DATE (25) — against dueDate, falling back to issueDate
  const reference = doc.dueDate ?? doc.issueDate
  let date = 0
  if (reference) {
    const dayDiff = Math.abs(params.bookingDate.getTime() - reference.getTime()) / DAY_MS
    if (dayDiff <= 3) date = 25
    else if (dayDiff <= 15) date = 15
    else if (dayDiff <= 45) date = 5
  }

  // NIF/NAME bridge (20)
  const normalizedDescription = normalizeMatchText(params.description)
  let entity = 0
  if (doc.supplierNif && nifInDescription(params.description, doc.supplierNif)) {
    entity = 20
  } else if (doc.supplierName && nameInDescription(normalizedDescription, doc.supplierName)) {
    entity = 12
  }

  // REFERENCE bonus (+15)
  const hasReference =
    doc.documentNumber !== null && referenceInDescription(normalizedDescription, doc.documentNumber)
  const referenceScore = hasReference ? 15 : 0

  const breakdown: ScoreBreakdown = { amount, date, entity, reference: referenceScore }
  return { total: amount + date + entity + referenceScore, breakdown }
}

export type MultiDocValidation = { ok: true } | { ok: false; deltaCents: number }

/**
 * Partial matching v1: one transaction may reconcile against N documents —
 * the document totals must add up to |amountCents| ± tolerance. Enforced at
 * reconcile time (C3 endpoint → 422), never during scoring.
 */
export function validateReconciliationTotals(params: {
  transactionAmountCents: number
  documentTotalsCents: number[]
  toleranceCents: number
}): MultiDocValidation {
  const sum = params.documentTotalsCents.reduce((acc, cents) => acc + cents, 0)
  const deltaCents = Math.abs(Math.abs(params.transactionAmountCents) - sum)
  return deltaCents <= params.toleranceCents ? { ok: true } : { ok: false, deltaCents }
}

export type GenerateSuggestionsResult =
  | { ok: true; created: number; autoMatch: boolean }
  | { ok: false; httpStatus: 404; error: string }

/**
 * Finds and persists suggestions for one transaction. Idempotent: re-running
 * never duplicates (unique bankTransactionId+documentId) and never touches
 * RECONCILED/IGNORED transactions.
 */
export async function generateSuggestionsForTransaction(params: {
  officeId: string
  bankTransactionId: string
}): Promise<GenerateSuggestionsResult> {
  const tx = await prisma.bankTransaction.findFirst({
    where: { id: params.bankTransactionId, officeId: params.officeId },
    include: {
      bankAccount: { select: { clientId: true } },
      office: { select: { reconciliationToleranceCents: true } },
    },
  })
  if (!tx) return { ok: false, httpStatus: 404, error: 'Transação não encontrada' }
  if (tx.status === 'RECONCILED' || tx.status === 'IGNORED') {
    return { ok: true, created: 0, autoMatch: false }
  }
  if (tx.amountCents === 0) return { ok: true, created: 0, autoMatch: false }

  // Bank rules run BEFORE scoring (C3): IGNORE short-circuits; SUGGEST_CLIENT
  // redirects the candidate search to the target client
  const { applyRulesBeforeMatching } = await import('./bank-rules')
  const ruleOutcome = await applyRulesBeforeMatching({
    officeId: params.officeId,
    transaction: tx,
  })
  if (ruleOutcome?.kind === 'ignored') return { ok: true, created: 0, autoMatch: false }
  const candidateClientId =
    ruleOutcome?.kind === 'suggestClient' ? ruleOutcome.targetClientId : tx.bankAccount.clientId

  const toleranceCents = tx.office.reconciliationToleranceCents
  const absAmount = Math.abs(tx.amountCents)
  const documentTypes = tx.amountCents < 0 ? DEBIT_DOCUMENT_TYPES : CREDIT_DOCUMENT_TYPES

  // Amount is eliminatory — pre-filter in SQL by the tolerance window (A1:
  // Decimal column compared against decimal strings built from integer cents)
  const where: Prisma.DocumentWhereInput = {
    officeId: params.officeId,
    clientId: candidateClientId,
    deletedAt: null,
    status: { in: ['VALIDATED', 'EXPORTED'] },
    type: { in: documentTypes },
    reconciledEntryId: null,
    totalAmount: {
      gte: decimalStringFromCents(absAmount - toleranceCents),
      lte: decimalStringFromCents(absAmount + toleranceCents),
    },
  }
  const candidates = await prisma.document.findMany({
    where,
    select: {
      id: true,
      totalAmount: true,
      dueDate: true,
      issueDate: true,
      supplierNif: true,
      supplierName: true,
      documentNumber: true,
    },
  })

  const scored = candidates
    .map((doc) => {
      const result = scoreCandidate({
        transactionAmountCents: tx.amountCents,
        bookingDate: tx.bookingDate,
        description: tx.description,
        document: {
          totalCents: centsFromDecimalString(String(doc.totalAmount)),
          dueDate: doc.dueDate,
          issueDate: doc.issueDate,
          supplierNif: doc.supplierNif,
          supplierName: doc.supplierName,
          documentNumber: doc.documentNumber,
        },
        toleranceCents,
      })
      return result ? { documentId: doc.id, ...result } : null
    })
    .filter((s): s is NonNullable<typeof s> => s !== null && s.total >= SUGGESTION_THRESHOLD)
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_SUGGESTIONS_PER_TRANSACTION)

  if (scored.length === 0) return { ok: true, created: 0, autoMatch: false }

  await prisma.reconciliationSuggestion.createMany({
    data: scored.map((s) => ({
      officeId: params.officeId,
      bankTransactionId: tx.id,
      documentId: s.documentId,
      scoreTotal: s.total,
      scoreBreakdown: s.breakdown as unknown as Prisma.InputJsonValue,
      autoMatch: s.total >= AUTO_MATCH_THRESHOLD,
    })),
    skipDuplicates: true, // idempotent re-runs
  })

  const hasAutoMatch = scored.some((s) => s.total >= AUTO_MATCH_THRESHOLD)
  if (hasAutoMatch) {
    // Conditional transition — never resurrects RECONCILED/IGNORED (A7 pattern)
    await prisma.bankTransaction.updateMany({
      where: { id: tx.id, status: 'UNRECONCILED' },
      data: { status: 'SUGGESTED' },
    })
  }

  return { ok: true, created: scored.length, autoMatch: hasAutoMatch }
}

/** Runs matching for every UNRECONCILED transaction of an import (C1→C2 wiring). */
export async function runMatchingForImport(params: {
  officeId: string
  importId: string
}): Promise<void> {
  const transactions = await prisma.bankTransaction.findMany({
    where: { officeId: params.officeId, importId: params.importId, status: 'UNRECONCILED' },
    select: { id: true },
  })
  for (const tx of transactions) {
    await generateSuggestionsForTransaction({
      officeId: params.officeId,
      bankTransactionId: tx.id,
    })
  }
}
