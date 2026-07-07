import { prisma } from '@/lib/prisma'
import { createEmailProvider } from '@/server/email-providers'
import type { ActionStatus } from '@prisma/client'

/**
 * Server-side draft approval loop (S0.3 / A3).
 *
 * State machine (A3):
 *   PENDING_REVIEW → { APPROVED_SENT, APPROVED_SEND_FAILED, REJECTED }
 *   APPROVED_SEND_FAILED → { APPROVED_SENT (retry), REJECTED }
 * Any other transition ⇒ 409.
 *
 * Concurrency: transitions are conditional UPDATEs in the database
 * (`updateMany ... where status = <expected>`) — never read-then-write.
 * The loser of a race gets a 409 with the current state.
 *
 * Audit: EmailReview + AuditLog are persisted BEFORE `sendReply` fires (G5).
 */

// 1 approve + 3 retries (A3: max 3 retry attempts)
const MAX_SEND_ATTEMPTS = 4

export type DraftReviewResult =
  | { ok: true; status: ActionStatus }
  | { ok: false; httpStatus: number; error: string; currentStatus?: ActionStatus }

interface ActionScope {
  emailId: string
  actionId: string
  officeId: string
}

async function loadScopedAction(scope: ActionScope) {
  return prisma.emailAction.findFirst({
    where: {
      id: scope.actionId,
      inboundEmailId: scope.emailId,
      inboundEmail: { emailAccount: { officeId: scope.officeId } },
    },
    include: {
      inboundEmail: { include: { emailAccount: true } },
    },
  })
}

async function currentStatusOf(actionId: string): Promise<ActionStatus> {
  const action = await prisma.emailAction.findUniqueOrThrow({
    where: { id: actionId },
    select: { status: true },
  })
  return action.status
}

export async function approveDraft(params: ActionScope & {
  userId: string
  editedBody?: string
}): Promise<DraftReviewResult> {
  const action = await loadScopedAction(params)
  if (!action) {
    return { ok: false, httpStatus: 404, error: 'Rascunho não encontrado' }
  }

  // Conditional transition — the database decides who wins a concurrent race
  const won = await prisma.emailAction.updateMany({
    where: { id: action.id, status: 'PENDING_REVIEW' },
    data: {
      status: 'APPROVED',
      sendAttempts: { increment: 1 },
      ...(params.editedBody !== undefined ? { editedContent: params.editedBody } : {}),
    },
  })
  if (won.count === 0) {
    return {
      ok: false,
      httpStatus: 409,
      error: 'O rascunho já foi decidido',
      currentStatus: await currentStatusOf(action.id),
    }
  }

  // Review + audit persisted BEFORE the external send (G5)
  await prisma.emailReview.create({
    data: {
      emailActionId: action.id,
      reviewerId: params.userId,
      decision: 'APPROVED',
      editedBody: params.editedBody ?? null,
    },
  })
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'EMAIL_DRAFT_APPROVED',
      entityType: 'EmailAction',
      entityId: action.id,
      approvedById: params.userId,
      approvedAt: new Date(),
      metadata: { edited: params.editedBody !== undefined },
    },
  })

  const finalBody =
    params.editedBody ?? action.editedContent ?? action.draftContent ?? ''

  return dispatchReply({
    actionId: action.id,
    providerMessageId: action.inboundEmail.providerMessageId,
    account: action.inboundEmail.emailAccount,
    subject: action.inboundEmail.subject,
    bodyText: finalBody,
  })
}

export async function rejectDraft(params: ActionScope & {
  userId: string
  reason?: string
}): Promise<DraftReviewResult> {
  const action = await loadScopedAction(params)
  if (!action) {
    return { ok: false, httpStatus: 404, error: 'Rascunho não encontrado' }
  }

  // A3: rejection is valid from PENDING_REVIEW and from APPROVED_SEND_FAILED
  const won = await prisma.emailAction.updateMany({
    where: { id: action.id, status: { in: ['PENDING_REVIEW', 'APPROVED_SEND_FAILED'] } },
    data: { status: 'REJECTED' },
  })
  if (won.count === 0) {
    return {
      ok: false,
      httpStatus: 409,
      error: 'O rascunho já foi decidido',
      currentStatus: await currentStatusOf(action.id),
    }
  }

  // Upsert: rejecting after a failed send replaces the previous APPROVED review
  await prisma.emailReview.upsert({
    where: { emailActionId: action.id },
    create: {
      emailActionId: action.id,
      reviewerId: params.userId,
      decision: 'REJECTED',
      notes: params.reason ?? null,
    },
    update: {
      reviewerId: params.userId,
      decision: 'REJECTED',
      notes: params.reason ?? null,
      reviewedAt: new Date(),
    },
  })
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'EMAIL_DRAFT_REJECTED',
      entityType: 'EmailAction',
      entityId: action.id,
      metadata: { reason: params.reason ?? null },
    },
  })

  return { ok: true, status: 'REJECTED' }
}

export async function retrySend(params: {
  emailId: string
  officeId: string
  userId: string
}): Promise<DraftReviewResult> {
  const action = await prisma.emailAction.findFirst({
    where: {
      inboundEmailId: params.emailId,
      type: 'DRAFT_REPLY',
      inboundEmail: { emailAccount: { officeId: params.officeId } },
    },
    include: { inboundEmail: { include: { emailAccount: true } } },
  })
  if (!action) {
    return { ok: false, httpStatus: 404, error: 'Rascunho não encontrado' }
  }

  // Only APPROVED_SEND_FAILED can retry, and only while under the attempt cap (A3)
  const won = await prisma.emailAction.updateMany({
    where: {
      id: action.id,
      status: 'APPROVED_SEND_FAILED',
      sendAttempts: { lt: MAX_SEND_ATTEMPTS },
    },
    data: { status: 'APPROVED', sendAttempts: { increment: 1 } },
  })
  if (won.count === 0) {
    return {
      ok: false,
      httpStatus: 409,
      error: 'Reenvio não permitido neste estado ou limite de tentativas atingido',
      currentStatus: await currentStatusOf(action.id),
    }
  }

  // Every retry is audited before the external call (A3)
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'EMAIL_DRAFT_SEND_RETRIED',
      entityType: 'EmailAction',
      entityId: action.id,
      metadata: { attempt: action.sendAttempts + 1 },
    },
  })

  const finalBody = action.editedContent ?? action.draftContent ?? ''
  return dispatchReply({
    actionId: action.id,
    providerMessageId: action.inboundEmail.providerMessageId,
    account: action.inboundEmail.emailAccount,
    subject: action.inboundEmail.subject,
    bodyText: finalBody,
  })
}

/** PATCH of the draft body — only while PENDING_REVIEW (A3). */
export async function editDraft(params: {
  emailId: string
  officeId: string
  body: string
}): Promise<DraftReviewResult> {
  const action = await prisma.emailAction.findFirst({
    where: {
      inboundEmailId: params.emailId,
      type: 'DRAFT_REPLY',
      inboundEmail: { emailAccount: { officeId: params.officeId } },
    },
    select: { id: true },
  })
  if (!action) {
    return { ok: false, httpStatus: 404, error: 'Rascunho não encontrado' }
  }

  const updated = await prisma.emailAction.updateMany({
    where: { id: action.id, status: 'PENDING_REVIEW' },
    data: { editedContent: params.body },
  })
  if (updated.count === 0) {
    return {
      ok: false,
      httpStatus: 409,
      error: 'O rascunho já foi decidido — não pode ser editado',
      currentStatus: await currentStatusOf(action.id),
    }
  }
  return { ok: true, status: 'PENDING_REVIEW' }
}

// ── Internal ────────────────────────────────────────────────────────────────

async function dispatchReply(params: {
  actionId: string
  providerMessageId: string
  account: Parameters<typeof createEmailProvider>[0]
  subject: string | null
  bodyText: string
}): Promise<DraftReviewResult> {
  const provider = createEmailProvider(params.account)
  try {
    await provider.sendReply(params.providerMessageId, {
      subject: params.subject ? `Re: ${params.subject.replace(/^Re:\s*/i, '')}` : undefined,
      bodyText: params.bodyText,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.emailAction.update({
      where: { id: params.actionId },
      data: { status: 'APPROVED_SEND_FAILED', sendError: message },
    })
    return { ok: false, httpStatus: 502, error: 'Falha no envio da resposta', currentStatus: 'APPROVED_SEND_FAILED' }
  }

  await prisma.emailAction.update({
    where: { id: params.actionId },
    data: { status: 'APPROVED_SENT', sentAt: new Date(), sendError: null },
  })
  return { ok: true, status: 'APPROVED_SENT' }
}
