import { describe, it, expect, beforeEach, vi } from 'vitest'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeUser } from '../helpers/factories'
import { setSession, authMockFactory, type TestSessionUser } from '../helpers/session'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => '/admin/jobs',
    useSearchParams: () => new URLSearchParams(),
  }
})

/**
 * AUDIT F3.12 — visibilidade operacional mínima (A-5). /admin/jobs (OWNER
 * only) lê o JobLog existente: últimas execuções por fila, falhas visíveis,
 * tentativas contadas. Uma falha às 3h da manhã deixa de ser invisível.
 */

function asSession(user: TestSessionUser) {
  setSession(user)
}

async function renderJobsPage(): Promise<string> {
  const { default: Page } = await import('@/app/(dashboard)/admin/jobs/page')
  const jsx = await Page()
  const { renderToStaticMarkup } = await import('react-dom/server')
  return renderToStaticMarkup(jsx)
}

describe('AUDIT-F3.12 /admin/jobs', () => {
  beforeEach(async () => {
    await truncateAll()
    setSession(null)
  })

  it('falha semeada no JobLog aparece na página com a fila e o erro', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    await prisma.jobLog.create({
      data: {
        officeId: officeA.id,
        queue: 'email-sync',
        jobId: 'job-3am',
        status: 'FAILED',
        payload: { emailAccountId: 'acc-1' },
        error: 'GmailProvider: GET failed: 500',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    })
    await prisma.jobLog.create({
      data: {
        officeId: officeA.id,
        queue: 'document-parse',
        jobId: 'job-ok',
        status: 'COMPLETED',
        payload: {},
        startedAt: new Date(),
        completedAt: new Date(),
      },
    })

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const html = await renderJobsPage()

    expect(html).toContain('email-sync')
    expect(html).toContain('GmailProvider: GET failed: 500')
    expect(html).toMatch(/Falhou|FAILED/)
    expect(html).toContain('document-parse')
  })

  it('retries do mesmo job são contados (jobId repetido no JobLog)', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    for (let attempt = 0; attempt < 3; attempt++) {
      await prisma.jobLog.create({
        data: {
          officeId: officeA.id,
          queue: 'document-parse',
          jobId: 'job-retry-x',
          status: attempt === 2 ? 'COMPLETED' : 'FAILED',
          payload: {},
          error: attempt === 2 ? null : 'blip',
        },
      })
    }

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const html = await renderJobsPage()
    // Contagem de tentativas visível (3 execuções do mesmo jobId)
    expect(html).toMatch(/3.{0,20}tentativa|tentativa.{0,20}3/i)
  })

  it('só o OWNER vê a página — ACCOUNTANT e VIEWER levam notFound', async () => {
    const { officeA } = await makeTwoOffices()
    const accountant = await makeUser({ officeId: officeA.id, role: 'ACCOUNTANT' })

    asSession({ id: accountant.id, email: accountant.email, officeId: officeA.id, role: 'ACCOUNTANT' })
    await expect(renderJobsPage()).rejects.toThrow() // notFound() do Next lança
  })

  it('JobLog de outro office nunca aparece', async () => {
    const { officeA, officeB, ownerA } = await makeTwoOffices()
    await prisma.jobLog.create({
      data: {
        officeId: officeB.id,
        queue: 'email-sync',
        jobId: 'job-do-b',
        status: 'FAILED',
        payload: {},
        error: 'segredo do office B',
      },
    })

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const html = await renderJobsPage()
    expect(html).not.toContain('segredo do office B')
  })
})
