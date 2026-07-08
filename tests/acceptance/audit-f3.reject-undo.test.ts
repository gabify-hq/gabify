import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeUser } from '../helpers/factories'
import { setSession, authMockFactory, type TestSessionUser } from '../helpers/session'
import { NextRequest } from 'next/server'
import { resetRateLimits } from '@/server/rate-limit'

vi.mock('@/lib/auth', () => authMockFactory())

import { reviewDocument } from '@/server/services/review-service'
import { listOfficeDocuments } from '@/server/services/document-service'

/**
 * AUDIT F3.9 — "Rejeitar" deixa de ser um beco (M-1 / UX jornada 2).
 * A rejeição continua soft-delete, mas passa a ser ANULÁVEL: a rota /restore
 * limpa o deletedAt, audita, e devolve o documento às listas.
 */

function asSession(user: TestSessionUser) {
  setSession(user)
}

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function makeRejectableDoc(officeId: string) {
  return prisma.document.create({
    data: {
      officeId,
      source: 'MANUAL_UPLOAD',
      status: 'NEEDS_REVIEW',
      type: 'INVOICE_RECEIVED',
      confidence: 0.7,
      originalFilename: 'rejeitavel.pdf',
    },
  })
}

describe('AUDIT-F3.9 rejeitar com undo', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    setSession(null)
  })

  it('rejeitar → restore devolve o documento às listas com o estado anterior', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const doc = await makeRejectableDoc(officeA.id)

    const rejected = await reviewDocument({
      documentId: doc.id,
      officeId: officeA.id,
      userId: ownerA.id,
      role: 'OWNER',
      decision: 'reject',
      expectedVersion: doc.version,
    })
    expect(rejected.ok).toBe(true)

    // Fora das listas
    expect((await listOfficeDocuments(officeA.id)).map((d) => d.id)).not.toContain(doc.id)

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const { POST } = await import('@/app/api/documents/[documentId]/restore/route')
    const res = await POST(jsonRequest(`/api/documents/${doc.id}/restore`, 'POST'), {
      params: Promise.resolve({ documentId: doc.id }),
    })
    expect(res.status).toBe(200)

    const restored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(restored.deletedAt).toBeNull()
    expect(restored.status).toBe('NEEDS_REVIEW') // estado anterior preservado

    // De volta às listas
    expect((await listOfficeDocuments(officeA.id)).map((d) => d.id)).toContain(doc.id)

    // Auditado
    const audit = await prisma.auditLog.findFirst({
      where: { officeId: officeA.id, action: 'DOCUMENT_RESTORED', entityId: doc.id },
    })
    expect(audit).not.toBeNull()
  })

  it('restore: cross-tenant → 404; VIEWER → negado; documento não rejeitado → 409', async () => {
    const { officeA, officeB, ownerA, ownerB } = await makeTwoOffices()
    const viewer = await makeUser({ officeId: officeA.id, role: 'VIEWER' })
    const doc = await makeRejectableDoc(officeA.id)
    await reviewDocument({
      documentId: doc.id,
      officeId: officeA.id,
      userId: ownerA.id,
      role: 'OWNER',
      decision: 'reject',
      expectedVersion: doc.version,
    })

    const { POST } = await import('@/app/api/documents/[documentId]/restore/route')

    asSession({ id: ownerB.id, email: ownerB.email, officeId: officeB.id, role: 'OWNER' })
    const cross = await POST(jsonRequest(`/api/documents/${doc.id}/restore`, 'POST'), {
      params: Promise.resolve({ documentId: doc.id }),
    })
    expect(cross.status).toBe(404)

    asSession({ id: viewer.id, email: viewer.email, officeId: officeA.id, role: 'VIEWER' })
    const denied = await POST(jsonRequest(`/api/documents/${doc.id}/restore`, 'POST'), {
      params: Promise.resolve({ documentId: doc.id }),
    })
    expect([403, 404]).toContain(denied.status)

    // Restaura de verdade, depois tenta restaurar outra vez → 409
    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const ok = await POST(jsonRequest(`/api/documents/${doc.id}/restore`, 'POST'), {
      params: Promise.resolve({ documentId: doc.id }),
    })
    expect(ok.status).toBe(200)
    const again = await POST(jsonRequest(`/api/documents/${doc.id}/restore`, 'POST'), {
      params: Promise.resolve({ documentId: doc.id }),
    })
    expect(again.status).toBe(409)
  })
})
