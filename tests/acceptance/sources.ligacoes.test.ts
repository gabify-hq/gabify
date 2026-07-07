import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeUser, makeClient } from '../helpers/factories'
import { setSession, authMockFactory } from '../helpers/session'
import { resetRateLimits } from '@/server/rate-limit'
import { decryptToken } from '@/lib/crypto'

vi.mock('@/lib/auth', () => authMockFactory())

const queueAddMock = vi.fn()
vi.mock('@/lib/redis', () => ({
  getMoloniPullQueue: () => ({ add: queueAddMock }),
  getInvoicexpressPullQueue: () => ({ add: queueAddMock }),
  QUEUE_MOLONI_PULL: 'moloni-pull',
  QUEUE_INVOICEXPRESS_PULL: 'invoicexpress-pull',
  DEFAULT_JOB_OPTIONS: {},
  redisConnection: {},
}))

import {
  GET as getRoute,
  PUT as putRoute,
  PATCH as patchRoute,
  DELETE as deleteRoute,
} from '@/app/api/clients/[clientId]/sources/[system]/route'
import { POST as syncRoute } from '@/app/api/clients/[clientId]/sources/[system]/sync/route'

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const sourceParams = (clientId: string, system: string) => ({
  params: Promise.resolve({ clientId, system }),
})

const MOLONI_KEY = 'moloni-user-password-SECRET'
const IVX_KEY = 'sk-live-IVX-SECRET-0123456789'
const MOLONI_BODY = { companyId: 12345, companyName: 'Empresa X', username: 'contas@x.pt', password: MOLONI_KEY }
const IVX_BODY = { accountName: 'demo-firm', apiKey: IVX_KEY }

describe('Ligações — fontes Moloni/InvoiceXpress (RBAC + persistência) [INV]', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
    resetRateLimits()
    queueAddMock.mockReset()
  })

  it('SR.a ligar credenciais persiste cifrado, aparece na lista e nunca ecoa segredos (Moloni)', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const put = await putRoute(
      jsonRequest(`/api/clients/${client.id}/sources/moloni`, 'PUT', MOLONI_BODY),
      sourceParams(client.id, 'moloni'),
    )
    expect(put.status).toBe(200)
    expect(await put.text()).not.toContain(MOLONI_KEY) // secret never in a response

    const row = await prisma.moloniConnection.findFirstOrThrow({ where: { clientId: client.id } })
    expect(row.password).not.toBe(MOLONI_KEY)
    expect(row.password.startsWith('v2:')).toBe(true)
    expect(decryptToken(row.password)).toBe(MOLONI_KEY)
    expect(row.username.startsWith('v2:')).toBe(true)

    const get = await getRoute(
      jsonRequest(`/api/clients/${client.id}/sources/moloni`, 'GET'),
      sourceParams(client.id, 'moloni'),
    )
    const body = (await get.json()) as { data: { connection: { hasCredentials: boolean; companyId: number } | null } }
    expect(body.data.connection?.hasCredentials).toBe(true)
    expect(body.data.connection?.companyId).toBe(12345)

    const audit = await prisma.auditLog.findFirst({ where: { officeId: officeA.id, action: 'MOLONI_CONNECTION_SAVED' } })
    expect(audit).not.toBeNull()
  })

  it('SR.b ligar InvoiceXpress cifra a api_key e nunca a ecoa', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const put = await putRoute(
      jsonRequest(`/api/clients/${client.id}/sources/invoicexpress`, 'PUT', IVX_BODY),
      sourceParams(client.id, 'invoicexpress'),
    )
    expect(put.status).toBe(200)
    expect(await put.text()).not.toContain(IVX_KEY)

    const row = await prisma.invoicexpressConnection.findFirstOrThrow({ where: { clientId: client.id } })
    expect(row.apiKey.startsWith('v2:')).toBe(true)
    expect(decryptToken(row.apiKey)).toBe(IVX_KEY)
  })

  it('SR.c VIEWER lê o estado mas não edita credenciais', async () => {
    const { officeA } = await makeTwoOffices()
    const viewer = await makeUser({ officeId: officeA.id, role: 'VIEWER' })
    const client = await makeClient({ officeId: officeA.id })
    setSession({ id: viewer.id, email: viewer.email, officeId: officeA.id, role: 'VIEWER' })

    const read = await getRoute(
      jsonRequest(`/api/clients/${client.id}/sources/moloni`, 'GET'),
      sourceParams(client.id, 'moloni'),
    )
    expect(read.status).toBe(200)

    const write = await putRoute(
      jsonRequest(`/api/clients/${client.id}/sources/moloni`, 'PUT', MOLONI_BODY),
      sourceParams(client.id, 'moloni'),
    )
    expect(write.status).toBe(404) // source:manage denied
    expect(await prisma.moloniConnection.count({ where: { clientId: client.id } })).toBe(0)
  })

  it('SR.d cross-tenant → 404 em TODAS as rotas novas', async () => {
    const { officeA, officeB, ownerB } = await makeTwoOffices()
    const clientA = await makeClient({ officeId: officeA.id })
    await prisma.moloniConnection.create({
      data: {
        officeId: officeA.id,
        clientId: clientA.id,
        companyId: 1,
        username: 'v2:x',
        password: 'v2:y',
        pullEnabled: true,
      },
    })
    setSession({ id: ownerB.id, email: ownerB.email, officeId: officeB.id, role: 'OWNER' })

    const attempts: Array<[string, Promise<Response>]> = [
      ['GET', getRoute(jsonRequest(`/api/clients/${clientA.id}/sources/moloni`, 'GET'), sourceParams(clientA.id, 'moloni'))],
      ['PUT', putRoute(jsonRequest(`/api/clients/${clientA.id}/sources/moloni`, 'PUT', MOLONI_BODY), sourceParams(clientA.id, 'moloni'))],
      ['PATCH', patchRoute(jsonRequest(`/api/clients/${clientA.id}/sources/moloni`, 'PATCH', { pullEnabled: false }), sourceParams(clientA.id, 'moloni'))],
      ['DELETE', deleteRoute(jsonRequest(`/api/clients/${clientA.id}/sources/moloni`, 'DELETE'), sourceParams(clientA.id, 'moloni'))],
      ['SYNC', syncRoute(jsonRequest(`/api/clients/${clientA.id}/sources/moloni/sync`, 'POST', {}), sourceParams(clientA.id, 'moloni'))],
    ]
    for (const [label, promise] of attempts) {
      const res = await promise
      expect(res.status, `${label} deve ser 404 cross-tenant`).toBe(404)
    }
    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('SR.e "Sincronizar agora" enfileira o job certo quando o pull está ativo', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    await prisma.invoicexpressConnection.create({
      data: { officeId: officeA.id, clientId: client.id, accountName: 'demo-firm', apiKey: 'v2:z', pullEnabled: true },
    })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const res = await syncRoute(
      jsonRequest(`/api/clients/${client.id}/sources/invoicexpress/sync`, 'POST', {}),
      sourceParams(client.id, 'invoicexpress'),
    )
    expect(res.status).toBe(200)
    expect(queueAddMock).toHaveBeenCalledTimes(1)
    expect(queueAddMock.mock.calls[0][0]).toBe('invoicexpress-pull')
  })

  it('SR.f "Sincronizar agora" com pull desligado → 422, sem job', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    await prisma.moloniConnection.create({
      data: { officeId: officeA.id, clientId: client.id, companyId: 1, username: 'v2:x', password: 'v2:y', pullEnabled: false },
    })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const res = await syncRoute(
      jsonRequest(`/api/clients/${client.id}/sources/moloni/sync`, 'POST', {}),
      sourceParams(client.id, 'moloni'),
    )
    expect(res.status).toBe(422)
    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('SR.h PATCH alterna o pull e DELETE desliga a ligação (Moloni)', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    await putRoute(
      jsonRequest(`/api/clients/${client.id}/sources/moloni`, 'PUT', MOLONI_BODY),
      sourceParams(client.id, 'moloni'),
    )

    const patch = await patchRoute(
      jsonRequest(`/api/clients/${client.id}/sources/moloni`, 'PATCH', { pullEnabled: true }),
      sourceParams(client.id, 'moloni'),
    )
    expect(patch.status).toBe(200)
    let row = await prisma.moloniConnection.findFirstOrThrow({ where: { clientId: client.id } })
    expect(row.pullEnabled).toBe(true)

    const del = await deleteRoute(
      jsonRequest(`/api/clients/${client.id}/sources/moloni`, 'DELETE'),
      sourceParams(client.id, 'moloni'),
    )
    expect(del.status).toBe(200)
    row = await prisma.moloniConnection.findFirstOrThrow({ where: { clientId: client.id } })
    expect(row.status).toBe('DESLIGADA')
    expect(row.pullEnabled).toBe(false)
  })

  it('SR.i PATCH alterna o pull da ligação InvoiceXpress', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    await putRoute(
      jsonRequest(`/api/clients/${client.id}/sources/invoicexpress`, 'PUT', IVX_BODY),
      sourceParams(client.id, 'invoicexpress'),
    )
    const patch = await patchRoute(
      jsonRequest(`/api/clients/${client.id}/sources/invoicexpress`, 'PATCH', { pullEnabled: true }),
      sourceParams(client.id, 'invoicexpress'),
    )
    expect(patch.status).toBe(200)
    const dto = (await patch.json()) as { data: { pullEnabled: boolean } }
    expect(dto.data.pullEnabled).toBe(true)
  })

  it('SR.g sistema desconhecido → 404', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id })
    setSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const res = await getRoute(
      jsonRequest(`/api/clients/${client.id}/sources/sage`, 'GET'),
      sourceParams(client.id, 'sage'),
    )
    expect(res.status).toBe(404)
  })
})
