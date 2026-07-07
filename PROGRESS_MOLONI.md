# PROGRESS_MOLONI.md

Branch: `feature/moloni-source` (worktree `../gabify-moloni`, base `origin/staging`)
Scope: Moloni as SOURCE (pull of issued invoices) v1 — doc-driven, no real
API testing, **no schema/DB** (persistence slice is post-merge).

| Step | Status |
|---|---|
| 0. Docs fetched verbatim → `integrations/moloni/docs/` (+ raw HTML) | ✅ |
| 0b. Doc-driven decisions → `INTEGRATION_NOTES_MOLONI.md` | ✅ |
| 1. Source contract → `src/server/sources/types.ts` | ✅ |
| 2. 🔴RED [INV] suites against doc-derived mock (33 failed / 12 contract) | ✅ |
| 3. 🟢GREEN — MoloniConnector (HTTP client, token mgr, mapper, money) — 45/45 | ✅ |
| 4. Handoff → `HANDOFF_MOLONI.md` (+ `.env.example` placeholders) | ✅ |
| 5. Quality gate (tsc, eslint, vitest, coverage) on isolated `gabify_test_moloni` | ✅ |

Estado final: **IMPLEMENTADO / NÃO LIGADO À BD / NÃO TESTADO CONTRA API REAL**

Forbidden zone respected: no `prisma/**`, no toconline files, no ExportTarget/
export flow, no client-page UI, no auth/middleware/portal. Contact points
append-only: `.env.example` (Moloni developer creds placeholders); no
`package.json` change needed (zero new dependencies).
