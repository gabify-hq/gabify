import { describe, it, expect, vi, beforeEach } from 'vitest'
import { matchClientByEmail, assignClientToEmail } from './client-matching'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: {
      findMany: vi.fn(),
    },
    inboundEmail: {
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'

const mockClients = [
  {
    id: 'client-abc',
    knownEmails: ['joao@empresa.pt', 'faturacao@empresa.pt'],
    emailDomains: ['empresa.pt'],
  },
  {
    id: 'client-xyz',
    knownEmails: ['maria@outra.com'],
    emailDomains: ['outra.com'],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.client.findMany).mockResolvedValue(mockClients as never)
})

describe('matchClientByEmail', () => {
  it('returns exact match (score 1.0) when email is in knownEmails', async () => {
    const result = await matchClientByEmail('office-1', 'joao@empresa.pt')

    expect(result.clientId).toBe('client-abc')
    expect(result.score).toBe(1.0)
    expect(result.matchedBy).toBe('known_email')
  })

  it('is case-insensitive for known email match', async () => {
    const result = await matchClientByEmail('office-1', 'JOAO@EMPRESA.PT')

    expect(result.clientId).toBe('client-abc')
    expect(result.matchedBy).toBe('known_email')
  })

  it('returns domain match (score 0.8) when email domain matches emailDomains', async () => {
    const result = await matchClientByEmail('office-1', 'unknown@empresa.pt')

    expect(result.clientId).toBe('client-abc')
    expect(result.score).toBe(0.8)
    expect(result.matchedBy).toBe('domain')
  })

  it('is case-insensitive for domain match', async () => {
    const result = await matchClientByEmail('office-1', 'test@OUTRA.COM')

    expect(result.clientId).toBe('client-xyz')
    expect(result.matchedBy).toBe('domain')
  })

  it('prefers exact email match over domain match', async () => {
    // joao@empresa.pt matches both knownEmails AND emailDomains of client-abc
    const result = await matchClientByEmail('office-1', 'joao@empresa.pt')

    expect(result.matchedBy).toBe('known_email')
    expect(result.score).toBe(1.0)
  })

  it('returns no match when email and domain are unknown', async () => {
    const result = await matchClientByEmail('office-1', 'nobody@random.io')

    expect(result.clientId).toBeNull()
    expect(result.score).toBe(0)
    expect(result.matchedBy).toBe('none')
  })

  it('returns no match for malformed email without @', async () => {
    const result = await matchClientByEmail('office-1', 'notanemail')

    expect(result.clientId).toBeNull()
    expect(result.matchedBy).toBe('none')
  })

  it('queries only clients for the given officeId', async () => {
    await matchClientByEmail('office-99', 'joao@empresa.pt')

    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ officeId: 'office-99' }),
      })
    )
  })
})

describe('assignClientToEmail', () => {
  it('updates the inboundEmail with clientId and score', async () => {
    vi.mocked(prisma.inboundEmail.update).mockResolvedValue({} as never)

    await assignClientToEmail('email-1', {
      clientId: 'client-abc',
      score: 0.8,
      matchedBy: 'domain',
    })

    expect(prisma.inboundEmail.update).toHaveBeenCalledWith({
      where: { id: 'email-1' },
      data: { clientId: 'client-abc', clientMatchScore: 0.8 },
    })
  })

  it('sets clientId to null when no match found', async () => {
    vi.mocked(prisma.inboundEmail.update).mockResolvedValue({} as never)

    await assignClientToEmail('email-1', {
      clientId: null,
      score: 0,
      matchedBy: 'none',
    })

    expect(prisma.inboundEmail.update).toHaveBeenCalledWith({
      where: { id: 'email-1' },
      data: { clientId: null, clientMatchScore: 0 },
    })
  })
})
