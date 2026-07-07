import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeClient, makeUser } from '../helpers/factories'
import { setSession, authMockFactory, type TestSessionUser } from '../helpers/session'
import { NextRequest } from 'next/server'
import { resetRateLimits } from '@/server/rate-limit'
import type { UserRole } from '@prisma/client'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())
vi.mock('@/lib/anthropic', async () => (await import('../mocks/ai')).aiMockFactory())

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  getToconlinePushQueue: () => ({ add: queueAddMock }),
  getToconlinePullQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  QUEUE_SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  QUEUE_TOCONLINE_PUSH: 'toconline-push',
  QUEUE_TOCONLINE_PULL: 'toconline-pull',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

import { can, type AuthzAction } from '@/server/authz/can'
import { createInvitation, acceptInvitationForEmail } from '@/server/services/invitation-service'

const CLIENT_ROLE = 'CLIENT' as UserRole

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function clientSession(overrides: Partial<TestSessionUser> = {}): TestSessionUser {
  return {
    id: 'user-client-1',
    email: 'portal@empresa.pt',
    officeId: 'office-a',
    role: CLIENT_ROLE,
    clientId: 'client-x',
    ...overrides,
  }
}

// ── Ações internas — CLIENT tem de ser negado em TODAS ──────────────────────
const INTERNAL_ACTIONS: AuthzAction[] = [
  'client:read', 'client:create', 'client:update', 'client:delete',
  'email:read', 'draft:approve', 'draft:reject',
  'document:read', 'document:review', 'document:upload',
  'invitation:manage', 'user:manage', 'export:run', 'settings:manage',
  'emailAccount:connect',
  'bank:read', 'bank:manage', 'bank:import', 'bank:reconcile', 'bankRule:manage',
  'toconline:read', 'toconline:manage', 'toconline:goLive',
]

describe('P1 — role CLIENT: matriz can() [INV]', () => {
  it('P1.a [INV] — CLIENT negado em TODAS as ações internas, permitido apenas em portal:*', () => {
    for (const action of INTERNAL_ACTIONS) {
      expect(can(CLIENT_ROLE, action), `CLIENT × ${action}`).toBe(false)
    }
    expect(can(CLIENT_ROLE, 'clientInvitation:manage' as AuthzAction)).toBe(false)
    expect(can(CLIENT_ROLE, 'portal:document:read' as AuthzAction)).toBe(true)
    expect(can(CLIENT_ROLE, 'portal:document:upload' as AuthzAction)).toBe(true)
    // DENY-precedence: ação desconhecida continua negada
    expect(can(CLIENT_ROLE, 'foo' as AuthzAction)).toBe(false)
  })

  it('P1.b [INV] — regressão zero: OWNER/ACCOUNTANT/VIEWER mantêm a matriz existente; portal:* é exclusivo do CLIENT', () => {
    const OWNER_ONLY: AuthzAction[] = [
      'invitation:manage',
      'user:manage',
      'settings:manage',
      // TOConline v1: going live (dry-run OFF) is an OWNER decision
      'toconline:goLive',
    ]
    const READS: AuthzAction[] = [
      'client:read',
      'email:read',
      'document:read',
      'bank:read',
      'toconline:read',
    ]
    for (const action of INTERNAL_ACTIONS) {
      expect(can('OWNER', action), `OWNER × ${action}`).toBe(true)
      expect(can('ACCOUNTANT', action), `ACCOUNTANT × ${action}`).toBe(!OWNER_ONLY.includes(action))
      expect(can('VIEWER', action), `VIEWER × ${action}`).toBe(READS.includes(action))
    }
    // Convites de acesso ao portal: OWNER e ACCOUNTANT, nunca VIEWER
    expect(can('OWNER', 'clientInvitation:manage' as AuthzAction)).toBe(true)
    expect(can('ACCOUNTANT', 'clientInvitation:manage' as AuthzAction)).toBe(true)
    expect(can('VIEWER', 'clientInvitation:manage' as AuthzAction)).toBe(false)
    // Users internos nunca usam a API do portal (isolamento simétrico)
    for (const role of ['OWNER', 'ACCOUNTANT', 'VIEWER'] as const) {
      expect(can(role, 'portal:document:read' as AuthzAction), `${role} × portal:document:read`).toBe(false)
      expect(can(role, 'portal:document:upload' as AuthzAction), `${role} × portal:document:upload`).toBe(false)
    }
  })
})

describe('P1 — convites CLIENT [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
  })

  it('P1.c [INV] — convite CLIENT sem clientId → 422', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const { POST } = await import('@/app/api/invitations/route')
    const res = await POST(
      jsonRequest('/api/invitations', 'POST', { email: 'cliente@empresa.pt', role: 'CLIENT' }),
    )
    expect(res.status).toBe(422)
    expect(await prisma.invitation.count()).toBe(0)
  })

  it('P1.d [INV] — convite CLIENT com clientId de OUTRO office → 404; nada é criado', async () => {
    const { officeA, ownerA, officeB } = await makeTwoOffices()
    const clientB = await makeClient({ officeId: officeB.id })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const { POST } = await import('@/app/api/invitations/route')
    const res = await POST(
      jsonRequest('/api/invitations', 'POST', {
        email: 'cliente@empresa.pt',
        role: 'CLIENT',
        clientId: clientB.id,
      }),
    )
    expect(res.status).toBe(404)
    expect(await prisma.invitation.count()).toBe(0)
  })

  it('P1.e [INV] — convite não-CLIENT com clientId → 422 (clientId proibido fora do role CLIENT)', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const clientA = await makeClient({ officeId: officeA.id })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const { POST } = await import('@/app/api/invitations/route')
    const res = await POST(
      jsonRequest('/api/invitations', 'POST', {
        email: 'colega@gabinete.pt',
        role: 'ACCOUNTANT',
        clientId: clientA.id,
      }),
    )
    expect(res.status).toBe(422)
    expect(await prisma.invitation.count()).toBe(0)
  })

  it('P1.f [INV] — ACCOUNTANT convida CLIENT (201) mas continua sem poder convidar internos', async () => {
    const { officeA } = await makeTwoOffices()
    const accountant = await makeUser({ officeId: officeA.id, role: 'ACCOUNTANT' })
    const clientA = await makeClient({ officeId: officeA.id })
    setSession({ id: accountant.id, email: accountant.email, officeId: officeA.id, role: 'ACCOUNTANT' })

    const { POST } = await import('@/app/api/invitations/route')
    const ok = await POST(
      jsonRequest('/api/invitations', 'POST', {
        email: 'cliente@empresa.pt',
        role: 'CLIENT',
        clientId: clientA.id,
      }),
    )
    expect(ok.status).toBe(201)

    const denied = await POST(
      jsonRequest('/api/invitations', 'POST', { email: 'colega@gabinete.pt', role: 'ACCOUNTANT' }),
    )
    expect([403, 404]).toContain(denied.status)

    // VIEWER nunca convida CLIENT
    const viewer = await makeUser({ officeId: officeA.id, role: 'VIEWER' })
    setSession({ id: viewer.id, email: viewer.email, officeId: officeA.id, role: 'VIEWER' })
    const viewerDenied = await POST(
      jsonRequest('/api/invitations', 'POST', {
        email: 'cliente2@empresa.pt',
        role: 'CLIENT',
        clientId: clientA.id,
      }),
    )
    expect([403, 404]).toContain(viewerDenied.status)
  })

  it('P1.g [INV] — aceitação cria User com role CLIENT + clientId EXATOS do convite (anti-escalada)', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const clientA = await makeClient({ officeId: officeA.id })

    await createInvitation({
      officeId: officeA.id,
      email: 'Cliente@Empresa.PT',
      role: CLIENT_ROLE,
      clientId: clientA.id,
      invitedByUserId: ownerA.id,
    })

    const user = await acceptInvitationForEmail({ email: 'cliente@empresa.pt' })
    expect(user.role).toBe('CLIENT')
    expect(user.clientId).toBe(clientA.id)
    expect(user.officeId).toBe(officeA.id)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'INVITATION_ACCEPTED', officeId: officeA.id },
    })
    expect(audit).not.toBeNull()
  })

  it('P1.h [INV] — constraints na BD: role CLIENT exige clientId; role interno proíbe clientId', async () => {
    const { officeA } = await makeTwoOffices()
    const clientA = await makeClient({ officeId: officeA.id })

    // CLIENT sem clientId → constraint rejeita
    await expect(
      prisma.user.create({
        data: { officeId: officeA.id, email: 'c1@empresa.pt', role: CLIENT_ROLE },
      }),
    ).rejects.toThrow()

    // Interno com clientId → constraint rejeita
    await expect(
      prisma.user.create({
        data: {
          officeId: officeA.id,
          email: 'c2@empresa.pt',
          role: 'ACCOUNTANT',
          clientId: clientA.id,
        } as never,
      }),
    ).rejects.toThrow()

    // Convite CLIENT sem clientId → constraint rejeita
    const owner = await prisma.user.findFirstOrThrow({ where: { officeId: officeA.id } })
    await expect(
      prisma.invitation.create({
        data: {
          officeId: officeA.id,
          email: 'c3@empresa.pt',
          role: CLIENT_ROLE,
          tokenHash: 'x'.repeat(64),
          expiresAt: new Date(Date.now() + 1000),
          invitedByUserId: owner.id,
        },
      }),
    ).rejects.toThrow()
  })
})

describe('P1 — mudar role de um CLIENT é sempre negado [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
  })

  it('P1.i [INV] — PATCH /api/users/[id] sobre um CLIENT → negado; PATCH para role CLIENT → 422', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const clientA = await makeClient({ officeId: officeA.id })
    const portalUser = await makeUser({
      officeId: officeA.id,
      role: CLIENT_ROLE,
      clientId: clientA.id,
    })
    const accountant = await makeUser({ officeId: officeA.id, role: 'ACCOUNTANT' })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const { PATCH } = await import('@/app/api/users/[userId]/route')

    // Promover um CLIENT a role interno → negado (409/422), role e clientId intactos
    const promote = await PATCH(
      jsonRequest(`/api/users/${portalUser.id}`, 'PATCH', { role: 'ACCOUNTANT' }),
      { params: Promise.resolve({ userId: portalUser.id }) },
    )
    expect([409, 422]).toContain(promote.status)
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: portalUser.id } })
    expect(fresh.role).toBe('CLIENT')
    expect(fresh.clientId).toBe(clientA.id)

    // Despromover um interno a CLIENT → 422 (nunca aceitável por esta rota)
    const demote = await PATCH(
      jsonRequest(`/api/users/${accountant.id}`, 'PATCH', { role: 'CLIENT' }),
      { params: Promise.resolve({ userId: accountant.id }) },
    )
    expect(demote.status).toBe(422)
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: accountant.id } })).role,
    ).toBe('ACCOUNTANT')
  })
})

// ── Loop parametrizado sobre o route map interno — CLIENT negado em TODAS ────
type RouteCase = {
  name: string
  invoke: () => Promise<Response>
}

const ROUTE_CASES: RouteCase[] = [
  {
    name: 'GET /api/emails/[emailId]',
    invoke: async () => {
      const { GET } = await import('@/app/api/emails/[emailId]/route')
      return GET(jsonRequest('/api/emails/e1', 'GET'), { params: Promise.resolve({ emailId: 'e1' }) })
    },
  },
  {
    name: 'GET /api/clients',
    invoke: async () => {
      const { GET } = await import('@/app/api/clients/route')
      return GET(jsonRequest('/api/clients', 'GET'))
    },
  },
  {
    name: 'POST /api/clients',
    invoke: async () => {
      const { POST } = await import('@/app/api/clients/route')
      return POST(jsonRequest('/api/clients', 'POST', { name: 'X' }))
    },
  },
  {
    name: 'GET /api/clients/[clientId]',
    invoke: async () => {
      const { GET } = await import('@/app/api/clients/[clientId]/route')
      return GET(jsonRequest('/api/clients/c1', 'GET'), { params: Promise.resolve({ clientId: 'c1' }) })
    },
  },
  {
    name: 'GET /api/invitations',
    invoke: async () => {
      const { GET } = await import('@/app/api/invitations/route')
      return GET(jsonRequest('/api/invitations', 'GET'))
    },
  },
  {
    name: 'POST /api/invitations (mesmo para convidar CLIENT)',
    invoke: async () => {
      const { POST } = await import('@/app/api/invitations/route')
      return POST(jsonRequest('/api/invitations', 'POST', { email: 'a@b.pt', role: 'CLIENT', clientId: 'c1' }))
    },
  },
  {
    name: 'GET /api/documents (listagem interna)',
    invoke: async () => {
      const { GET } = await import('@/app/api/documents/route')
      return GET(jsonRequest('/api/documents', 'GET'))
    },
  },
  {
    name: 'GET /api/documents/[documentId] (DTO interno)',
    invoke: async () => {
      const { GET } = await import('@/app/api/documents/[documentId]/route')
      return GET(jsonRequest('/api/documents/d1', 'GET'), { params: Promise.resolve({ documentId: 'd1' }) })
    },
  },
  {
    name: 'POST /api/documents/upload (upload interno)',
    invoke: async () => {
      const { POST } = await import('@/app/api/documents/upload/route')
      return POST(jsonRequest('/api/documents/upload', 'POST', {}))
    },
  },
  {
    name: 'POST /api/documents/import',
    invoke: async () => {
      const { POST } = await import('@/app/api/documents/import/route')
      return POST(jsonRequest('/api/documents/import', 'POST', {}))
    },
  },
  {
    name: 'POST /api/documents/[id]/review',
    invoke: async () => {
      const { POST } = await import('@/app/api/documents/[documentId]/review/route')
      return POST(jsonRequest('/api/documents/d1/review', 'POST', {}), {
        params: Promise.resolve({ documentId: 'd1' }),
      })
    },
  },
  {
    name: 'POST /api/documents/review/bulk',
    invoke: async () => {
      const { POST } = await import('@/app/api/documents/review/bulk/route')
      return POST(jsonRequest('/api/documents/review/bulk', 'POST', {}))
    },
  },
  {
    name: 'POST /api/documents/[id]/reopen',
    invoke: async () => {
      const { POST } = await import('@/app/api/documents/[documentId]/reopen/route')
      return POST(jsonRequest('/api/documents/d1/reopen', 'POST', {}), {
        params: Promise.resolve({ documentId: 'd1' }),
      })
    },
  },
  {
    name: 'GET /api/attachments/[attachmentId]',
    invoke: async () => {
      const { GET } = await import('@/app/api/attachments/[attachmentId]/route')
      return GET(jsonRequest('/api/attachments/a1', 'GET'), {
        params: Promise.resolve({ attachmentId: 'a1' }),
      })
    },
  },
  {
    name: 'GET /api/exports',
    invoke: async () => {
      const { GET } = await import('@/app/api/exports/route')
      return GET(jsonRequest('/api/exports', 'GET'))
    },
  },
  {
    name: 'POST /api/exports',
    invoke: async () => {
      const { POST } = await import('@/app/api/exports/route')
      return POST(jsonRequest('/api/exports', 'POST', { periodFrom: '2026-01', periodTo: '2026-01' }))
    },
  },
  {
    name: 'GET /api/exports/[batchId]/download',
    invoke: async () => {
      const { GET } = await import('@/app/api/exports/[batchId]/download/route')
      return GET(jsonRequest('/api/exports/b1/download', 'GET'), {
        params: Promise.resolve({ batchId: 'b1' }),
      })
    },
  },
  {
    name: 'GET /api/supplier-rules',
    invoke: async () => {
      const { GET } = await import('@/app/api/supplier-rules/route')
      return GET(jsonRequest('/api/supplier-rules', 'GET'))
    },
  },
  {
    name: 'POST /api/supplier-rules',
    invoke: async () => {
      const { POST } = await import('@/app/api/supplier-rules/route')
      return POST(jsonRequest('/api/supplier-rules', 'POST', { supplierNif: '508234567' }))
    },
  },
  {
    name: 'GET /api/bank/accounts',
    invoke: async () => {
      const { GET } = await import('@/app/api/bank/accounts/route')
      return GET(jsonRequest('/api/bank/accounts', 'GET'))
    },
  },
  {
    name: 'GET /api/bank/transactions',
    invoke: async () => {
      const { GET } = await import('@/app/api/bank/transactions/route')
      return GET(jsonRequest('/api/bank/transactions', 'GET'))
    },
  },
  {
    name: 'POST /api/bank/imports',
    invoke: async () => {
      const { POST } = await import('@/app/api/bank/imports/route')
      return POST(jsonRequest('/api/bank/imports', 'POST', {}))
    },
  },
  {
    name: 'GET /api/bank/rules',
    invoke: async () => {
      const { GET } = await import('@/app/api/bank/rules/route')
      return GET(jsonRequest('/api/bank/rules', 'GET'))
    },
  },
  {
    name: 'POST /api/bank/transactions/[id]/reconcile',
    invoke: async () => {
      const { POST } = await import('@/app/api/bank/transactions/[transactionId]/reconcile/route')
      return POST(jsonRequest('/api/bank/transactions/t1/reconcile', 'POST', {}), {
        params: Promise.resolve({ transactionId: 't1' }),
      })
    },
  },
  {
    name: 'PATCH /api/users/[userId]',
    invoke: async () => {
      const { PATCH } = await import('@/app/api/users/[userId]/route')
      return PATCH(jsonRequest('/api/users/u1', 'PATCH', { role: 'VIEWER' }), {
        params: Promise.resolve({ userId: 'u1' }),
      })
    },
  },
  // TOConline integration v1 — new internal routes join the denial loop
  {
    name: 'GET /api/clients/[clientId]/toconline',
    invoke: async () => {
      const { GET } = await import('@/app/api/clients/[clientId]/toconline/route')
      return GET(jsonRequest('/api/clients/c1/toconline', 'GET'), {
        params: Promise.resolve({ clientId: 'c1' }),
      })
    },
  },
  {
    name: 'PUT /api/clients/[clientId]/toconline',
    invoke: async () => {
      const { PUT } = await import('@/app/api/clients/[clientId]/toconline/route')
      return PUT(
        jsonRequest('/api/clients/c1/toconline', 'PUT', {
          oauthUrl: 'https://x.test/oauth',
          apiUrl: 'https://x.test',
          oauthClientId: 'id',
          oauthClientSecret: 'secret',
        }),
        { params: Promise.resolve({ clientId: 'c1' }) },
      )
    },
  },
  {
    name: 'POST /api/clients/[clientId]/toconline/dry-run',
    invoke: async () => {
      const { POST } = await import('@/app/api/clients/[clientId]/toconline/dry-run/route')
      return POST(jsonRequest('/api/clients/c1/toconline/dry-run', 'POST', { dryRun: false }), {
        params: Promise.resolve({ clientId: 'c1' }),
      })
    },
  },
  {
    name: 'POST /api/toconline/push',
    invoke: async () => {
      const { POST } = await import('@/app/api/toconline/push/route')
      return POST(jsonRequest('/api/toconline/push', 'POST', { clientId: 'c1', documentIds: ['d1'] }))
    },
  },
  {
    name: 'GET /api/documents/[documentId]/toconline',
    invoke: async () => {
      const { GET } = await import('@/app/api/documents/[documentId]/toconline/route')
      return GET(jsonRequest('/api/documents/d1/toconline', 'GET'), {
        params: Promise.resolve({ documentId: 'd1' }),
      })
    },
  },
  // TOConline pull slice — new internal routes join the denial loop
  {
    name: 'PATCH /api/clients/[clientId]/toconline (capabilities)',
    invoke: async () => {
      const { PATCH } = await import('@/app/api/clients/[clientId]/toconline/route')
      return PATCH(jsonRequest('/api/clients/c1/toconline', 'PATCH', { pullEnabled: true }), {
        params: Promise.resolve({ clientId: 'c1' }),
      })
    },
  },
  {
    name: 'POST /api/clients/[clientId]/toconline/pull',
    invoke: async () => {
      const { POST } = await import('@/app/api/clients/[clientId]/toconline/pull/route')
      return POST(jsonRequest('/api/clients/c1/toconline/pull', 'POST', {}), {
        params: Promise.resolve({ clientId: 'c1' }),
      })
    },
  },
]

describe('P1 — CLIENT negado em TODAS as rotas internas (loop sobre o route map) [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    setSession(clientSession())
  })

  it.each(ROUTE_CASES.map((c) => [c.name, c] as const))('%s → 403/404', async (_name, routeCase) => {
    const res = await routeCase.invoke()
    expect([403, 404], `${routeCase.name} devolveu ${res.status}`).toContain(res.status)
  })
})

describe('P1 — rate limiting mais apertado para CLIENT', () => {
  const ENV_KEY = 'RATE_LIMIT_CLIENT_API_PER_MIN'
  let previous: string | undefined

  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    previous = process.env[ENV_KEY]
  })

  afterEach(() => {
    if (previous === undefined) delete process.env[ENV_KEY]
    else process.env[ENV_KEY] = previous
  })

  it('P1.j — CLIENT tem limite próprio por minuto (30/min default, env-configurável)', async () => {
    process.env[ENV_KEY] = '2'
    setSession(clientSession())

    const { GET } = await import('@/app/api/documents/route')
    const first = await GET(jsonRequest('/api/documents', 'GET'))
    const second = await GET(jsonRequest('/api/documents', 'GET'))
    const third = await GET(jsonRequest('/api/documents', 'GET'))

    // As duas primeiras passam o rate limit (e caem no deny 404 do RBAC);
    // a terceira tem de ser 429 — o limite de CLIENT é por minuto, não por hora.
    expect([403, 404]).toContain(first.status)
    expect([403, 404]).toContain(second.status)
    expect(third.status).toBe(429)

    // Um user interno não é afetado pelo limite de CLIENT
    resetRateLimits()
    const { officeA, ownerA } = await makeTwoOffices()
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    for (let i = 0; i < 3; i += 1) {
      const res = await GET(jsonRequest('/api/documents', 'GET'))
      expect(res.status).toBe(200)
    }
  })
})
