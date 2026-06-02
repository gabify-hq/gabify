# Email Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the email → attachment → classification → draft → approval pipeline so real emails flow end-to-end through the Gabify UI.

**Architecture:** GmailProvider extracts attachment metadata during sync → document-parse worker uses the existing text-extractor module to extract text → Claude classifies + generates draft → accountant sees real data in the email detail page with approve/reject.

**Tech Stack:** TypeScript, Prisma (PostgreSQL), BullMQ, `pdf-parse` (PDFParse class), `mammoth`, Vitest, Next.js 16 App Router, shadcn/ui

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/server/email-providers/GmailProvider.ts` | Modify | Add `extractAttachmentParts` helper; create `EmailAttachment` records in `upsertMessage` |
| `src/server/email-providers/GmailProvider.test.ts` | Modify | Add `emailAttachment` prisma mock; add attachment extraction tests |
| `src/queues/document-parse.worker.ts` | Modify | Remove local TODO `extractText`; import from `@/lib/text-extractor`; fix call signature |
| `src/app/(dashboard)/inbox/[emailId]/page.tsx` | Modify | Replace mock-data with real DB query + adapter |
| `src/app/api/clients/[clientId]/route.ts` | Create | PATCH endpoint (update name/nif/email/emailDomains/knownEmails/notes) |
| `src/components/dashboard/edit-client-dialog.tsx` | Create | Dialog with same tag-input pattern as NewClientDialog |
| `src/app/(dashboard)/clients/page.tsx` | Modify | Add Edit button per row |
| `src/app/api/clients/[clientId]/route.test.ts` | Create | PATCH endpoint tests |

---

## Task 1: Extract Gmail attachment metadata during sync

**Files:**
- Modify: `src/server/email-providers/GmailProvider.ts`
- Modify: `src/server/email-providers/GmailProvider.test.ts`

Context: `upsertMessage` already creates `InboundEmail` records but never reads attachment parts from the Gmail payload. The email-sync worker queries `EmailAttachment` records to queue document-parse jobs — if there are no records, the pipeline never starts. The fix: walk the message payload recursively for parts with a non-empty `body.attachmentId` and create `EmailAttachment` records.

The `EmailAttachment` model fields needed: `inboundEmailId`, `providerAttachmentId`, `filename`, `mimeType`, `sizeBytes`. Idempotency: query existing records by `(inboundEmailId, providerAttachmentId)` before creating.

- [ ] **Step 1: Add `emailAttachment` to the prisma mock in the test file**

Open `src/server/email-providers/GmailProvider.test.ts`. Replace the prisma mock at the top:

```typescript
vi.mock('@/lib/prisma', () => ({
  prisma: {
    emailAccount: {
      update: vi.fn(),
    },
    inboundEmail: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    emailThread: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    emailAttachment: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}))
```

Also add `prisma.emailAttachment` to the import line at the bottom of the imports block:

```typescript
import { prisma } from '@/lib/prisma'
```

(No change needed — prisma is already imported. Just ensure the mock has the new methods.)

Add default mock implementations in `beforeEach`:

```typescript
vi.mocked(prisma.emailAttachment.findMany).mockResolvedValue([])
vi.mocked(prisma.emailAttachment.createMany).mockResolvedValue({ count: 0 })
```

- [ ] **Step 2: Write failing tests for attachment extraction**

Add a new `describe('attachment extraction', ...)` block inside the existing `describe('GmailProvider', ...)` in `src/server/email-providers/GmailProvider.test.ts`:

```typescript
describe('attachment extraction', () => {
  function makeMultipartMessage(attachments: Array<{
    filename: string
    mimeType: string
    attachmentId: string
    size?: number
  }>) {
    return makeGmailMessage({
      payload: {
        headers: [
          { name: 'Subject', value: 'Docs' },
          { name: 'From', value: 'sender@client.pt' },
          { name: 'Date', value: 'Mon, 15 Jan 2024 10:00:00 +0000' },
        ],
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: Buffer.from('body text').toString('base64url') },
          },
          ...attachments.map(a => ({
            mimeType: a.mimeType,
            filename: a.filename,
            body: { attachmentId: a.attachmentId, size: a.size ?? 1024 },
          })),
        ],
      },
    })
  }

  it('creates EmailAttachment records for each attachment part', async () => {
    const account = makeAccount({ historyId: null })
    const provider = new GmailProvider(account)

    vi.mocked(prisma.inboundEmail.upsert).mockResolvedValue({ id: 'email-db-1' } as never)

    fetchMock
      .mockResolvedValueOnce(makeFetchResponse({
        messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }],
      }))
      .mockResolvedValueOnce(makeFetchResponse(makeMultipartMessage([
        { filename: 'fatura.pdf', mimeType: 'application/pdf', attachmentId: 'att-001', size: 50000 },
        { filename: 'recibo.pdf', mimeType: 'application/pdf', attachmentId: 'att-002', size: 12000 },
      ])))

    await provider.syncInbox()

    expect(vi.mocked(prisma.emailAttachment.createMany)).toHaveBeenCalledWith({
      data: [
        {
          inboundEmailId: 'email-db-1',
          providerAttachmentId: 'att-001',
          filename: 'fatura.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 50000,
        },
        {
          inboundEmailId: 'email-db-1',
          providerAttachmentId: 'att-002',
          filename: 'recibo.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12000,
        },
      ],
    })
  })

  it('skips attachments that already exist in the database', async () => {
    const account = makeAccount({ historyId: null })
    const provider = new GmailProvider(account)

    vi.mocked(prisma.inboundEmail.upsert).mockResolvedValue({ id: 'email-db-1' } as never)
    vi.mocked(prisma.emailAttachment.findMany).mockResolvedValue([
      { providerAttachmentId: 'att-001' } as never,
    ])

    fetchMock
      .mockResolvedValueOnce(makeFetchResponse({
        messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }],
      }))
      .mockResolvedValueOnce(makeFetchResponse(makeMultipartMessage([
        { filename: 'fatura.pdf', mimeType: 'application/pdf', attachmentId: 'att-001' },
        { filename: 'recibo.pdf', mimeType: 'application/pdf', attachmentId: 'att-002' },
      ])))

    await provider.syncInbox()

    expect(vi.mocked(prisma.emailAttachment.createMany)).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ providerAttachmentId: 'att-002' }),
      ],
    })
  })

  it('does not call createMany when all attachments already exist', async () => {
    const account = makeAccount({ historyId: null })
    const provider = new GmailProvider(account)

    vi.mocked(prisma.inboundEmail.upsert).mockResolvedValue({ id: 'email-db-1' } as never)
    vi.mocked(prisma.emailAttachment.findMany).mockResolvedValue([
      { providerAttachmentId: 'att-001' } as never,
    ])

    fetchMock
      .mockResolvedValueOnce(makeFetchResponse({
        messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }],
      }))
      .mockResolvedValueOnce(makeFetchResponse(makeMultipartMessage([
        { filename: 'fatura.pdf', mimeType: 'application/pdf', attachmentId: 'att-001' },
      ])))

    await provider.syncInbox()

    expect(vi.mocked(prisma.emailAttachment.createMany)).not.toHaveBeenCalled()
  })

  it('does not call emailAttachment methods for plain-text messages with no attachments', async () => {
    const account = makeAccount({ historyId: null })
    const provider = new GmailProvider(account)

    vi.mocked(prisma.inboundEmail.upsert).mockResolvedValue({ id: 'email-db-1' } as never)

    fetchMock
      .mockResolvedValueOnce(makeFetchResponse({
        messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }],
      }))
      .mockResolvedValueOnce(makeFetchResponse(makeGmailMessage()))

    await provider.syncInbox()

    expect(vi.mocked(prisma.emailAttachment.findMany)).not.toHaveBeenCalled()
    expect(vi.mocked(prisma.emailAttachment.createMany)).not.toHaveBeenCalled()
  })

  it('extracts attachments nested inside multipart/related parts', async () => {
    const account = makeAccount({ historyId: null })
    const provider = new GmailProvider(account)

    vi.mocked(prisma.inboundEmail.upsert).mockResolvedValue({ id: 'email-db-1' } as never)

    const nestedMessage = makeGmailMessage({
      payload: {
        headers: [
          { name: 'Subject', value: 'Nested' },
          { name: 'From', value: 'sender@client.pt' },
          { name: 'Date', value: 'Mon, 15 Jan 2024 10:00:00 +0000' },
        ],
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'multipart/related',
            parts: [
              {
                mimeType: 'application/pdf',
                filename: 'nested.pdf',
                body: { attachmentId: 'att-nested', size: 5000 },
              },
            ],
          },
        ],
      },
    })

    fetchMock
      .mockResolvedValueOnce(makeFetchResponse({
        messages: [{ id: 'gmail-msg-1', threadId: 'thread-1' }],
      }))
      .mockResolvedValueOnce(makeFetchResponse(nestedMessage))

    await provider.syncInbox()

    expect(vi.mocked(prisma.emailAttachment.createMany)).toHaveBeenCalledWith({
      data: [expect.objectContaining({ filename: 'nested.pdf', providerAttachmentId: 'att-nested' })],
    })
  })
})
```

- [ ] **Step 3: Run tests — verify they FAIL**

```bash
npx vitest run src/server/email-providers/GmailProvider.test.ts --reporter=verbose
```

Expected: 5 new tests FAIL with something like `TypeError: prisma.emailAttachment.findMany is not a function` or `Expected mock to be called`.

- [ ] **Step 4: Implement attachment extraction in `GmailProvider.ts`**

**4a.** Add the `AttachmentPart` interface and `extractAttachmentParts` helper at the bottom of `src/server/email-providers/GmailProvider.ts`, after the existing `extractTextBody` function:

```typescript
interface AttachmentPart {
  providerAttachmentId: string
  filename: string
  mimeType: string
  sizeBytes: number | null
}

/**
 * Recursively walk a Gmail message payload to find all attachment parts.
 * A part is an attachment when it has a non-empty body.attachmentId and a filename.
 */
function extractAttachmentParts(part: GmailMessagePart): AttachmentPart[] {
  const results: AttachmentPart[] = []

  if (part.body?.attachmentId && part.filename) {
    results.push({
      providerAttachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      sizeBytes: part.body.size ?? null,
    })
  }

  if (part.parts) {
    for (const child of part.parts) {
      results.push(...extractAttachmentParts(child))
    }
  }

  return results
}
```

**4b.** Update `upsertMessage` to get the DB email ID from upsert and persist attachments. Replace the current upsert block and return statement:

```typescript
  private async upsertMessage(message: GmailMessage): Promise<'created' | 'updated'> {
    const headers = message.payload.headers ?? []

    const subject = headers.find((h) => h.name === 'Subject')?.value ?? null
    const fromRaw = headers.find((h) => h.name === 'From')?.value ?? ''
    const dateRaw = headers.find((h) => h.name === 'Date')?.value ?? null

    const { fromEmail, fromName } = parseFromHeader(fromRaw)
    const receivedAt = dateRaw ? new Date(dateRaw) : new Date()
    const bodyText = extractTextBody(message.payload)
    const threadId = message.threadId

    // Find or create the email thread
    let dbThreadId: string | null = null
    if (threadId) {
      const existingThread = await prisma.emailThread.findFirst({
        where: { providerThreadId: threadId },
        select: { id: true },
      })

      if (existingThread) {
        dbThreadId = existingThread.id
      } else {
        const newThread = await prisma.emailThread.create({
          data: {
            providerThreadId: threadId,
            subject: subject ?? null,
          },
          select: { id: true },
        })
        dbThreadId = newThread.id
      }
    }

    const existing = await prisma.inboundEmail.findUnique({
      where: {
        emailAccountId_providerMessageId: {
          emailAccountId: this.account.id,
          providerMessageId: message.id,
        },
      },
      select: { id: true },
    })

    const { id: emailId } = await prisma.inboundEmail.upsert({
      where: {
        emailAccountId_providerMessageId: {
          emailAccountId: this.account.id,
          providerMessageId: message.id,
        },
      },
      create: {
        emailAccountId: this.account.id,
        providerMessageId: message.id,
        threadId: dbThreadId,
        subject,
        fromEmail,
        fromName,
        toEmails: [],
        ccEmails: [],
        bodyText,
        receivedAt,
        status: 'UNREAD',
      },
      update: {
        subject,
        fromEmail,
        fromName,
        bodyText,
        threadId: dbThreadId,
      },
      select: { id: true },
    })

    // Persist attachment metadata — document-parse worker picks these up
    const attachmentParts = extractAttachmentParts(message.payload)
    if (attachmentParts.length > 0) {
      const existingAttachments = await prisma.emailAttachment.findMany({
        where: {
          inboundEmailId: emailId,
          providerAttachmentId: { in: attachmentParts.map((p) => p.providerAttachmentId) },
        },
        select: { providerAttachmentId: true },
      })
      const existingIds = new Set(existingAttachments.map((a) => a.providerAttachmentId))

      const toCreate = attachmentParts.filter((p) => !existingIds.has(p.providerAttachmentId))
      if (toCreate.length > 0) {
        await prisma.emailAttachment.createMany({
          data: toCreate.map((p) => ({
            inboundEmailId: emailId,
            providerAttachmentId: p.providerAttachmentId,
            filename: p.filename,
            mimeType: p.mimeType,
            sizeBytes: p.sizeBytes,
          })),
        })
      }
    }

    return existing ? 'updated' : 'created'
  }
```

- [ ] **Step 5: Run tests — verify they PASS**

```bash
npx vitest run src/server/email-providers/GmailProvider.test.ts --reporter=verbose
```

Expected: all 37 tests pass (32 existing + 5 new).

- [ ] **Step 6: Run full test suite — verify no regressions**

```bash
npx vitest run --reporter=verbose
```

Expected: 124 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/server/email-providers/GmailProvider.ts src/server/email-providers/GmailProvider.test.ts
git commit -m "feat: extract gmail attachment metadata during sync

GmailProvider.upsertMessage now walks the message payload recursively
to find attachment parts and creates EmailAttachment records.
Idempotent: existing attachments are skipped by providerAttachmentId.
This unblocks the document-parse pipeline — the email-sync worker
queries EmailAttachment records to queue parse jobs."
```

---

## Task 2: Wire text-extractor into document-parse worker

**Files:**
- Modify: `src/queues/document-parse.worker.ts`

Context: `src/lib/text-extractor.ts` already exists and is fully tested (takes `buffer, filename`). The worker has a local `extractText(buffer, mimeType)` stub that always returns null and logs a warning. Need to remove the stub and use the real implementation.

Note: the worker's call is `extractText(buffer, attachment.mimeType)` — this must become `extractText(buffer, attachment.filename)` to match the text-extractor signature.

- [ ] **Step 1: Verify text-extractor tests pass**

```bash
npx vitest run src/lib/text-extractor.test.ts --reporter=verbose
```

Expected: all tests pass. If not, check `pdf-parse` and `mammoth` are installed: `npm ls pdf-parse mammoth`.

- [ ] **Step 2: Update `document-parse.worker.ts`**

**2a.** Add the import at the top of the file, after the existing imports:

```typescript
import { extractText } from '@/lib/text-extractor'
```

**2b.** Replace the call in the worker body from:

```typescript
const textContent = await extractText(buffer, attachment.mimeType)
```

to:

```typescript
const textContent = await extractText(buffer, attachment.filename)
```

**2c.** Remove the local `extractText` function at the bottom of the file (the one with the TODO):

```typescript
// DELETE this entire function:
async function extractText(buffer: Buffer, mimeType: string): Promise<string | null> {
  // TODO: implement text extraction per mimeType
  // PDF: import pdfParse from 'pdf-parse'; return (await pdfParse(buffer)).text
  // DOCX: import mammoth from 'mammoth'; return (await mammoth.extractRawText({buffer})).value
  // Images: call Claude Vision API with base64 image
  // TXT: return buffer.toString('utf-8')
  console.warn(`[document-parse] text extraction not implemented for ${mimeType}`)
  return null
}
```

- [ ] **Step 3: Run full test suite — verify no regressions**

```bash
npx vitest run --reporter=verbose
```

Expected: all 124 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/queues/document-parse.worker.ts
git commit -m "feat: wire text-extractor into document-parse worker

Replace the TODO stub with the real extractText implementation from
@/lib/text-extractor. Passes attachment.filename (not mimeType) since
text-extractor dispatches by file extension.
PDF, DOCX, TXT, and CSV documents are now fully extracted before
Claude classification."
```

---

## Task 3: Email detail page from real DB data

**Files:**
- Modify: `src/app/(dashboard)/inbox/[emailId]/page.tsx`

Context: the page calls `getEmailById(emailId)` and `getActionByEmailId(emailId)` from `mock-data`. The `EmailDetail` component expects `MockEmail` and `MockEmailAction` shapes (defined in `src/lib/mock-data.ts`). Strategy: query the DB, map to those same interfaces, so `EmailDetail` requires no changes. Auth: scope by `officeId` from session — return 404 if email not found or belongs to a different office.

No unit tests needed for Next.js page components (per `testing.md`).

- [ ] **Step 1: Update the page**

Replace the entire contents of `src/app/(dashboard)/inbox/[emailId]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EmailDetail } from '@/components/dashboard/email-detail'
import type { MockEmail, MockEmailAction } from '@/lib/mock-data'

interface EmailPageProps {
  params: Promise<{ emailId: string }>
}

export default async function EmailPage({ params }: EmailPageProps) {
  const { emailId } = await params

  const session = await auth()
  if (!session?.user?.officeId) notFound()
  const officeId = session.user.officeId

  const raw = await prisma.inboundEmail.findFirst({
    where: {
      id: emailId,
      emailAccount: { officeId },
    },
    include: {
      client: { select: { name: true } },
      attachments: { select: { id: true } },
      actions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          type: true,
          status: true,
          draftContent: true,
          editedContent: true,
          aiModel: true,
          createdAt: true,
        },
      },
    },
  })

  if (!raw) notFound()

  const firstAction = raw.actions[0]

  const email: MockEmail = {
    id: raw.id,
    clientId: raw.clientId,
    clientName: raw.client?.name ?? null,
    fromEmail: raw.fromEmail,
    fromName: raw.fromName ?? raw.fromEmail,
    subject: raw.subject ?? '(sem assunto)',
    bodyText: raw.bodyText ?? '',
    receivedAt: raw.receivedAt,
    status: raw.status,
    hasAttachments: raw.attachments.length > 0,
    attachmentCount: raw.attachments.length,
    hasAction: raw.actions.length > 0,
    actionId: firstAction?.id,
  }

  const action: MockEmailAction | undefined = firstAction
    ? {
        id: firstAction.id,
        emailId: raw.id,
        type: firstAction.type as MockEmailAction['type'],
        status: firstAction.status,
        draftContent: firstAction.editedContent ?? firstAction.draftContent ?? '',
        aiModel: firstAction.aiModel ?? 'claude',
        createdAt: firstAction.createdAt,
      }
    : undefined

  return <EmailDetail email={email} action={action} />
}
```

- [ ] **Step 2: Run full test suite — verify no regressions**

```bash
npx vitest run --reporter=verbose
```

Expected: all 124 tests pass.

- [ ] **Step 3: Verify page renders**

Start the dev server (`npm run dev`) and navigate to an email in `/inbox`. Click on an email row. Verify:
- The email subject, sender, body are from real DB data (not mock)
- Emails without an AI draft show "Sem rascunho gerado"
- Emails with a draft (if any) show the AI panel

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/inbox/\[emailId\]/page.tsx
git commit -m "feat: email detail page reads from database

Replace mock-data lookups with a real Prisma query scoped to the
authenticated user's officeId. Maps DB row to the existing MockEmail/
MockEmailAction interface so EmailDetail component needs no changes.
Returns 404 for unknown emails or emails from other offices."
```

---

## Task 4: Client edit — PATCH endpoint + dialog

**Files:**
- Create: `src/app/api/clients/[clientId]/route.ts`
- Create: `src/components/dashboard/edit-client-dialog.tsx`
- Modify: `src/app/(dashboard)/clients/page.tsx`
- Test: `src/app/api/clients/[clientId]/route.test.ts`

Context: the clients table shows `knownEmails` and `emailDomains` but there is no way to edit them after creation. This causes broken client matching when accounts need new email addresses. The PATCH endpoint replaces all editable fields in one call (not a partial update).

- [ ] **Step 1: Write failing tests for the PATCH endpoint**

Create `src/app/api/clients/[clientId]/route.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx vitest run src/app/api/clients/\\[clientId\\]/route.test.ts --reporter=verbose
```

Expected: all tests fail with `Cannot find module './route'`.

- [ ] **Step 3: Implement the PATCH + GET endpoint**

Create `src/app/api/clients/[clientId]/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const updateClientSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório (mínimo 2 caracteres)'),
  nif: z
    .string()
    .regex(/^\d{9}$/, 'NIF deve ter 9 dígitos')
    .optional()
    .or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  emailDomains: z.array(z.string().min(1)).default([]),
  knownEmails: z.array(z.string().email('Email inválido')).default([]),
  notes: z.string().optional(),
})

interface RouteContext {
  params: Promise<{ clientId: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { clientId } = await params

  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId: session.user.officeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      nif: true,
      email: true,
      emailDomains: true,
      knownEmails: true,
      notes: true,
      createdAt: true,
    },
  })

  if (!client) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: client })
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { clientId } = await params

  const existing = await prisma.client.findFirst({
    where: { id: clientId, officeId: session.user.officeId, deletedAt: null },
    select: { id: true },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  const parsed = updateClientSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const { name, nif, email, emailDomains, knownEmails, notes } = parsed.data

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: {
      name,
      nif: nif || null,
      email: email || null,
      emailDomains,
      knownEmails,
      notes: notes || null,
    },
    select: {
      id: true,
      name: true,
      nif: true,
      email: true,
      emailDomains: true,
      knownEmails: true,
      notes: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ success: true, data: updated })
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npx vitest run src/app/api/clients/\\[clientId\\]/route.test.ts --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 5: Build the `EditClientDialog` component**

Create `src/components/dashboard/edit-client-dialog.tsx`:

```typescript
'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditClientDialogProps {
  client: {
    id: string
    name: string
    nif: string | null
    email: string | null
    emailDomains: string[]
    knownEmails: string[]
    notes: string | null
  }
}

interface FormErrors {
  name?: string[]
  nif?: string[]
  email?: string[]
  knownEmails?: string[]
  general?: string
}

interface TagInputProps {
  id: string
  label: string
  hint: string
  placeholder: string
  tags: string[]
  onAdd: (value: string) => void
  onRemove: (index: number) => void
  error?: string
}

function TagInput({ id, label, hint, placeholder, tags, onAdd, onRemove, error }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  function handleAdd() {
    const v = inputValue.trim().toLowerCase()
    if (v && !tags.includes(v)) {
      onAdd(v)
      setInputValue('')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold text-slate-700">
        {label}
      </label>
      <p className="mb-1.5 text-[11px] text-gray-400">{hint}</p>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-slate-900 placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Adicionar"
        >
          <Plus className="h-4 w-4 stroke-[1.75]" />
        </button>
      </div>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 ring-1 ring-green-200"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="cursor-pointer text-green-500 hover:text-green-700"
                aria-label={`Remover ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && (
        <p className="mt-1 text-[11px] text-red-600" role="alert">{error}</p>
      )}
    </div>
  )
}

export function EditClientDialog({ client }: EditClientDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<FormErrors>({})
  const [emailDomains, setEmailDomains] = useState<string[]>(client.emailDomains)
  const [knownEmails, setKnownEmails] = useState<string[]>(client.knownEmails)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Reset form to current client values every time dialog opens
  useEffect(() => {
    if (open) {
      setEmailDomains(client.emailDomains)
      setKnownEmails(client.knownEmails)
      setErrors({})
      setTimeout(() => firstInputRef.current?.focus(), 50)
    }
  }, [open, client.emailDomains, client.knownEmails])

  function closeDialog() {
    if (isPending) return
    setOpen(false)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)

    const payload = {
      name: (form.get('name') as string).trim(),
      nif: (form.get('nif') as string).trim(),
      email: (form.get('email') as string).trim(),
      notes: (form.get('notes') as string).trim(),
      emailDomains,
      knownEmails,
    }

    setErrors({})
    startTransition(async () => {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json() as { error?: string; details?: Record<string, string[]> }

      if (!res.ok) {
        if (res.status === 422 && data.details) {
          setErrors(data.details as FormErrors)
        } else {
          setErrors({ general: data.error ?? 'Erro inesperado. Tente novamente.' })
        }
        return
      }

      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        aria-label="Editar cliente"
      >
        <Pencil className="h-3.5 w-3.5 stroke-[1.75]" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-dialog-title"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDialog}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 id="edit-dialog-title" className="text-[14px] font-bold text-gray-900">
                Editar cliente
              </h2>
              <button
                type="button"
                onClick={closeDialog}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Fechar"
              >
                <X className="h-4 w-4 stroke-[1.75]" />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-4 px-5 py-4">
                {errors.general && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                    <p className="text-[12px] text-red-700" role="alert">{errors.general}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="edit-name" className="mb-1 block text-[12px] font-semibold text-slate-700">
                    Nome <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={firstInputRef}
                    id="edit-name"
                    name="name"
                    type="text"
                    required
                    defaultValue={client.name}
                    className={cn(
                      'w-full rounded-lg border bg-gray-50 px-3 py-2 text-[13px] text-slate-900 placeholder:text-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2',
                      errors.name
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                        : 'border-gray-200 focus:border-green-500 focus:ring-green-500/20',
                    )}
                  />
                  {errors.name && (
                    <p className="mt-1 text-[11px] text-red-600" role="alert">{errors.name[0]}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-nif" className="mb-1 block text-[12px] font-semibold text-slate-700">NIF</label>
                    <input
                      id="edit-nif"
                      name="nif"
                      type="text"
                      inputMode="numeric"
                      maxLength={9}
                      defaultValue={client.nif ?? ''}
                      placeholder="123456789"
                      className={cn(
                        'w-full rounded-lg border bg-gray-50 px-3 py-2 text-[13px] text-slate-900 placeholder:text-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2',
                        errors.nif
                          ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                          : 'border-gray-200 focus:border-green-500 focus:ring-green-500/20',
                      )}
                    />
                    {errors.nif && (
                      <p className="mt-1 text-[11px] text-red-600" role="alert">{errors.nif[0]}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="edit-email" className="mb-1 block text-[12px] font-semibold text-slate-700">Email principal</label>
                    <input
                      id="edit-email"
                      name="email"
                      type="email"
                      defaultValue={client.email ?? ''}
                      placeholder="geral@empresa.pt"
                      className={cn(
                        'w-full rounded-lg border bg-gray-50 px-3 py-2 text-[13px] text-slate-900 placeholder:text-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2',
                        errors.email
                          ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                          : 'border-gray-200 focus:border-green-500 focus:ring-green-500/20',
                      )}
                    />
                    {errors.email && (
                      <p className="mt-1 text-[11px] text-red-600" role="alert">{errors.email[0]}</p>
                    )}
                  </div>
                </div>

                <TagInput
                  id="edit-emailDomains"
                  label="Domínios de email"
                  hint="Emails deste domínio serão associados automaticamente a este cliente."
                  placeholder="empresa.pt"
                  tags={emailDomains}
                  onAdd={(v) => setEmailDomains((p) => [...p, v])}
                  onRemove={(i) => setEmailDomains((p) => p.filter((_, idx) => idx !== i))}
                />

                <TagInput
                  id="edit-knownEmails"
                  label="Emails conhecidos"
                  hint="Endereços específicos que pertencem a este cliente."
                  placeholder="joao@empresa.pt"
                  tags={knownEmails}
                  onAdd={(v) => setKnownEmails((p) => [...p, v])}
                  onRemove={(i) => setKnownEmails((p) => p.filter((_, idx) => idx !== i))}
                  error={errors.knownEmails?.[0]}
                />

                <div>
                  <label htmlFor="edit-notes" className="mb-1 block text-[12px] font-semibold text-slate-700">Notas</label>
                  <textarea
                    id="edit-notes"
                    name="notes"
                    rows={2}
                    defaultValue={client.notes ?? ''}
                    placeholder="Observações internas..."
                    className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-slate-900 placeholder:text-gray-400 transition-colors focus:border-green-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={isPending}
                  className="h-8 cursor-pointer rounded-lg px-3 text-[12px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-green-600 px-4 text-[12px] font-bold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      A guardar...
                    </>
                  ) : (
                    'Guardar alterações'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 6: Add Edit button to the clients table**

In `src/app/(dashboard)/clients/page.tsx`, add the import at the top:

```typescript
import { EditClientDialog } from '@/components/dashboard/edit-client-dialog'
```

Then in the table row (after the `attachmentCount` cell), add a new column header and cell. First, update the headers array:

Replace:
```typescript
{['Nome', 'NIF', 'Email', 'Domínios / Emails conhecidos', 'Emails'].map((h) => (
```
with:
```typescript
{['Nome', 'NIF', 'Email', 'Domínios / Emails conhecidos', 'Emails', ''].map((h) => (
```

Then add a new `<td>` at the end of each row (after the Emails count cell):

```typescript
{/* Edit */}
<td className="px-3 py-3">
  <EditClientDialog client={client} />
</td>
```

- [ ] **Step 7: Run tests — verify all pass**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass (124 existing + new route tests).

- [ ] **Step 8: Verify edit flow manually**

Start `npm run dev`. Navigate to `/clients`. Click the pencil icon on the client row. Add `edgaralvesinf@gmail.com` to "Emails conhecidos". Save. Verify the tag appears in the table immediately.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/clients/\\[clientId\\]/route.ts src/app/api/clients/\\[clientId\\]/route.test.ts src/components/dashboard/edit-client-dialog.tsx src/app/\\(dashboard\\)/clients/page.tsx
git commit -m "feat: client edit — PATCH endpoint and dialog

Add PATCH /api/clients/[clientId] to update name, nif, email,
emailDomains, knownEmails, and notes. Scoped to authenticated
office (returns 404 for cross-office access attempts).
EditClientDialog reuses the TagInput pattern from NewClientDialog
and pre-fills with current client data. Clients table gets a
pencil-icon edit button per row."
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| GmailProvider creates EmailAttachment records | Task 1 |
| Attachment extraction is idempotent | Task 1 (findMany + skip existing) |
| document-parse worker uses real text extraction | Task 2 |
| Email detail page reads from DB | Task 3 |
| Detail page scoped to authenticated office | Task 3 (officeId check) |
| Client edit (knownEmails/emailDomains) | Task 4 |
| Client edit scoped to authenticated office | Task 4 (findFirst + officeId) |
| Tests for all new server-side logic | Tasks 1, 4 |

### Placeholder scan

No TODOs, TBDs, or "similar to task N" references. All code blocks are complete.

### Type consistency

- `AttachmentPart` interface defined in Task 1 and only used in Task 1.
- `MockEmail` / `MockEmailAction` imported from `@/lib/mock-data` in Task 3 — matches the existing type.
- `updateClientSchema` in Task 4 mirrors `createClientSchema` in `route.ts` exactly (same field names).
- `EditClientDialogProps.client` in Task 4 matches the Prisma `select` fields used in the clients page.

### Gaps

The `delete-client-dialog.tsx` (soft delete) is not in scope for this plan — fits in a separate task. The approval/rejection API wiring (EmailDetail currently uses client-side store, not real DB calls) is left for the next phase after this pipeline is complete.
