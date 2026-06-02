import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PATCH, GET } from './route'
import { NextRequest } from 'next/server'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/clients/client-123', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const PARAMS = Promise.resolve({ clientId: 'client-123' })

function makeSession(officeId = 'office-1') {
  return { user: { officeId, id: 'user-1' } }
}

function makeExistingClient() {
  return {
    id: 'client-123',
    officeId: 'office-1',
    name: 'Empresa Exemplo',
    nif: '123456789',
    email: 'geral@empresa.pt',
    emailDomains: ['empresa.pt'],
    knownEmails: ['geral@empresa.pt'],
    notes: null,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/clients/[clientId]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue(makeSession() as never)
    vi.mocked(prisma.client.findFirst).mockResolvedValue(makeExistingClient() as never)
    vi.mocked(prisma.client.update).mockResolvedValue({ ...makeExistingClient(), name: 'Updated' } as never)
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const res = await PATCH(makeRequest({ name: 'Test' }), { params: PARAMS })

    expect(res.status).toBe(401)
  })

  it('returns 404 when client does not exist in this office', async () => {
    vi.mocked(prisma.client.findFirst).mockResolvedValue(null)

    const res = await PATCH(makeRequest({ name: 'Test' }), { params: PARAMS })

    expect(res.status).toBe(404)
  })

  it('returns 422 when name is too short', async () => {
    const res = await PATCH(makeRequest({ name: 'X' }), { params: PARAMS })
    const body = await res.json() as { error: string }

    expect(res.status).toBe(422)
    expect(body.error).toBe('Dados inválidos')
  })

  it('returns 422 when NIF has wrong format', async () => {
    const res = await PATCH(
      makeRequest({ name: 'Empresa', nif: '12345' }),
      { params: PARAMS }
    )

    expect(res.status).toBe(422)
  })

  it('updates client and returns 200 with updated data', async () => {
    const update = {
      name: 'Empresa Actualizada',
      nif: '987654321',
      email: 'novo@empresa.pt',
      emailDomains: ['empresa.pt', 'empresa.com'],
      knownEmails: ['novo@empresa.pt', 'geral@empresa.pt'],
      notes: 'Nota actualizada',
    }

    vi.mocked(prisma.client.update).mockResolvedValue({
      id: 'client-123',
      ...update,
      createdAt: new Date(),
    } as never)

    const res = await PATCH(makeRequest(update), { params: PARAMS })
    const body = await res.json() as { success: boolean; data: typeof update }

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('Empresa Actualizada')
    expect(body.data.knownEmails).toEqual(['novo@empresa.pt', 'geral@empresa.pt'])
  })

  it('queries client scoped to authenticated office', async () => {
    await PATCH(makeRequest({ name: 'Test Cliente' }), { params: PARAMS })

    expect(vi.mocked(prisma.client.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'client-123',
          officeId: 'office-1',
          deletedAt: null,
        }),
      })
    )
  })

  it('treats empty NIF string as null', async () => {
    await PATCH(makeRequest({ name: 'Empresa', nif: '' }), { params: PARAMS })

    expect(vi.mocked(prisma.client.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nif: null }),
      })
    )
  })

  it('treats empty email string as null', async () => {
    await PATCH(makeRequest({ name: 'Empresa', email: '' }), { params: PARAMS })

    expect(vi.mocked(prisma.client.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: null }),
      })
    )
  })
})

describe('GET /api/clients/[clientId]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue(makeSession() as never)
    vi.mocked(prisma.client.findFirst).mockResolvedValue(makeExistingClient() as never)
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const req = new NextRequest('http://localhost/api/clients/client-123')
    const res = await GET(req, { params: PARAMS })

    expect(res.status).toBe(401)
  })

  it('returns 404 when client not found', async () => {
    vi.mocked(prisma.client.findFirst).mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/clients/client-123')
    const res = await GET(req, { params: PARAMS })

    expect(res.status).toBe(404)
  })

  it('returns client data with 200', async () => {
    const req = new NextRequest('http://localhost/api/clients/client-123')
    const res = await GET(req, { params: PARAMS })
    const body = await res.json() as { success: boolean; data: { id: string } }

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('client-123')
  })
})
