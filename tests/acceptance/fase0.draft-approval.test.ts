import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import {
  makeTwoOffices,
  makeUser,
  makeEmailAccount,
  makeInboundEmail,
  makeDraftAction,
} from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => authMockFactory())

// Controllable provider mock — each test decides how sendReply behaves.
const sendReplyMock = vi.fn<(messageId: string, draft: unknown) => Promise<void>>()
vi.mock('@/server/email-providers', () => ({
  createEmailProvider: () => ({
    syncInbox: vi.fn(),
    getAttachment: vi.fn(),
    sendReply: sendReplyMock,
    watchChanges: vi.fn(),
  }),
}))

import { POST as approveRoute } from '@/app/api/emails/[emailId]/actions/[actionId]/approve/route'
import { POST as rejectRoute } from '@/app/api/emails/[emailId]/actions/[actionId]/reject/route'
import { POST as retrySendRoute } from '@/app/api/emails/[emailId]/draft/retry-send/route'
import { PATCH as patchDraftRoute } from '@/app/api/emails/[emailId]/draft/route'
import { GET as getEmailRoute } from '@/app/api/emails/[emailId]/route'

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

interface Ctx {
  officeId: string
  accountant: { id: string; email: string }
  emailId: string
  actionId: string
  otherOfficeUser: { id: string; email: string; officeId: string }
}

async function setupDraft(): Promise<Ctx> {
  const { officeA, officeB, ownerB } = await makeTwoOffices()
  const accountant = await makeUser({ officeId: officeA.id, role: 'ACCOUNTANT' })
  const account = await makeEmailAccount({ officeId: officeA.id })
  const email = await makeInboundEmail({ emailAccountId: account.id })
  const action = await makeDraftAction({ inboundEmailId: email.id })
  return {
    officeId: officeA.id,
    accountant: { id: accountant.id, email: accountant.email },
    emailId: email.id,
    actionId: action.id,
    otherOfficeUser: { id: ownerB.id, email: ownerB.email, officeId: officeB.id },
  }
}

function actAs(user: { id: string; email: string }, officeId: string, role: 'OWNER' | 'ACCOUNTANT' | 'VIEWER' = 'ACCOUNTANT') {
  setSession({ id: user.id, email: user.email, officeId, role })
}

function approve(ctx: Ctx, body?: unknown) {
  return approveRoute(
    jsonRequest(`/api/emails/${ctx.emailId}/actions/${ctx.actionId}/approve`, 'POST', body ?? {}),
    { params: Promise.resolve({ emailId: ctx.emailId, actionId: ctx.actionId }) }
  )
}

function reject(ctx: Ctx, body?: unknown) {
  return rejectRoute(
    jsonRequest(`/api/emails/${ctx.emailId}/actions/${ctx.actionId}/reject`, 'POST', body ?? {}),
    { params: Promise.resolve({ emailId: ctx.emailId, actionId: ctx.actionId }) }
  )
}

function retrySend(ctx: Ctx) {
  return retrySendRoute(
    jsonRequest(`/api/emails/${ctx.emailId}/draft/retry-send`, 'POST', {}),
    { params: Promise.resolve({ emailId: ctx.emailId }) }
  )
}

describe('AC-0.2 Loop de aprovação de drafts (§0.2, A3)', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    sendReplyMock.mockReset()
    sendReplyMock.mockResolvedValue(undefined)
  })

  it('AC-0.2.a [INV] — approve persiste EmailReview + AuditLog ANTES de sendReply, e sendReply é chamado 1×', async () => {
    const ctx = await setupDraft()
    actAs(ctx.accountant, ctx.officeId)

    let reviewExistedAtSendTime = false
    let auditExistedAtSendTime = false
    sendReplyMock.mockImplementation(async () => {
      const review = await prisma.emailReview.findUnique({ where: { emailActionId: ctx.actionId } })
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'EMAIL_DRAFT_APPROVED', entityId: ctx.actionId },
      })
      reviewExistedAtSendTime = review !== null
      auditExistedAtSendTime = audit !== null
    })

    const res = await approve(ctx)
    expect(res.status).toBe(200)

    expect(sendReplyMock).toHaveBeenCalledTimes(1)
    expect(reviewExistedAtSendTime).toBe(true)
    expect(auditExistedAtSendTime).toBe(true)

    const action = await prisma.emailAction.findUniqueOrThrow({ where: { id: ctx.actionId } })
    expect(action.status).toBe('APPROVED_SENT')
  })

  it('AC-0.2.b [INV] — approve 2× concorrente: 1 envio, o outro 409', async () => {
    const ctx = await setupDraft()
    actAs(ctx.accountant, ctx.officeId)

    const [r1, r2] = await Promise.all([approve(ctx), approve(ctx)])
    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toEqual([200, 409])
    expect(sendReplyMock).toHaveBeenCalledTimes(1)

    const reviews = await prisma.emailReview.findMany({ where: { emailActionId: ctx.actionId } })
    expect(reviews).toHaveLength(1)
  })

  it('AC-0.2.c [INV] — approve e reject concorrentes: exatamente um vence', async () => {
    const ctx = await setupDraft()
    actAs(ctx.accountant, ctx.officeId)

    const [ra, rr] = await Promise.all([approve(ctx), reject(ctx)])
    const statuses = [ra.status, rr.status].sort()
    expect(statuses).toEqual([200, 409])

    const action = await prisma.emailAction.findUniqueOrThrow({ where: { id: ctx.actionId } })
    expect(['APPROVED_SENT', 'REJECTED']).toContain(action.status)
  })

  it('AC-0.2.d [INV] — reject nunca chama sendReply; persiste review + audit', async () => {
    const ctx = await setupDraft()
    actAs(ctx.accountant, ctx.officeId)

    const res = await reject(ctx, { reason: 'Não adequado' })
    expect(res.status).toBe(200)
    expect(sendReplyMock).not.toHaveBeenCalled()

    const action = await prisma.emailAction.findUniqueOrThrow({ where: { id: ctx.actionId } })
    expect(action.status).toBe('REJECTED')
    expect(await prisma.emailReview.findUnique({ where: { emailActionId: ctx.actionId } })).not.toBeNull()
    expect(
      await prisma.auditLog.findFirst({ where: { action: 'EMAIL_DRAFT_REJECTED', entityId: ctx.actionId } })
    ).not.toBeNull()
  })

  it('AC-0.2.d2 [INV] — approve de action de outro office → 404, nada persistido', async () => {
    const ctx = await setupDraft()
    actAs(ctx.otherOfficeUser, ctx.otherOfficeUser.officeId)

    const res = await approve(ctx)
    expect(res.status).toBe(404)
    expect(sendReplyMock).not.toHaveBeenCalled()

    const action = await prisma.emailAction.findUniqueOrThrow({ where: { id: ctx.actionId } })
    expect(action.status).toBe('PENDING_REVIEW')
    expect(await prisma.emailReview.count()).toBe(0)
  })

  it('AC-0.2.e — falha no envio → APPROVED_SEND_FAILED; retry ok → APPROVED_SENT', async () => {
    const ctx = await setupDraft()
    actAs(ctx.accountant, ctx.officeId)

    sendReplyMock.mockRejectedValueOnce(new Error('Graph 503'))
    const res = await approve(ctx)
    expect([200, 502]).toContain(res.status)

    let action = await prisma.emailAction.findUniqueOrThrow({ where: { id: ctx.actionId } })
    expect(action.status).toBe('APPROVED_SEND_FAILED')
    // Review and audit survive the failure
    expect(await prisma.emailReview.findUnique({ where: { emailActionId: ctx.actionId } })).not.toBeNull()

    sendReplyMock.mockResolvedValueOnce(undefined)
    const retry = await retrySend(ctx)
    expect(retry.status).toBe(200)
    action = await prisma.emailAction.findUniqueOrThrow({ where: { id: ctx.actionId } })
    expect(action.status).toBe('APPROVED_SENT')
  })

  it('AC-0.2.e2 — máximo 3 retries: 4.º retry → 409 sem chamada ao provider', async () => {
    const ctx = await setupDraft()
    actAs(ctx.accountant, ctx.officeId)

    sendReplyMock.mockRejectedValue(new Error('Graph down'))
    await approve(ctx) // attempt 1 fails → APPROVED_SEND_FAILED

    for (let i = 0; i < 3; i++) {
      const res = await retrySend(ctx) // retries 1..3, all fail
      expect([200, 502]).toContain(res.status)
    }
    const callsBefore = sendReplyMock.mock.calls.length

    const fourth = await retrySend(ctx)
    expect(fourth.status).toBe(409)
    expect(sendReplyMock.mock.calls.length).toBe(callsBefore)
  })

  it('AC-0.2.f [INV] — PATCH .../draft fora de PENDING_REVIEW → 409', async () => {
    const ctx = await setupDraft()
    actAs(ctx.accountant, ctx.officeId)

    // Editing while pending is allowed
    const ok = await patchDraftRoute(
      jsonRequest(`/api/emails/${ctx.emailId}/draft`, 'PATCH', { body: 'Texto editado' }),
      { params: Promise.resolve({ emailId: ctx.emailId }) }
    )
    expect(ok.status).toBe(200)

    await approve(ctx)

    const after = await patchDraftRoute(
      jsonRequest(`/api/emails/${ctx.emailId}/draft`, 'PATCH', { body: 'Tarde demais' }),
      { params: Promise.resolve({ emailId: ctx.emailId }) }
    )
    expect(after.status).toBe(409)
  })

  it('AC-0.2.g [INV] — VIEWER não aprova nem rejeita', async () => {
    const ctx = await setupDraft()
    const viewer = await makeUser({ officeId: ctx.officeId, role: 'VIEWER' })
    actAs({ id: viewer.id, email: viewer.email }, ctx.officeId, 'VIEWER')

    const ra = await approve(ctx)
    const rr = await reject(ctx)
    expect([403, 404]).toContain(ra.status)
    expect([403, 404]).toContain(rr.status)
    expect(sendReplyMock).not.toHaveBeenCalled()

    const action = await prisma.emailAction.findUniqueOrThrow({ where: { id: ctx.actionId } })
    expect(action.status).toBe('PENDING_REVIEW')
  })

  it('AC-0.2.h — decisão sobrevive a nova sessão: GET devolve APPROVED_SENT da BD', async () => {
    const ctx = await setupDraft()
    actAs(ctx.accountant, ctx.officeId)
    await approve(ctx)

    // Simulate a completely new session (e.g. browser closed and reopened)
    setSession(null)
    actAs(ctx.accountant, ctx.officeId)

    const res = await getEmailRoute(
      jsonRequest(`/api/emails/${ctx.emailId}`, 'GET'),
      { params: Promise.resolve({ emailId: ctx.emailId }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const payload = JSON.stringify(body)
    expect(payload).toContain('APPROVED_SENT')
  })
})
