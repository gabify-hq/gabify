import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeEmailAccount } from '../helpers/factories'
import { decryptToken, encryptToken } from '@/lib/crypto'

/**
 * AUDIT F2.6 — refresh de tokens OAuth serializado por conta (REVIEW_ISSUES A-3).
 * Dois workers a refrescar em simultâneo geravam duplo refresh; com rotação de
 * refresh tokens (Microsoft roda sempre) o perdedor gravava um token já
 * consumido e a conta ficava em invalid_grant até re-autenticação manual.
 * Contrato: N chamadas concorrentes → UM refresh; os restantes reutilizam.
 */

function stubTokenEndpoint(counterRef: { count: number }, delayMs = 150) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('oauth2.googleapis.com/token') || url.includes('login.microsoftonline.com')) {
      counterRef.count += 1
      const n = counterRef.count
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return new Response(
        JSON.stringify({
          access_token: `tok-${n}`,
          refresh_token: `refresh-${n}`,
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    throw new Error(`Unexpected fetch in test: ${url}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('AUDIT-F2.6 refresh de token serializado por conta', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Gmail: 2 chamadas concorrentes com token expirado → 1 único refresh, ambos usam o mesmo token', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'GMAIL' })
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { gmailTokenExpiry: new Date(Date.now() - 1000) }, // já expirado
    })

    const counter = { count: 0 }
    stubTokenEndpoint(counter)

    const { ensureFreshGmailToken } = await import('@/server/email-providers/token-refresh')
    const [a, b] = await Promise.all([
      ensureFreshGmailToken(account.id),
      ensureFreshGmailToken(account.id),
    ])

    expect(counter.count).toBe(1)
    expect(a).toBe('tok-1')
    expect(b).toBe('tok-1')

    const fresh = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    expect(decryptToken(fresh.gmailAccessToken!)).toBe('tok-1')
    expect(decryptToken(fresh.gmailRefreshToken!)).toBe('refresh-1')
    expect(fresh.gmailTokenExpiry!.getTime()).toBeGreaterThan(Date.now())
  })

  it('Outlook: 3 chamadas concorrentes → 1 único refresh (rotação de refresh token preservada)', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'OUTLOOK' })
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { outlookTokenExpiry: new Date(Date.now() - 1000) },
    })

    const counter = { count: 0 }
    stubTokenEndpoint(counter)

    const { ensureFreshOutlookToken } = await import('@/server/email-providers/token-refresh')
    const results = await Promise.all([
      ensureFreshOutlookToken(account.id),
      ensureFreshOutlookToken(account.id),
      ensureFreshOutlookToken(account.id),
    ])

    expect(counter.count).toBe(1)
    expect(new Set(results)).toEqual(new Set(['tok-1']))

    const fresh = await prisma.emailAccount.findUniqueOrThrow({ where: { id: account.id } })
    expect(decryptToken(fresh.outlookRefreshToken!)).toBe('refresh-1')
  })

  it('token ainda válido → devolve sem tocar na rede', async () => {
    const office = await makeOffice()
    const account = await makeEmailAccount({ officeId: office.id, provider: 'GMAIL' })
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: {
        gmailAccessToken: encryptToken('ainda-bom'),
        gmailTokenExpiry: new Date(Date.now() + 3600_000),
      },
    })

    const counter = { count: 0 }
    const fetchMock = stubTokenEndpoint(counter)

    const { ensureFreshGmailToken } = await import('@/server/email-providers/token-refresh')
    const token = await ensureFreshGmailToken(account.id)

    expect(token).toBe('ainda-bom')
    expect(counter.count).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
