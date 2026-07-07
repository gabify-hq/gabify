# PROGRESS_ASSISTANT.md — Assistente de Perguntas (read-only) v1

Registo de execução do módulo assistant (`feature/gabify-assistant`), em paralelo
com outro agente — ficheiro próprio, não tocar em PROGRESS.md/HANDOFF.md.
Regras da secção 0 da spec base em vigor (RED-first nos [INV], gate verde, commits atómicos).

## Restrições de execução paralela (cumpridas)

- Branch próprio `feature/gabify-assistant` a partir de `origin/staging`, em worktree
  `.claude/worktrees/assistant` (diretório principal ocupado por outra sessão).
- BD de teste isolada `gabify_test_assistant` via `TEST_DATABASE_URL`.
- ZERO alterações a `prisma/schema.prisma`, migrations, auth/adapter/convites,
  middleware, pipeline de upload, `/portal`.
- Pontos de contacto append-only: mapa do `can()` (ação `assistant:query`) e navegação.

## Slices

| Slice | Estado | RED | Gate |
|---|---|---|---|
| Acceptance assistant escrita (catálogo fechado, isolamento 5 tools, officeId forjado, IVA ao cêntimo, zod no loop, 6.ª call cortada, AuditLog, prompt-injection, can(), rate limit 20/min, erros limpos — 24 testes) | DONE | ✅ import-level RED confirmado (2026-07-07): `Cannot find package '@/server/services/assistant-tools'` — 0 testes correm antes da implementação | — |
| GREEN backend: `assistant-tools.ts` (5 tools zod+officeId server-side, agregação SQL em cêntimos), `assistant-service.ts` (loop máx 5, AuditLog antes da resposta, hardening anti-injection no system prompt), rota `POST /api/assistant/query` (guard `assistant:query`, rate limit 20/min, 422/429/502 limpos), can() e rate-limit com appends merge-safe, `ASSISTANT_MODEL` no .env.example | DONE | — | ✅ 24/24 + tsc 0 + eslint 0 erros |
