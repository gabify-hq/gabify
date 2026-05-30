---
name: prisma-migrate
description: Create and apply a Prisma migration safely. Use when making schema changes, adding models, or modifying existing fields.
argument-hint: [description of schema change]
---

# Skill: Prisma Migrate

## Steps (always in this order)
1. Make changes to `prisma/schema.prisma`
2. Run `npx prisma generate` — verify TypeScript types compile
3. Run `npx prisma migrate dev --name <semantic-name>`
4. Verify migration SQL in `prisma/migrations/` looks correct
5. Update any affected service files to use new types

## Migration Naming Convention
```
add-<model>                     — new model
add-<field>-to-<model>          — new field on existing model
remove-<field>-from-<model>     — drop field
rename-<old>-to-<new>           — rename
add-index-<model>-<field>       — new index
```

## Schema Change Checklist
- [ ] Added `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt` to new models
- [ ] Soft-delete pattern: `deletedAt DateTime?` if records should not be hard-deleted
- [ ] New enums added to both `schema.prisma` AND `src/types/index.ts`
- [ ] Foreign keys have explicit `onDelete` behaviour defined
- [ ] Indexes added for fields used in `where` clauses (especially `officeId`, `clientId`, `provider`)

## Gotchas
- NEVER run `prisma db push` — it bypasses migration history
- After adding a required field to an existing table: provide a default or make it optional, otherwise migration will fail on non-empty tables
- `prisma generate` must run before TypeScript will recognise new model types — do this before writing service code
- Check migration SQL for unexpected `DROP` statements — Prisma sometimes renames instead of migrating
