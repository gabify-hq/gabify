# Unknown Sender Association Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an email arrives from an unknown sender, surface it in the inbox so the accountant can associate that address to an existing client in 2 clicks — and all historical + future emails from that sender match automatically.

**Architecture:** New API endpoint `POST /api/emails/associate-sender` adds the email address to `Client.knownEmails` and retroactively matches all historical unmatched emails from that sender via `updateMany`. The inbox page gains a "Remetentes por identificar" section (groupBy query) with one `AssociateSenderDialog` per unknown sender. The dashboard homepage shows the count.

**Tech Stack:** TypeScript, Prisma (PostgreSQL `groupBy` + `mode: 'insensitive'`), Zod, Next.js 16 App Router, shadcn/ui, Vitest

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/app/api/emails/associate-sender/route.ts` | Create | POST: add email to client.knownEmails + retroactive updateMany |
| `src/app/api/emails/associate-sender/route.test.ts` | Create | 7 tests covering auth, 404, 422, happy path, retroactive match, idempotency |
| `src/components/dashboard/associate-sender-dialog.tsx` | Create | Client component — dropdown of clients, confirm button, calls API |
| `src/app/(dashboard)/inbox/page.tsx` | Modify | Add groupBy unknown senders + clients list query + new section |
| `src/app/(dashboard)/page.tsx` | Modify | Add unknown senders count stat + action card |

---

## Task 1: POST /api/emails/associate-sender

**Files:**
- Create: `src/app/api/emails/associate-sender/route.ts`
- Create: `src/app/api/emails/associate-sender/route.test.ts`

Context: The endpoint receives `{ fromEmail, clientId }`. It verifies both belong to the authenticated office, pushes `fromEmail` (lowercased) into `client.knownEmails` if not already present, then runs a single `updateMany` to retroactively assign all unmatched emails from that sender. Returns `{ emailsMatched: N }` so the UI can show feedback.

- [ ] **Step 1: Write failing tests**

Create `src/app/api/emails/associate-sender/route.test.ts`:

```typescript
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
  return { user: { officeId, id: 'user-1' } }
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
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
npx vitest run "src/app/api/emails/associate-sender/route.test.ts" --reporter=verbose
```

Expected: all 7 tests fail with `Cannot find module './route'`.

- [ ] **Step 3: Implement the endpoint**

Create `src/app/api/emails/associate-sender/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const associateSenderSchema = z.object({
  fromEmail: z.string().email('Email inválido'),
  clientId: z.string().min(1, 'Cliente obrigatório'),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.officeId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const officeId = session.user.officeId

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  const parsed = associateSenderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const { fromEmail, clientId } = parsed.data
  const emailLower = fromEmail.toLowerCase()

  const client = await prisma.client.findFirst({
    where: { id: clientId, officeId, deletedAt: null },
    select: { id: true, knownEmails: true },
  })

  if (!client) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  // Add to knownEmails only if not already present (case-insensitive check)
  const alreadyKnown = client.knownEmails.some(
    (e) => e.toLowerCase() === emailLower
  )

  if (!alreadyKnown) {
    await prisma.client.update({
      where: { id: clientId },
      data: { knownEmails: { push: emailLower } },
    })
  }

  // Retroactively match all unmatched emails from this sender in this office
  const { count: emailsMatched } = await prisma.inboundEmail.updateMany({
    where: {
      emailAccount: { officeId },
      fromEmail: { equals: emailLower, mode: 'insensitive' },
      clientId: null,
    },
    data: { clientId, clientMatchScore: 1.0 },
  })

  return NextResponse.json({ success: true, data: { emailsMatched } })
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npx vitest run "src/app/api/emails/associate-sender/route.test.ts" --reporter=verbose
```

Expected: 7/7 tests pass.

- [ ] **Step 5: Run full suite — verify no regressions**

```bash
npx vitest run --reporter=verbose
```

Expected: all 135 existing tests + 7 new = 142 pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/emails/associate-sender/route.ts src/app/api/emails/associate-sender/route.test.ts
git commit -m "feat: POST /api/emails/associate-sender

Add email to client.knownEmails (idempotent) and retroactively
assign all unmatched emails from that sender in one updateMany.
Returns emailsMatched count for UI feedback."
```

---

## Task 2: AssociateSenderDialog component

**Files:**
- Create: `src/components/dashboard/associate-sender-dialog.tsx`

Context: Client component. Receives the unknown sender's email, email count, and the full client list (passed from server component). Shows a native `<select>` with all clients sorted alphabetically. On confirm, calls `POST /api/emails/associate-sender`, shows inline success (`3 emails associados`) or error, then calls `router.refresh()`.

No unit tests needed — UI component with no business logic. Tested visually.

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/associate-sender-dialog.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Loader2, X, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Client {
  id: string
  name: string
}

interface AssociateSenderDialogProps {
  fromEmail: string
  emailCount: number
  clients: Client[]
}

export function AssociateSenderDialog({
  fromEmail,
  emailCount,
  clients,
}: AssociateSenderDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ emailsMatched: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function openDialog() {
    setSelectedClientId(clients[0]?.id ?? '')
    setResult(null)
    setError(null)
    setOpen(true)
  }

  function closeDialog() {
    if (isPending) return
    setOpen(false)
  }

  function handleConfirm() {
    if (!selectedClientId) return

    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/emails/associate-sender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEmail, clientId: selectedClientId }),
      })

      const data = await res.json() as {
        success?: boolean
        data?: { emailsMatched: number }
        error?: string
      }

      if (!res.ok) {
        setError(data.error ?? 'Erro inesperado. Tente novamente.')
        return
      }

      setResult(data.data ?? { emailsMatched: 0 })
      router.refresh()

      // Auto-close after 1.5s so user sees the success message
      setTimeout(() => setOpen(false), 1500)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        aria-label={`Associar ${fromEmail} a um cliente`}
      >
        <UserPlus className="h-3 w-3 stroke-[1.75]" aria-hidden="true" />
        Associar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="associate-dialog-title"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDialog}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2
                id="associate-dialog-title"
                className="text-[14px] font-bold text-gray-900"
              >
                Identificar remetente
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

            <div className="px-5 py-4">
              {/* Sender info */}
              <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Remetente
                </p>
                <p className="mt-0.5 text-[13px] font-semibold text-gray-900">
                  {fromEmail}
                </p>
                <p className="text-[11px] text-gray-500">
                  {emailCount} email{emailCount !== 1 ? 's' : ''} por associar
                </p>
              </div>

              {result ? (
                /* Success state */
                <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                  <p className="text-[12px] font-semibold text-green-800">
                    {result.emailsMatched} email{result.emailsMatched !== 1 ? 's' : ''} associado{result.emailsMatched !== 1 ? 's' : ''}
                  </p>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <p className="text-[12px] text-red-700" role="alert">{error}</p>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="associate-client-select"
                      className="mb-1.5 block text-[12px] font-semibold text-slate-700"
                    >
                      Associar a cliente
                    </label>
                    <select
                      id="associate-client-select"
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      disabled={isPending}
                      className={cn(
                        'w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-slate-900',
                        'focus:border-green-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20',
                        'disabled:opacity-50'
                      )}
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {!result && (
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
                  type="button"
                  onClick={handleConfirm}
                  disabled={isPending || !selectedClientId}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-green-600 px-4 text-[12px] font-bold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      A associar...
                    </>
                  ) : (
                    'Confirmar'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/associate-sender-dialog.tsx
git commit -m "feat: AssociateSenderDialog component

Dropdown of all office clients, confirm button, calls
/api/emails/associate-sender. Shows success message with
retroactive match count then auto-closes. Error state inline."
```

---

## Task 3: Unknown senders section in inbox

**Files:**
- Modify: `src/app/(dashboard)/inbox/page.tsx`

Context: Add two queries to the page: (1) `groupBy` to get unknown senders with email count, (2) client list for the dropdown. If there are unknown senders, render a yellow banner section above the email list with one row per unknown sender and an `AssociateSenderDialog`.

- [ ] **Step 1: Read the current inbox page**

Read `src/app/(dashboard)/inbox/page.tsx` — the full file is 109 lines. Understand the current structure before editing.

- [ ] **Step 2: Update the inbox page**

Replace the entire contents of `src/app/(dashboard)/inbox/page.tsx` with:

```typescript
import { Inbox, AlertCircle } from 'lucide-react'
import { EmailList } from '@/components/dashboard/email-list'
import { AssociateSenderDialog } from '@/components/dashboard/associate-sender-dialog'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { MockEmail, MockEmailAction } from '@/lib/mock-data'

export default async function InboxPage() {
  const session = await auth()
  const officeId = session?.user?.officeId ?? ''

  const [rawEmails, unknownSenders, clients] = await Promise.all([
    officeId
      ? prisma.inboundEmail.findMany({
          where: { emailAccount: { officeId } },
          include: {
            client: { select: { name: true } },
            actions: {
              select: { id: true, status: true, type: true, draftContent: true, aiModel: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            attachments: { select: { id: true } },
          },
          orderBy: { receivedAt: 'desc' },
          take: 50,
        })
      : Promise.resolve([]),

    officeId
      ? prisma.inboundEmail.groupBy({
          by: ['fromEmail'],
          where: { emailAccount: { officeId }, clientId: null },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 20,
        })
      : Promise.resolve([]),

    officeId
      ? prisma.client.findMany({
          where: { officeId, deletedAt: null },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

  const emails: MockEmail[] = rawEmails.map((e) => {
    const firstAction = e.actions[0]
    return {
      id: e.id,
      clientId: e.clientId,
      clientName: e.client?.name ?? null,
      fromEmail: e.fromEmail,
      fromName: e.fromName ?? e.fromEmail,
      subject: e.subject ?? '(sem assunto)',
      bodyText: e.bodyText ?? '',
      receivedAt: e.receivedAt,
      status: e.status,
      hasAttachments: e.attachments.length > 0,
      attachmentCount: e.attachments.length,
      hasAction: e.actions.length > 0,
      actionId: firstAction?.id,
    }
  })

  const actions: MockEmailAction[] = rawEmails.flatMap((e) =>
    e.actions.map((a) => ({
      id: a.id,
      emailId: e.id,
      type: a.type as MockEmailAction['type'],
      status: a.status,
      draftContent: a.draftContent ?? '',
      aiModel: a.aiModel ?? 'claude',
      createdAt: a.createdAt,
    })),
  )

  const unread = emails.filter((e) => e.status === 'UNREAD').length
  const pendingCount = actions.filter((a) => a.status === 'PENDING_REVIEW').length

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Inbox className="h-4 w-4 stroke-[1.75] text-gray-400" />
          <h1 className="text-[14px] font-bold text-gray-900">Caixa de entrada</h1>
          <span className="data rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
            {emails.length}
          </span>
          {unread > 0 && (
            <span className="data rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
              {unread} não lidos
            </span>
          )}
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-[11px] font-semibold text-amber-700">
              {pendingCount} rascunho{pendingCount > 1 ? 's' : ''} pendente{pendingCount > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        {/* Unknown senders banner */}
        {unknownSenders.length > 0 && clients.length > 0 && (
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-[12px] font-bold text-amber-800">
                {unknownSenders.length} remetente{unknownSenders.length !== 1 ? 's' : ''} por identificar
              </p>
            </div>
            <div className="space-y-1.5">
              {unknownSenders.map((sender) => (
                <div
                  key={sender.fromEmail}
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-gray-900">
                      {sender.fromEmail}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {sender._count.id} email{sender._count.id !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <AssociateSenderDialog
                    fromEmail={sender.fromEmail}
                    emailCount={sender._count.id}
                    clients={clients}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unknown senders exist but no clients yet */}
        {unknownSenders.length > 0 && clients.length === 0 && (
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-[12px] font-semibold text-amber-800">
                {unknownSenders.length} remetente{unknownSenders.length !== 1 ? 's' : ''} por identificar —{' '}
                <a href="/clients" className="underline hover:text-amber-900">
                  crie clientes primeiro
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Email list or empty state */}
        {emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Inbox className="mb-3 h-8 w-8 stroke-[1] text-gray-300" />
            <p className="text-[13px] font-semibold text-gray-500">Nenhum email recebido ainda.</p>
            <p className="mt-1 text-[12px] text-gray-400">
              Ligue uma conta de email nas{' '}
              <a href="/settings" className="font-medium text-green-600 hover:underline">
                Definições
              </a>
              .
            </p>
          </div>
        ) : (
          <EmailList emails={emails} actions={actions} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are errors about `groupBy` return type, note that `prisma.inboundEmail.groupBy` with `_count` returns `Array<{ fromEmail: string; _count: { id: number } }>`.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all 142 tests pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/inbox/page.tsx"
git commit -m "feat: unknown senders section in inbox

Show amber banner in inbox when emails have clientId=null.
groupBy query gets unique senders + email count. AssociateSenderDialog
per row. Falls back gracefully when no clients exist yet."
```

---

## Task 4: Dashboard — unknown senders count

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

Context: Add a 5th stat card "Por identificar" with the count of distinct unknown senders. If count > 0, add an action card in the "Acesso rápido" section linking to `/inbox`.

- [ ] **Step 1: Read the current dashboard page**

Read `src/app/(dashboard)/page.tsx` — 149 lines. Understand the current 4-stat grid and action cards before editing.

- [ ] **Step 2: Add unknown senders count to dashboard**

In `src/app/(dashboard)/page.tsx`, make the following changes:

**2a.** Add `UserX` to the lucide-react import:

```typescript
import { Inbox, Users, Mail, FileText, UserX } from 'lucide-react'
```

**2b.** Add a 5th parallel query in the `Promise.all`:

Replace:
```typescript
  const [totalEmails, unreadEmails, pendingDrafts, totalClients] = await Promise.all([
```
with:
```typescript
  const [totalEmails, unreadEmails, pendingDrafts, totalClients, unknownSendersCount] = await Promise.all([
```

And add as the 5th item in the array (after the `totalClients` query):

```typescript
    officeId
      ? prisma.inboundEmail.groupBy({
          by: ['fromEmail'],
          where: { emailAccount: { officeId }, clientId: null },
          _count: { id: true },
        }).then((rows) => rows.length)
      : Promise.resolve(0),
```

**2c.** Change the stats grid from `sm:grid-cols-4` to `sm:grid-cols-5`:

```typescript
<div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
```

**2d.** Add the 5th stat card after the "Total clientes" card:

```typescript
<StatCard
  label="Por identificar"
  value={unknownSendersCount}
  icon={<UserX className="h-4 w-4 stroke-[1.75] text-amber-600" />}
  accent="bg-amber-50"
/>
```

**2e.** In the "Acesso rápido" section, add a link to inbox when there are unknown senders (add after the "Clientes" link):

```typescript
{unknownSendersCount > 0 && (
  <a
    href="/inbox"
    className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-semibold text-amber-800 transition-colors duration-150 hover:bg-amber-100"
  >
    <UserX className="h-3.5 w-3.5 stroke-[1.75] text-amber-600" />
    Identificar remetentes
    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-200 px-1.5 text-[10px] font-bold text-amber-800">
      {unknownSendersCount}
    </span>
  </a>
)}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all 142 tests pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/page.tsx"
git commit -m "feat: unknown senders count on dashboard

Add 5th stat card 'Por identificar' with count of distinct unknown
senders. When > 0, show amber action link to inbox in quick access."
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Email arrives from unknown sender → stays `clientId: null` | Already works — no change needed |
| Dashboard shows "por identificar" count | Task 4 |
| Inbox shows list of unknown senders | Task 3 |
| Accountant clicks and associates in 2 clicks | Task 2 (dialog) |
| Email added to `client.knownEmails` | Task 1 (API) |
| All historical emails from that sender retroactively matched | Task 1 (`updateMany`) |
| Next sync auto-matches future emails | Already works — worker re-tries all `clientId: null` |
| Idempotent — adding same email twice is safe | Task 1 (`alreadyKnown` check) + test covers it |

### Placeholder scan

No TODOs, TBDs, or "similar to Task N". All code blocks complete.

### Type consistency

- `AssociateSenderDialog` props: `{ fromEmail: string, emailCount: number, clients: { id: string, name: string }[] }` — consistent across Task 2 (definition) and Task 3 (usage).
- `groupBy` return type: `{ fromEmail: string, _count: { id: number } }[]` — used correctly in Task 3 (`sender._count.id`) and Task 4 (`.then(rows => rows.length)`).
- API response: `{ success: true, data: { emailsMatched: number } }` — consistent between Task 1 (endpoint) and Task 2 (dialog consumer).

### Gaps

None. The "no clients yet" edge case in inbox (Task 3) is handled with a fallback message. The dashboard stat shows 0 when no unknowns — no special empty state needed.
