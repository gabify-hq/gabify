---
name: api-scaffold
description: Scaffold a new Next.js App Router API route following Gabify patterns. Use when creating new API endpoints, route handlers, or server actions.
argument-hint: [route path and method, e.g. "POST /api/emails/[id]/approve"]
---

# Skill: API Scaffold

## File Location Convention
```
src/app/api/<resource>/route.ts          — collection (GET list, POST create)
src/app/api/<resource>/[id]/route.ts     — item (GET one, PATCH, DELETE)
src/app/api/<resource>/[id]/<action>/route.ts  — actions (POST approve, POST reject)
```

## Route Handler Template
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const RequestSchema = z.object({
  // define fields here
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Auth
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Validate
  const body = await request.json()
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // 3. Business logic
  try {
    // TODO: implement
  } catch (error) {
    console.error('[route] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

## Rules
- Auth check is ALWAYS first — before parsing body
- Always use Zod schema — never `as SomeType` on raw request body
- AuditLog entry required for any write operation that involves AI output
- Return `{ error: string }` for errors, `{ data: T }` for success
- No business logic in route files — call service functions from `src/server/services/`
- Webhook routes (`src/app/api/webhooks/`) verify signature before queuing job

## Gotchas
- `params` in App Router are async in Next.js 15 — use `await params` if upgrading
- Never `console.log` sensitive data (tokens, email content) — use structured logging
- Return 200 immediately on webhook receipt — process async in BullMQ
