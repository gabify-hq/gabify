/**
 * [INV] Connector suite — end-to-end against the doc-derived mock API:
 * draft exclusion, exact VAT cents, pagination with resume + de-dup,
 * PDF fetch and contract validation of every response.
 */
import { describe, expect, it } from 'vitest'
import { MoloniConnector } from './connector'
import { createMoloniApiMock } from './mock-api'
import {
  draftDetail,
  invoiceMultiRateDetail,
  invoiceWithExemptLineDetail,
  summaryOf,
} from './fixtures'

const CREDENTIALS = {
  clientId: 'gabify-dev',
  clientSecret: 'super-secret-client-key',
  username: 'contas@escritorio.pt',
  password: 'p4ssw0rd-muito-secreta',
}
const COMPANY_ID = 5

const thirdInvoice = {
  ...invoiceMultiRateDetail,
  document_id: 33333,
  number: 44,
}

function createClock(startMs = 1_780_000_000_000) {
  let nowMs = startMs
  return {
    now: () => nowMs,
    sleep: async (ms: number) => {
      nowMs += ms
    },
  }
}

function createConnector(
  mockOptions: Partial<Parameters<typeof createMoloniApiMock>[0]>,
  pageSize?: number
) {
  const clock = createClock()
  const mock = createMoloniApiMock({
    credentials: CREDENTIALS,
    now: clock.now,
    documents: [invoiceMultiRateDetail, invoiceWithExemptLineDetail, draftDetail],
    ...mockOptions,
  })
  const connector = new MoloniConnector({
    credentials: CREDENTIALS,
    companyId: COMPANY_ID,
    pageSize,
    deps: { fetchFn: mock.fetchFn, now: clock.now, sleep: clock.sleep },
  })
  return { mock, connector }
}

describe('MoloniConnector.listIssuedDocuments', () => {
  it('returns issued documents with exact VAT breakdown in cents', async () => {
    const { connector } = createConnector({})
    const page = await connector.listIssuedDocuments()

    const multiRate = page.items.find((d) => d.externalId === '11111')
    expect(multiRate).toBeDefined()
    expect(multiRate?.totalCents).toBe(3556)
    expect(multiRate?.vatBreakdownCents).toEqual([
      { ratePermil: 60, baseCents: 1000, amountCents: 60 },
      { ratePermil: 230, baseCents: 2029, amountCents: 467 },
    ])
  })

  it('never returns drafts (status 0) nor fetches their detail', async () => {
    const { mock, connector } = createConnector({})
    const page = await connector.listIssuedDocuments()

    expect(page.items.map((d) => d.externalId).sort()).toEqual(['11111', '22222'])
    const getOneIds = mock.requests
      .filter((r) => r.url.includes('/documents/getOne/'))
      .map((r) => new URLSearchParams(r.body ?? '').get('document_id'))
    expect(getOneIds).not.toContain(String(draftDetail.document_id))
  })

  it('requests exactly one token grant for the whole listing', async () => {
    const { mock, connector } = createConnector({})
    await connector.listIssuedDocuments()
    // getAll + one getOne per issued doc — all on a single access token
    expect(mock.counters.grantPassword).toBe(1)
    expect(mock.counters.grantRefreshToken).toBe(0)
  })

  it('paginates: full page yields a cursor, resuming returns the rest, no duplicates', async () => {
    const documents = [invoiceMultiRateDetail, invoiceWithExemptLineDetail, thirdInvoice]
    const { connector } = createConnector({ documents }, 2)

    const page1 = await connector.listIssuedDocuments()
    expect(page1.items.map((d) => d.externalId)).toEqual(['11111', '22222'])
    expect(page1.nextCursor).not.toBeNull()

    const page2 = await connector.listIssuedDocuments(page1.nextCursor!)
    expect(page2.items.map((d) => d.externalId)).toEqual(['33333'])
    expect(page2.nextCursor).toBeNull()

    const all = [...page1.items, ...page2.items].map((d) => d.externalId)
    expect(new Set(all).size).toBe(all.length)
  })

  it('cursor survives a fresh connector instance (resume after restart)', async () => {
    const documents = [invoiceMultiRateDetail, invoiceWithExemptLineDetail, thirdInvoice]
    const first = createConnector({ documents }, 2)
    const page1 = await first.connector.listIssuedDocuments()

    const second = createConnector({ documents }, 2)
    const page2 = await second.connector.listIssuedDocuments(page1.nextCursor!)
    expect(page2.items.map((d) => d.externalId)).toEqual(['33333'])
  })

  it('de-duplicates documents repeated across pages (offset drift)', async () => {
    const documents = [invoiceMultiRateDetail, invoiceWithExemptLineDetail, thirdInvoice]
    const { connector } = createConnector(
      {
        documents,
        getAllPages: [
          [summaryOf(invoiceMultiRateDetail), summaryOf(invoiceWithExemptLineDetail)],
          // page 2 repeats 22222 (a document was inserted upstream meanwhile)
          [summaryOf(invoiceWithExemptLineDetail), summaryOf(thirdInvoice)],
        ],
      },
      2
    )

    const page1 = await connector.listIssuedDocuments()
    const page2 = await connector.listIssuedDocuments(page1.nextCursor!)
    const all = [...page1.items, ...page2.items].map((d) => d.externalId)
    expect(all).toEqual(['11111', '22222', '33333'])
  })

  it('rejects responses that do not match the documented contract', async () => {
    const { connector } = createConnector({ extraFieldInGetAll: true })
    await expect(connector.listIssuedDocuments()).rejects.toMatchObject({ kind: 'contract' })
  })
})

describe('MoloniConnector.fetchPdf', () => {
  it('downloads the PDF bytes for an issued document', async () => {
    const { connector } = createConnector({})
    const pdf = await connector.fetchPdf('11111')
    expect(pdf).toBeInstanceOf(Buffer)
    expect(pdf?.toString('utf8')).toContain('%PDF')
  })

  it('returns null for drafts (API refuses status 0 documents)', async () => {
    const { connector } = createConnector({})
    await expect(connector.fetchPdf(String(draftDetail.document_id))).resolves.toBeNull()
  })

  it('returns null for unknown references', async () => {
    const { connector } = createConnector({})
    await expect(connector.fetchPdf('424242')).resolves.toBeNull()
  })
})
