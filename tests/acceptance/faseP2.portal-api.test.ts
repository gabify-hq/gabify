import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeClient, makeUser } from '../helpers/factories'
import { setSession, authMockFactory, type TestSessionUser } from '../helpers/session'
import { fixturePath } from '../fixtures/generate'
import { NextRequest } from 'next/server'
import { resetRateLimits } from '@/server/rate-limit'
import type { Client, Office, User } from '@prisma/client'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())
vi.mock('@/lib/anthropic', async () => (await import('../mocks/ai')).aiMockFactory())

const queueAddMock = vi.fn(async () => ({}))
vi.mock('@/lib/redis', () => ({
  getEmailSyncQueue: () => ({ add: queueAddMock }),
  getDocumentParseQueue: () => ({ add: queueAddMock }),
  QUEUE_EMAIL_SYNC: 'email-sync',
  QUEUE_DOCUMENT_PARSE: 'document-parse',
  QUEUE_SUBSCRIPTION_RENEWAL: 'subscription-renewal',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

import { getSignedDownloadUrl } from '@/lib/r2'

// DTO público do portal (P2): chaves EXATAS — qualquer campo a mais é leak
const PORTAL_DTO_KEYS = ['filename', 'id', 'origin', 'status', 'submittedAt'] as const
const PUBLIC_STATUSES = ['PROCESSING', 'PROCESSED', 'RETURNED'] as const
const INTERNAL_MARKERS = [
  'NEEDS_REVIEW', 'PRE_VALIDATED', 'VALIDATED', 'EXPORTED', 'PENDING_CLASSIFICATION',
  'DUPLICATE_SUSPECT', 'WRONG_CLIENT_SUSPECT', 'SENDER_UNVERIFIED',
  'confidence', 'flags', 'sncSource', 'supplierNif', 'vatBreakdown', 'accountCode',
]

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function uploadRequest(
  files: Array<{ name: string; data: Buffer }>,
  extra: Record<string, string> = {},
) {
  const form = new FormData()
  for (const f of files) {
    form.append('files', new File([new Uint8Array(f.data)], f.name, { type: 'application/octet-stream' }))
  }
  for (const [key, value] of Object.entries(extra)) form.append(key, value)
  return new NextRequest('http://localhost:3000/api/portal/documents/upload', {
    method: 'POST',
    body: form,
  })
}

interface PortalContext {
  officeA: Office
  officeB: Office
  clientX: Client
  clientY: Client
  portalUser: User
  ownerA: User
}

async function makePortalContext(): Promise<PortalContext> {
  const { officeA, officeB, ownerA } = await makeTwoOffices()
  const clientX = await makeClient({ officeId: officeA.id, name: 'Empresa X' })
  const clientY = await makeClient({ officeId: officeA.id, name: 'Empresa Y' })
  const portalUser = await makeUser({
    officeId: officeA.id,
    role: 'CLIENT',
    clientId: clientX.id,
    email: 'portal-x@empresa.pt',
  })
  return { officeA, officeB, clientX, clientY, portalUser, ownerA }
}

function portalSession(ctx: PortalContext): TestSessionUser {
  return {
    id: ctx.portalUser.id,
    email: ctx.portalUser.email,
    officeId: ctx.officeA.id,
    role: 'CLIENT',
    clientId: ctx.clientX.id,
  }
}

async function makeDoc(params: {
  officeId: string
  clientId: string
  status?: string
  flags?: string[]
  filename?: string
  deletedAt?: Date | null
  r2Key?: string | null
}) {
  return prisma.document.create({
    data: {
      officeId: params.officeId,
      clientId: params.clientId,
      source: 'MANUAL_UPLOAD',
      type: 'INVOICE_RECEIVED',
      status: (params.status ?? 'NEEDS_REVIEW') as never,
      flags: params.flags ?? [],
      originalFilename: params.filename ?? 'fatura.pdf',
      confidence: 0.93,
      supplierNif: '508234567',
      vatBreakdown: [{ rate: 23, baseCents: 10000, vatCents: 2300 }],
      deletedAt: params.deletedAt ?? null,
      r2Key: params.r2Key === undefined ? null : params.r2Key,
    },
  })
}

async function listPortalDocuments(query = ''): Promise<Response> {
  const { GET } = await import('@/app/api/portal/documents/route')
  return GET(jsonRequest(`/api/portal/documents${query}`, 'GET'))
}

describe('P2 — DTO do portal com masking [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    queueAddMock.mockClear()
  })

  it('P2.a [INV] — shape estrito: chaves exatas, nenhum campo interno escapa (proteção anti-spread)', async () => {
    const ctx = await makePortalContext()
    await makeDoc({ officeId: ctx.officeA.id, clientId: ctx.clientX.id, status: 'NEEDS_REVIEW', flags: ['DUPLICATE_SUSPECT'] })
    await makeDoc({ officeId: ctx.officeA.id, clientId: ctx.clientX.id, status: 'VALIDATED' })
    setSession(portalSession(ctx))

    const res = await listPortalDocuments()
    expect(res.status).toBe(200)
    const body = await res.json()
    const items = body.data.items as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)

    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual([...PORTAL_DTO_KEYS])
      expect(PUBLIC_STATUSES).toContain(item.status)
      expect(['UPLOAD', 'EMAIL']).toContain(item.origin)
    }

    // Nenhum marcador interno em lado nenhum da resposta
    const raw = JSON.stringify(body)
    for (const marker of INTERNAL_MARKERS) {
      expect(raw, `resposta contém marcador interno "${marker}"`).not.toContain(marker)
    }
  })

  it('P2.b [INV] — mapa de estados público: internos → Em processamento; VALIDATED/EXPORTED → Processado; rejeitado → Devolvido', async () => {
    const ctx = await makePortalContext()
    const cases: Array<{ status: string; flags?: string[]; deletedAt?: Date; expected: string; name: string }> = [
      { status: 'NEEDS_REVIEW', expected: 'PROCESSING', name: 'a-rever.pdf' },
      { status: 'PRE_VALIDATED', expected: 'PROCESSING', name: 'pre-validado.pdf' },
      { status: 'NEEDS_REVIEW', flags: ['DUPLICATE_SUSPECT'], expected: 'PROCESSING', name: 'duplicado.pdf' },
      { status: 'NEEDS_REVIEW', flags: ['WRONG_CLIENT_SUSPECT'], expected: 'PROCESSING', name: 'empresa-errada.pdf' },
      { status: 'PENDING_CLASSIFICATION', expected: 'PROCESSING', name: 'novo.pdf' },
      { status: 'VALIDATED', expected: 'PROCESSED', name: 'validado.pdf' },
      { status: 'EXPORTED', expected: 'PROCESSED', name: 'exportado.pdf' },
      { status: 'NEEDS_REVIEW', deletedAt: new Date(), expected: 'RETURNED', name: 'devolvido.pdf' },
    ]
    for (const c of cases) {
      await makeDoc({
        officeId: ctx.officeA.id, clientId: ctx.clientX.id,
        status: c.status, flags: c.flags, deletedAt: c.deletedAt, filename: c.name,
      })
    }
    setSession(portalSession(ctx))

    const res = await listPortalDocuments()
    const items = (await res.json()).data.items as Array<{ filename: string; status: string }>
    expect(items).toHaveLength(cases.length)
    for (const c of cases) {
      const item = items.find((i) => i.filename === c.name)
      expect(item, `documento ${c.name} em falta na lista`).toBeDefined()
      expect(item!.status, c.name).toBe(c.expected)
    }
  })

  it('P2.c [INV] — âmbito: documentos de outro cliente (mesmo office) e de outro office NUNCA aparecem', async () => {
    const ctx = await makePortalContext()
    await makeDoc({ officeId: ctx.officeA.id, clientId: ctx.clientX.id, filename: 'meu.pdf' })
    await makeDoc({ officeId: ctx.officeA.id, clientId: ctx.clientY.id, filename: 'do-y.pdf' })
    const clientB = await makeClient({ officeId: ctx.officeB.id })
    await makeDoc({ officeId: ctx.officeB.id, clientId: clientB.id, filename: 'office-b.pdf' })
    setSession(portalSession(ctx))

    const res = await listPortalDocuments()
    const items = (await res.json()).data.items as Array<{ filename: string }>
    expect(items.map((i) => i.filename)).toEqual(['meu.pdf'])
  })

  it('P2.d — paginação (cursor) e pesquisa simples por nome', async () => {
    const ctx = await makePortalContext()
    for (let i = 1; i <= 3; i += 1) {
      await makeDoc({ officeId: ctx.officeA.id, clientId: ctx.clientX.id, filename: `fatura-${i}.pdf` })
    }
    await makeDoc({ officeId: ctx.officeA.id, clientId: ctx.clientX.id, filename: 'recibo.pdf' })
    setSession(portalSession(ctx))

    const page1 = await (await listPortalDocuments('?limit=2')).json()
    expect(page1.data.items).toHaveLength(2)
    expect(page1.data.nextCursor).toBeTruthy()

    const page2 = await (await listPortalDocuments(`?limit=2&cursor=${page1.data.nextCursor}`)).json()
    expect(page2.data.items.length).toBeGreaterThanOrEqual(2)

    const search = await (await listPortalDocuments('?q=recibo')).json()
    expect(search.data.items).toHaveLength(1)
    expect(search.data.items[0].filename).toBe('recibo.pdf')
  })
})

describe('P2 — upload do portal [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    queueAddMock.mockClear()
  })

  it('P2.e [INV] — clientId do body é IGNORADO: o documento fica sempre no clientId do user', async () => {
    const ctx = await makePortalContext()
    setSession(portalSession(ctx))

    const { POST } = await import('@/app/api/portal/documents/upload/route')
    const res = await POST(
      uploadRequest(
        [{ name: 'fatura.pdf', data: readFileSync(fixturePath('fx-qr-single.pdf')) }],
        { clientId: ctx.clientY.id }, // tentativa de escrever no cliente Y
      ),
    )
    expect(res.status).toBe(201)

    const docs = await prisma.document.findMany()
    expect(docs).toHaveLength(1)
    expect(docs[0].clientId).toBe(ctx.clientX.id)
    expect(docs[0].source).toBe('PORTAL_UPLOAD')
    expect(docs[0].uploadedByUserId).toBe(ctx.portalUser.id)

    // AuditLog com o user CLIENT, e job de parse enfileirado
    const audit = await prisma.auditLog.findFirst({
      where: { officeId: ctx.officeA.id, userId: ctx.portalUser.id, entityId: docs[0].id },
    })
    expect(audit).not.toBeNull()
    expect(queueAddMock).toHaveBeenCalledTimes(1)
  })

  it('P2.f — validações do pipeline mantêm-se: magic bytes errados → rejeitado', async () => {
    const ctx = await makePortalContext()
    setSession(portalSession(ctx))

    const { POST } = await import('@/app/api/portal/documents/upload/route')
    const res = await POST(
      uploadRequest([{ name: 'fatura.pdf', data: readFileSync(fixturePath('fx-fake-pdf.exe.pdf')) }]),
    )
    expect([415, 422]).toContain(res.status)
    expect(await prisma.document.count()).toBe(0)
  })

  it('P2.g — rate limit de upload do CLIENT: 10/min (env-configurável)', async () => {
    const ENV_KEY = 'RATE_LIMIT_CLIENT_UPLOAD_PER_MIN'
    const previous = process.env[ENV_KEY]
    process.env[ENV_KEY] = '1'
    try {
      const ctx = await makePortalContext()
      setSession(portalSession(ctx))
      const pdf = readFileSync(fixturePath('fx-qr-single.pdf'))

      const { POST } = await import('@/app/api/portal/documents/upload/route')
      const first = await POST(uploadRequest([{ name: 'a.pdf', data: pdf }]))
      expect(first.status).toBe(201)
      const second = await POST(uploadRequest([{ name: 'b.pdf', data: pdf }]))
      expect(second.status).toBe(429)
    } finally {
      if (previous === undefined) delete process.env[ENV_KEY]
      else process.env[ENV_KEY] = previous
    }
  })
})

describe('P2 — preview por signed URL [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
  })

  it('P2.h [INV] — URL apenas de ficheiros do próprio clientId, TTL 5 minutos; de outro cliente → 404', async () => {
    const ctx = await makePortalContext()
    const mine = await makeDoc({
      officeId: ctx.officeA.id, clientId: ctx.clientX.id, r2Key: 'a/mine.pdf', filename: 'mine.pdf',
    })
    const theirs = await makeDoc({
      officeId: ctx.officeA.id, clientId: ctx.clientY.id, r2Key: 'a/theirs.pdf', filename: 'theirs.pdf',
    })
    setSession(portalSession(ctx))

    const { GET } = await import('@/app/api/portal/documents/[documentId]/download/route')

    const ok = await GET(jsonRequest(`/api/portal/documents/${mine.id}/download`, 'GET'), {
      params: Promise.resolve({ documentId: mine.id }),
    })
    expect(ok.status).toBe(200)
    expect((await ok.json()).data.url).toContain('http')
    // TTL 5 min (300s) — nunca o default interno de 15 min
    expect(vi.mocked(getSignedDownloadUrl)).toHaveBeenCalledWith('a/mine.pdf', 300)

    const denied = await GET(jsonRequest(`/api/portal/documents/${theirs.id}/download`, 'GET'), {
      params: Promise.resolve({ documentId: theirs.id }),
    })
    expect(denied.status).toBe(404)
  })
})

describe('P2 — users internos nunca usam a API do portal (isolamento simétrico)', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
  })

  it('OWNER/VIEWER → 403/404 em todas as rotas do portal', async () => {
    const ctx = await makePortalContext()
    for (const role of ['OWNER', 'VIEWER'] as const) {
      const user = await makeUser({ officeId: ctx.officeA.id, role })
      setSession({ id: user.id, email: user.email, officeId: ctx.officeA.id, role })

      const list = await listPortalDocuments()
      expect([403, 404], `${role} × GET /api/portal/documents`).toContain(list.status)

      const { POST } = await import('@/app/api/portal/documents/upload/route')
      const up = await POST(
        uploadRequest([{ name: 'x.pdf', data: readFileSync(fixturePath('fx-qr-single.pdf')) }]),
      )
      expect([403, 404], `${role} × POST /api/portal/documents/upload`).toContain(up.status)

      const { GET: dl } = await import('@/app/api/portal/documents/[documentId]/download/route')
      const d = await dl(jsonRequest('/api/portal/documents/d1/download', 'GET'), {
        params: Promise.resolve({ documentId: 'd1' }),
      })
      expect([403, 404], `${role} × GET download`).toContain(d.status)
    }
  })
})
