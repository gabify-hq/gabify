---
description: Testing rules for Gabify — unit tests required for all new functionality
---

# Testing Rules

## Non-negotiable: tests ship with the feature

Every new function, service, worker, or utility must have unit tests.
A feature is not done until tests exist and pass.

## Test framework

Vitest (not Jest) — faster, native ESM, compatible with Next.js 14.

```bash
npm run test          # run all tests
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

## File co-location

Tests live next to the code they test:

```
src/server/services/client-matching.ts
src/server/services/client-matching.test.ts

src/server/services/email-classification.ts
src/server/services/email-classification.test.ts

src/queues/email-sync.worker.ts
src/queues/email-sync.worker.test.ts
```

Never put tests in a separate `__tests__/` folder.

## What must be tested

### Always test:
- `src/server/services/` — all service functions
- `src/server/email-providers/` — provider logic (mock external API calls)
- `src/queues/` — worker job processing logic
- `src/lib/` — utility functions (r2 key builder, etc.)
- API route handlers — happy path + validation errors + auth check

### Test through public interfaces, not internals:
```typescript
// CORRECT — test the public function
const result = await matchClientByEmail(officeId, 'joao@empresa.pt')
expect(result.clientId).toBe('client-123')
expect(result.matchedBy).toBe('known_email')

// WRONG — don't test internal DB query structure
expect(prisma.client.findMany).toHaveBeenCalledWith({ where: { ... } })
```

## Mocking rules

- **Prisma**: mock with `vitest-mock-extended` or manual mocks — never hit real DB in unit tests
- **External APIs** (Graph, Gmail, R2, Anthropic): always mock — never real network in unit tests
- **Redis/BullMQ**: mock queue — never real Redis in unit tests
- Use `vi.mock()` at the top of the file, `vi.mocked()` for typed access

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'

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
```

## Test structure

Use `describe` + `it` with descriptive names that read as specifications:

```typescript
describe('matchClientByEmail', () => {
  it('returns exact match when email is in knownEmails', async () => { ... })
  it('returns domain match when email domain matches emailDomains', async () => { ... })
  it('returns no match when neither email nor domain matches', async () => { ... })
  it('returns highest confidence match when multiple clients match', async () => { ... })
})
```

## Coverage targets

- Services: 90%+
- Workers: 80%+
- API routes: 70%+
- Utility functions: 100%

## TDD approach (preferred)

Follow red → green → refactor for services and workers:
1. Write failing test first
2. Write minimal code to make it pass
3. Refactor — tests should still pass

## What NOT to test

- Next.js page components (UI) — covered by e2e later
- Prisma schema itself
- Third-party library internals
- TODOs / stub implementations (ImapProvider, etc.)
