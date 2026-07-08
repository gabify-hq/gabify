import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser } from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('@/lib/resend', () => ({
  resend: { emails: { send: vi.fn(async () => ({ data: { id: 'email-test' }, error: null })) } },
  FROM_EMAIL: 'no-reply@test.gabify.pt',
}))

import { GabifyAdapter } from '@/lib/auth-adapter'
import { createInvitation, revokeInvitation } from '@/server/services/invitation-service'
import { homePathFor } from '@/lib/area-redirect'
import { resetRateLimits } from '@/server/rate-limit'

/**
 * AUDIT F1.1 — /accept-invite (REVIEW_ISSUES C-1, UX jornadas 1 e 6).
 * O link enviado nos emails de convite tem de aterrar numa página real que:
 *  - valida o token e conduz ao magic link com o email do convite;
 *  - distingue expirado / já aceite / revogado / inválido em pt-PT com saída clara;
 *  - após aceitação, o utilizador aterra na área certa por role.
 */

const adapter = () => GabifyAdapter(prisma)

async function renderAcceptInvite(token?: string): Promise<string> {
  const { default: Page } = await import('@/app/accept-invite/page')
  const jsx = await Page({
    searchParams: Promise.resolve(token === undefined ? {} : { token }),
  })
  const { renderToStaticMarkup } = await import('react-dom/server')
  return renderToStaticMarkup(jsx)
}

function jsonRequest(url: string, method: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, { method })
}

describe('AUDIT-F1.1 /accept-invite', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    setSession(null)
  })

  it('convite de equipa: página válida mostra gabinete+email; aceitação aterra no dashboard autenticado', async () => {
    const office = await makeOffice('Gabinete Fátima')
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const { token } = await createInvitation({
      officeId: office.id,
      email: 'colega@gabinete.pt',
      role: 'ACCOUNTANT',
      invitedByUserId: owner.id,
    })

    // Página do convite válido: identifica o gabinete e o email convidado,
    // e conduz ao pedido do link de acesso (nunca pede password)
    const html = await renderAcceptInvite(token)
    expect(html).toContain('Gabinete Fátima')
    expect(html).toContain('colega@gabinete.pt')
    expect(html).toMatch(/link de acesso/i)

    // Magic link → adapter cria o user a partir do convite (fluxo real de callback)
    const { canRequestMagicLink } = await import('@/server/services/invitation-service')
    await expect(canRequestMagicLink('colega@gabinete.pt')).resolves.toBe(true)
    await adapter().createUser!({ id: 'ignored', email: 'colega@gabinete.pt', emailVerified: new Date() })

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'colega@gabinete.pt' } })
    expect(user.role).toBe('ACCOUNTANT')
    expect(homePathFor(user.role)).toBe('/inbox')

    // "Primeira página autenticada": rota do dashboard responde à sessão nova
    setSession({ id: user.id, email: user.email, officeId: user.officeId!, role: user.role })
    const { GET } = await import('@/app/api/clients/route')
    const res = await GET(jsonRequest('/api/clients', 'GET'))
    expect(res.status).toBe(200)
  })

  it('convite de portal (CLIENT): aceitação liga ao cliente e aterra no portal autenticado', async () => {
    const office = await makeOffice('Gabinete Fátima')
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const client = await prisma.client.create({
      data: { officeId: office.id, name: 'Restaurante O Tacho', emailDomains: [], knownEmails: [] },
    })
    const { token } = await createInvitation({
      officeId: office.id,
      email: 'gerencia@otacho.pt',
      role: 'CLIENT',
      clientId: client.id,
      invitedByUserId: owner.id,
    })

    const html = await renderAcceptInvite(token)
    expect(html).toContain('gerencia@otacho.pt')

    await adapter().createUser!({ id: 'ignored', email: 'gerencia@otacho.pt', emailVerified: new Date() })
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'gerencia@otacho.pt' } })
    expect(user.role).toBe('CLIENT')
    expect(user.clientId).toBe(client.id)
    expect(homePathFor(user.role)).toBe('/portal')

    // "Primeira página autenticada" do portal: a API do portal responde à sessão nova
    setSession({
      id: user.id,
      email: user.email,
      officeId: user.officeId!,
      role: user.role,
      clientId: user.clientId,
    })
    const { GET } = await import('@/app/api/portal/documents/route')
    const res = await GET(jsonRequest('/api/portal/documents', 'GET'))
    expect(res.status).toBe(200)
  })

  it('token expirado: mensagem pt-PT com caminho de saída (pedir novo convite)', async () => {
    const office = await makeOffice('Gabinete Fátima')
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const { invitation, token } = await createInvitation({
      officeId: office.id,
      email: 'tarde@gabinete.pt',
      role: 'ACCOUNTANT',
      invitedByUserId: owner.id,
    })
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const html = await renderAcceptInvite(token)
    expect(html).toMatch(/expirou/i)
    expect(html).toMatch(/novo convite/i)
    // Nunca o 404 genérico em inglês
    expect(html).not.toMatch(/could not be found/i)
  })

  it('token já utilizado: diz que o convite foi aceite e aponta para /login', async () => {
    const office = await makeOffice('Gabinete Fátima')
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const { token } = await createInvitation({
      officeId: office.id,
      email: 'usado@gabinete.pt',
      role: 'ACCOUNTANT',
      invitedByUserId: owner.id,
    })
    await adapter().createUser!({ id: 'ignored', email: 'usado@gabinete.pt', emailVerified: new Date() })

    const html = await renderAcceptInvite(token)
    expect(html).toMatch(/já foi (aceite|utilizado)/i)
    expect(html).toContain('href="/login"')
  })

  it('token revogado: mensagem própria com caminho de saída', async () => {
    const office = await makeOffice('Gabinete Fátima')
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const { invitation, token } = await createInvitation({
      officeId: office.id,
      email: 'rev@gabinete.pt',
      role: 'ACCOUNTANT',
      invitedByUserId: owner.id,
    })
    await revokeInvitation({ invitationId: invitation.id, officeId: office.id })

    const html = await renderAcceptInvite(token)
    expect(html).toMatch(/anulado|revogado/i)
    expect(html).toMatch(/novo convite/i)
  })

  it('token inválido ou em falta: mensagem pt-PT, nunca 404 genérico', async () => {
    const htmlInvalid = await renderAcceptInvite('token-que-nao-existe')
    expect(htmlInvalid).toMatch(/inválido/i)
    expect(htmlInvalid).toContain('href="/login"')

    const htmlMissing = await renderAcceptInvite(undefined)
    expect(htmlMissing).toMatch(/inválido|em falta/i)
  })

  it('inspectInvitationToken devolve o estado exato do token (serviço de suporte da página)', async () => {
    const office = await makeOffice('Gabinete Fátima')
    const owner = await makeUser({ officeId: office.id, role: 'OWNER' })
    const { invitation, token } = await createInvitation({
      officeId: office.id,
      email: 'estado@gabinete.pt',
      role: 'VIEWER',
      invitedByUserId: owner.id,
    })

    const { inspectInvitationToken } = await import('@/server/services/invitation-service')

    const valid = await inspectInvitationToken(token)
    expect(valid.state).toBe('valid')
    if (valid.state === 'valid') {
      expect(valid.invitation.email).toBe('estado@gabinete.pt')
      expect(valid.officeName).toBe('Gabinete Fátima')
    }

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect((await inspectInvitationToken(token)).state).toBe('expired')

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { expiresAt: new Date(Date.now() + 3_600_000), revokedAt: new Date() },
    })
    expect((await inspectInvitationToken(token)).state).toBe('revoked')

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { revokedAt: null, acceptedAt: new Date() },
    })
    expect((await inspectInvitationToken(token)).state).toBe('accepted')

    expect((await inspectInvitationToken('nope')).state).toBe('invalid')
  })
})
