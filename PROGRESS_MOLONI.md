# PROGRESS_MOLONI.md

Branch: `feature/moloni-source` (worktree `../gabify-moloni`, base `main`)
Scope: Moloni as SOURCE (pull of issued invoices) v1 — doc-driven, no real
API testing, **no schema/DB** (persistence slice is post-merge).

| Step | Status |
|---|---|
| 0. Docs fetched verbatim → `integrations/moloni/docs/` (+ raw HTML) | ✅ |
| 0b. Doc-driven decisions → `INTEGRATION_NOTES_MOLONI.md` | ✅ |
| 1. Source contract → `src/server/sources/types.ts` | ⏳ |
| 2. 🔴RED [INV] suites against doc-derived mock | ⏳ |
| 3. 🟢GREEN — MoloniConnector (HTTP client, token mgr, mapper, money) | ⏳ |
| 4. Handoff → `HANDOFF_MOLONI.md` | ⏳ |

Forbidden zone respected: no `prisma/**`, no toconline files, no ExportTarget/
export flow, no client-page UI, no auth/middleware/portal. Contact points
append-only: `.env.example`, `package.json`.
