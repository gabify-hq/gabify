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
| Acceptance assistant escrita (catálogo fechado, isolamento 5 tools, officeId forjado, IVA ao cêntimo, zod no loop, 6.ª call cortada, AuditLog, prompt-injection, can(), rate limit 20/min, erros limpos — 19 testes) | DONE | ✅ import-level RED confirmado (2026-07-07): `Cannot find package '@/server/services/assistant-tools'` — 0 testes correm antes da implementação | — |
