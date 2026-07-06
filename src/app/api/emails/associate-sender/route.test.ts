import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    inboundEmail: {
      updateMany: vi.fn(),
    },
  },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from './route'
import { NextRequest } from 'next/server'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/emails/associate-sender', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeSession(officeId = 'office-1') {
  return { user: { officeId, id: 'user-1', email: 'user@test.pt', role: 'ACCOUNTANT' } }
}

function makeClient(knownEmails: string[] = []) {
  return {
    id: 'client-123',
    officeId: 'office-1',
    knownEmails,
  }
}

describe('POST /api/emails/associate-sender', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue(makeSession() as never)
    vi.mocked(prisma.client.findFirst).mockResolvedValue(makeClient() as never)
    vi.mocked(prisma.client.update).mockResolvedValue({} as never)
    vi.mocked(prisma.inboundEmail.updateMany).mockResolvedValue({ count: 3 })
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const res = await POST(makeRequest({ fromEmail: 'joao@empresa.pt', clientId: 'client-123' }))

    expect(res.status).toBe(401)
  })

  it('returns 422 when fromEmail is not a valid email', async () => {
    const res = await POST(makeRequest({ fromEmail: 'not-an-email', clientId: 'client-123' }))
    const body = await res.json() as { error: string }

    expect(res.status).toBe(422)
    expect(body.error).toBe('Dados inválidos')
  })

  it('returns 422 when clientId is missing', async () => {
    const res = await POST(makeRequest({ fromEmail: 'joao@empresa.pt' }))

    expect(res.status).toBe(422)
  })

  it('returns 404 when client does not exist in this office', async () => {
    vi.mocked(prisma.client.findFirst).mockResolvedValue(null)

    const res = await POST(makeRequest({ fromEmail: 'joao@empresa.pt', clientId: 'client-123' }))

    expect(res.status).toBe(404)
  })

  it('adds fromEmail to client knownEmails and returns emailsMatched count', async () => {
    const res = await POST(makeRequest({ fromEmail: 'Joao@Empresa.PT', clientId: 'client-123' }))
    const body = await res.json() as { success: boolean; data: { emailsMatched: number } }

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.emailsMatched).toBe(3)

    // Email normalised to lowercase
    expect(vi.mocked(prisma.client.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { knownEmails: { push: 'joao@empresa.pt' } },
      })
    )
  })

  it('retroactively matches all unmatched emails from this sender', async () => {
    await POST(makeRequest({ fromEmail: 'joao@empresa.pt', clientId: 'client-123' }))

    expect(vi.mocked(prisma.inboundEmail.updateMany)).toHaveBeenCalledWith({
      where: {
        emailAccount: { officeId: 'office-1' },
        fromEmail: { equals: 'joao@empresa.pt', mode: 'insensitive' },
        clientId: null,
      },
      data: { clientId: 'client-123', clientMatchScore: 1.0 },
    })
  })

  it('skips client.update when email already in knownEmails', async () => {
    vi.mocked(prisma.client.findFirst).mockResolvedValue(
      makeClient(['joao@empresa.pt']) as never
    )

    await POST(makeRequest({ fromEmail: 'joao@empresa.pt', clientId: 'client-123' }))

    expect(vi.mocked(prisma.client.update)).not.toHaveBeenCalled()
    // But still runs retroactive match
    expect(vi.mocked(prisma.inboundEmail.updateMany)).toHaveBeenCalled()
  })
})
