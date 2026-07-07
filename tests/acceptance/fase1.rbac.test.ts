import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeUser, makeEmailAccount, makeInboundEmail, makeAttachment, makeClient } from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => authMockFactory())

import { can, type AuthzAction } from '@/server/authz/can'

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const ALL_ACTIONS: AuthzAction[] = [
  'client:read', 'client:create', 'client:update', 'client:delete',
  'email:read',
  'draft:approve', 'draft:reject',
  'document:read', 'document:review', 'document:upload',
  'invitation:manage', 'user:manage',
  'export:run', 'settings:manage', 'emailAccount:connect',
]

// Expected permission matrix (§1.1): OWNER = everything; ACCOUNTANT = everything
// except invitation/user/settings management; VIEWER = reads only.
const EXPECTED: Record<string, Record<AuthzAction, boolean>> = {
  OWNER: Object.fromEntries(ALL_ACTIONS.map((a) => [a, true])) as Record<AuthzAction, boolean>,
  ACCOUNTANT: Object.fromEntries(
    ALL_ACTIONS.map((a) => [a, !['invitation:manage', 'user:manage', 'settings:manage'].includes(a)])
  ) as Record<AuthzAction, boolean>,
  VIEWER: Object.fromEntries(
    ALL_ACTIONS.map((a) => [a, ['client:read', 'email:read', 'document:read'].includes(a)])
  ) as Record<AuthzAction, boolean>,
}

describe('AC-1.1 RBAC (§1.1)', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
  })

  it('AC-1.1.a [INV] — matriz completa role × ação com DENY por omissão', () => {
    for (const role of ['OWNER', 'ACCOUNTANT', 'VIEWER'] as const) {
      for (const action of ALL_ACTIONS) {
        expect(can(role, action), `${role} × ${action}`).toBe(EXPECTED[role][action])
      }
      // Unknown action ⇒ always denied (DENY-precedence)
      expect(can(role, 'foo' as AuthzAction)).toBe(false)
    }
    expect(can(null, 'client:read')).toBe(false)
    expect(can(undefined, 'client:read')).toBe(false)
  })

  it('AC-1.1.a2 [INV] — arquitetura: toda a rota API (exceto webhooks/nextauth) invoca can()', () => {
    const apiDir = join(process.cwd(), 'src', 'app', 'api')
    const missing: string[] = []

    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (entry !== 'route.ts') continue
        const rel = full.replace(apiDir, '').replace(/\\/g, '/')
        // Exemptions: webhooks and inbound-ingest adapters authenticate by
        // signature/secret (no user session), NextAuth handles its own auth
        if (
          rel.startsWith('/webhooks/') ||
          rel.startsWith('/ingest/') ||
          rel.includes('[...nextauth]') ||
          rel.startsWith('/health')
        ) {
          continue
        }
        const content = readFileSync(full, 'utf-8')
        // guard() is the central wrapper around can() — either counts as enforcement
        if (!/\b(can|guard)\(/.test(content)) missing.push(rel)
      }
    }
    walk(apiDir)

    expect(missing).toEqual([])
  })

  it('AC-1.1.b [INV] — VIEWER não cria/edita/apaga clientes (sem escrita na BD)', async () => {
    const { officeA } = await makeTwoOffices()
    const viewer = await makeUser({ officeId: officeA.id, role: 'VIEWER' })
    const client = await makeClient({ officeId: officeA.id, name: 'Original' })

    setSession({ id: viewer.id, email: viewer.email, officeId: officeA.id, role: 'VIEWER' })

    const { POST } = await import('@/app/api/clients/route')
    const create = await POST(jsonRequest('/api/clients', 'POST', { name: 'Novo Cliente' }))
    expect([403, 404]).toContain(create.status)

    const { PATCH } = await import('@/app/api/clients/[clientId]/route')
    const update = await PATCH(
      jsonRequest(`/api/clients/${client.id}`, 'PATCH', { name: 'Alterado' }),
      { params: Promise.resolve({ clientId: client.id }) }
    )
    expect([403, 404]).toContain(update.status)

    const clients = await prisma.client.findMany()
    expect(clients).toHaveLength(1)
    expect(clients[0].name).toBe('Original')
  })

  it('AC-1.1.c [INV] — acesso cross-tenant devolve 404 (nunca 403)', async () => {
    const { officeA, officeB, ownerB } = await makeTwoOffices()
    const clientA = await makeClient({ officeId: officeA.id })
    const accountA = await makeEmailAccount({ officeId: officeA.id })
    const emailA = await makeInboundEmail({ emailAccountId: accountA.id })
    const attachmentA = await makeAttachment({ inboundEmailId: emailA.id })
    const documentA = await prisma.document.create({
      data: { officeId: officeA.id, attachmentId: attachmentA.id, status: 'CLASSIFIED', type: 'INVOICE_RECEIVED', r2Key: 'x/y.pdf' },
    })

    setSession({ id: ownerB.id, email: ownerB.email, officeId: officeB.id, role: 'OWNER' })

    const { GET: getClient } = await import('@/app/api/clients/[clientId]/route')
    const rc = await getClient(jsonRequest(`/api/clients/${clientA.id}`, 'GET'), {
      params: Promise.resolve({ clientId: clientA.id }),
    })
    expect(rc.status).toBe(404)

    const { GET: getEmail } = await import('@/app/api/emails/[emailId]/route')
    const re = await getEmail(jsonRequest(`/api/emails/${emailA.id}`, 'GET'), {
      params: Promise.resolve({ emailId: emailA.id }),
    })
    expect(re.status).toBe(404)

    const { GET: getDocument } = await import('@/app/api/documents/[documentId]/route')
    const rd = await getDocument(jsonRequest(`/api/documents/${documentA.id}`, 'GET'), {
      params: Promise.resolve({ documentId: documentA.id }),
    })
    expect(rd.status).toBe(404)

    const { GET: getAttachment } = await import('@/app/api/attachments/[attachmentId]/route')
    const ra = await getAttachment(jsonRequest(`/api/attachments/${attachmentA.id}`, 'GET'), {
      params: Promise.resolve({ attachmentId: attachmentA.id }),
    })
    expect(ra.status).toBe(404)
  })

  it('AC-1.1.c2 — dono do recurso obtém signed URL do anexo (200)', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const accountA = await makeEmailAccount({ officeId: officeA.id })
    const emailA = await makeInboundEmail({ emailAccountId: accountA.id })
    const attachmentA = await makeAttachment({ inboundEmailId: emailA.id })
    await prisma.emailAttachment.update({
      where: { id: attachmentA.id },
      data: { r2Key: `${officeA.id}/none/${emailA.id}/${attachmentA.id}.pdf` },
    })

    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const { GET: getAttachment } = await import('@/app/api/attachments/[attachmentId]/route')
    const res = await getAttachment(jsonRequest(`/api/attachments/${attachmentA.id}`, 'GET'), {
      params: Promise.resolve({ attachmentId: attachmentA.id }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.url).toContain('http')
  })
})
