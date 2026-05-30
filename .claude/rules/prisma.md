---
description: Prisma and database rules for Gabify
---

# Prisma Rules

## Migrations
- Always `npx prisma migrate dev --name <semantic-name>` — name must describe the change (e.g. `add-email-account-delta-link`)
- NEVER `npx prisma db push` outside local dev scratch work
- After any schema change: run `npx prisma generate` before writing service code that uses the new types

## Client Singleton
Use the singleton in `src/lib/prisma.ts` — never instantiate `new PrismaClient()` elsewhere.

## Soft Deletes
Gabify does not hard-delete records. Use `deletedAt: DateTime?` pattern for clients, emails, documents. Filter `where: { deletedAt: null }` in all queries.

## Enums
All enums are defined in `schema.prisma` and mirrored in `src/types/`. When adding a new enum value, update both places and create a migration.

## Relations
- Always use `onDelete: Cascade` for child records that have no meaning without parent (e.g. `EmailAttachment` without `InboundEmail`)
- Use `onDelete: Restrict` for records that should block deletion (e.g. `Office` with active `User` records)

## Query Patterns
- Use `select` to avoid over-fetching — never return full models with all relations to the client
- Paginate all list queries — default limit 50, max 200
- Use transactions for operations that touch multiple tables atomically
