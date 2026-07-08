import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { truncateAll, prisma } from '../helpers/db'
import { makeTwoOffices, makeClient } from '../helpers/factories'
import { setSession, authMockFactory, type TestSessionUser } from '../helpers/session'
import { fixturePath } from '../fixtures/generate'
import { NextRequest } from 'next/server'
import { resetRateLimits } from '@/server/rate-limit'
import type { DocumentSource, DocumentStatus } from '@prisma/client'

vi.mock('@/lib/auth', () => authMockFactory())
vi.mock('@/lib/r2', async () => (await import('../mocks/r2')).r2MockFactory())
vi.mock('@/lib/anthropic', async () => (await import('../mocks/ai')).aiMockFactory())

// Server-side render of pages with client components: the Next router context
// does not exist outside the Next runtime — stub the hooks the components use.
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>()
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
    }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
  }
})

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

import { POST as uploadRoute } from '@/app/api/documents/upload/route'

/**
 * AUDIT F1.2 — Documentos "engolidos" (REVIEW_ISSUES C-2, UX jornada 2).
 * A página Documentos e o detalhe de cliente têm de listar TODAS as origens
 * (EMAIL, MANUAL_UPLOAD, IMPORT, PORTAL_UPLOAD, API_PULL), nunca só anexos de
 * email, e o estado mostrado tem de ser o estado REAL (VALIDATED ≠ a rever).
 */

function asSession(user: TestSessionUser) {
  setSession(user)
}

async function makeDoc(params: {
  officeId: string
  clientId?: string | null
  source: DocumentSource
  status?: DocumentStatus
  filename: string
}) {
  return prisma.document.create({
    data: {
      officeId: params.officeId,
      clientId: params.clientId ?? null,
      source: params.source,
      status: params.status ?? 'NEEDS_REVIEW',
      originalFilename: params.filename,
      confidence: 0.9,
      type: 'INVOICE_RECEIVED',
    },
  })
}

/** EMAIL-sourced document: full attachment chain, as the sync/parse pipeline writes. */
async function makeEmailDoc(officeId: string, filename: string) {
  const account = await prisma.emailAccount.create({
    data: { officeId, email: `inbox-${Date.now()}@t.pt`, provider: 'OUTLOOK', active: true },
  })
  const email = await prisma.inboundEmail.create({
    data: {
      emailAccountId: account.id,
      providerMessageId: `msg-${filename}`,
      fromEmail: 'x@y.pt',
      toEmails: [],
      ccEmails: [],
      receivedAt: new Date(),
      status: 'UNREAD',
    },
  })
  const attachment = await prisma.emailAttachment.create({
    data: {
      inboundEmailId: email.id,
      providerAttachmentId: `att-${filename}`,
      filename,
      mimeType: 'application/pdf',
    },
  })
  return prisma.document.create({
    data: {
      officeId,
      attachmentId: attachment.id,
      source: 'EMAIL',
      status: 'NEEDS_REVIEW',
      originalFilename: filename,
      confidence: 0.9,
      type: 'INVOICE_RECEIVED',
    },
  })
}

async function renderDocumentsPage(): Promise<string> {
  const { default: Page } = await import('@/app/(dashboard)/documents/page')
  const jsx = await Page()
  const { renderToStaticMarkup } = await import('react-dom/server')
  return renderToStaticMarkup(jsx)
}

async function renderClientPage(clientId: string): Promise<string> {
  const { default: Page } = await import('@/app/(dashboard)/clients/[clientId]/page')
  const jsx = await Page({ params: Promise.resolve({ clientId }) })
  const { renderToStaticMarkup } = await import('react-dom/server')
  return renderToStaticMarkup(jsx)
}

describe('AUDIT-F1.2 documentos de todas as origens', () => {
  beforeEach(async () => {
    await truncateAll()
    resetRateLimits()
    setSession(null)
    queueAddMock.mockClear()
  })

  it('listOfficeDocuments devolve as 5 origens, exclui apagados e outros offices', async () => {
    const { officeA, officeB } = await makeTwoOffices()
    await makeEmailDoc(officeA.id, 'de-email.pdf')
    await makeDoc({ officeId: officeA.id, source: 'MANUAL_UPLOAD', filename: 'upload.pdf' })
    await makeDoc({ officeId: officeA.id, source: 'IMPORT', filename: 'folha.csv' })
    await makeDoc({ officeId: officeA.id, source: 'PORTAL_UPLOAD', filename: 'portal.pdf' })
    await makeDoc({ officeId: officeA.id, source: 'API_PULL', filename: 'toconline.pdf' })
    // Ruído: apagado e de outro office — nunca aparecem
    const dead = await makeDoc({ officeId: officeA.id, source: 'MANUAL_UPLOAD', filename: 'apagado.pdf' })
    await prisma.document.update({ where: { id: dead.id }, data: { deletedAt: new Date() } })
    await makeDoc({ officeId: officeB.id, source: 'MANUAL_UPLOAD', filename: 'do-office-b.pdf' })

    const { listOfficeDocuments } = await import('@/server/services/document-service')
    const docs = await listOfficeDocuments(officeA.id)

    expect(docs).toHaveLength(5)
    const sources = new Set(docs.map((d: { source: string }) => d.source))
    expect(sources).toEqual(
      new Set(['EMAIL', 'MANUAL_UPLOAD', 'IMPORT', 'PORTAL_UPLOAD', 'API_PULL']),
    )
    const filenames = docs.map((d: { filename: string }) => d.filename)
    expect(filenames).toContain('de-email.pdf')
    expect(filenames).not.toContain('apagado.pdf')
    expect(filenames).not.toContain('do-office-b.pdf')
  })

  it('página Documentos mostra documentos de origens não-email (upload/import/portal)', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    await makeDoc({ officeId: officeA.id, source: 'MANUAL_UPLOAD', filename: 'FT_upload_123.pdf' })
    await makeDoc({ officeId: officeA.id, source: 'IMPORT', filename: 'FT_import_456.pdf' })
    await makeDoc({ officeId: officeA.id, source: 'PORTAL_UPLOAD', filename: 'FT_portal_789.pdf' })

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const html = await renderDocumentsPage()

    expect(html).toContain('FT_upload_123.pdf')
    expect(html).toContain('FT_import_456.pdf')
    expect(html).toContain('FT_portal_789.pdf')
    expect(html).not.toContain('Nenhum documento encontrado')
  })

  it('upload na página aparece imediatamente na listagem', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })

    const pdf = readFileSync(fixturePath('fx-noqr-invoice.pdf'))
    const form = new FormData()
    form.append('files', new File([new Uint8Array(pdf)], 'acabou-de-subir.pdf', { type: 'application/pdf' }))
    const res = await uploadRoute(
      new NextRequest('http://localhost:3000/api/documents/upload', { method: 'POST', body: form }),
    )
    expect([200, 201, 207]).toContain(res.status)

    const { listOfficeDocuments } = await import('@/server/services/document-service')
    const docs = await listOfficeDocuments(officeA.id)
    expect(docs.map((d: { filename: string }) => d.filename)).toContain('acabou-de-subir.pdf')

    const html = await renderDocumentsPage()
    expect(html).toContain('acabou-de-subir.pdf')
  })

  it('detalhe de cliente mostra documentos de todas as origens e conta "a rever" com o estado real', async () => {
    const { officeA, ownerA } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id, name: 'Silva & Costa Teste' })

    await makeDoc({
      officeId: officeA.id, clientId: client.id,
      source: 'MANUAL_UPLOAD', status: 'VALIDATED', filename: 'validado.pdf',
    })
    await makeDoc({
      officeId: officeA.id, clientId: client.id,
      source: 'API_PULL', status: 'NEEDS_REVIEW', filename: 'a-rever.pdf',
    })
    await makeDoc({
      officeId: officeA.id, clientId: client.id,
      source: 'IMPORT', status: 'PRE_VALIDATED', filename: 'pre-validado.pdf',
    })

    asSession({ id: ownerA.id, email: ownerA.email, officeId: officeA.id, role: 'OWNER' })
    const html = await renderClientPage(client.id)

    // Todos os documentos visíveis, independentemente da origem
    expect(html).toContain('validado.pdf')
    expect(html).toContain('a-rever.pdf')
    expect(html).toContain('pre-validado.pdf')
    expect(html).not.toContain('Nenhum documento recebido ainda')

    // VALIDATED/PRE_VALIDATED nunca contam como "a rever" — só o NEEDS_REVIEW real
    expect(html).toMatch(/1 documento a rever/)
  })

  it('atribuição de cliente funciona para documentos sem anexo de email (upload/import)', async () => {
    const { officeA, officeB } = await makeTwoOffices()
    const client = await makeClient({ officeId: officeA.id, name: 'Cliente A' })
    const doc = await makeDoc({ officeId: officeA.id, source: 'MANUAL_UPLOAD', filename: 'solto.pdf' })

    const { assignClientToDocument } = await import('@/server/services/document-service')
    const ok = await assignClientToDocument({
      documentId: doc.id,
      clientId: client.id,
      officeId: officeA.id,
    })
    expect(ok).toEqual({ ok: true })

    // Cross-office continua 404-equivalente
    const clientB = await makeClient({ officeId: officeB.id, name: 'Cliente B' })
    const refused = await assignClientToDocument({
      documentId: doc.id,
      clientId: clientB.id,
      officeId: officeB.id,
    })
    expect(refused.ok).toBe(false)
  })
})
