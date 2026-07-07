# HANDOFF_ASSISTANT.md — Assistente de Perguntas (read-only) v1

Execução autónoma em `feature/gabify-assistant` (base `origin/staging`,
worktree `.claude/worktrees/assistant`), em PARALELO com outro agente noutro
branch. **SEM merge, SEM push** — integração é decisão humana.

## O que foi entregue

Chat read-only onde o contabilista pergunta em linguagem natural sobre os
dados do SEU office (paridade "Kabi" do Kabilio). O assistente nunca escreve
— por arquitetura, não por prompt.

- **Catálogo fechado anti text-to-SQL** (`src/server/services/assistant-tools.ts`):
  `search_documents`, `aggregate_documents`, `find_duplicate_suspects`,
  `search_bank_transactions`, `reconciliation_summary`. Zod `.strict()`,
  officeId injetado da sessão (parâmetro forjado do modelo é removido),
  listas máx 50, TODA a agregação em SQL sobre cêntimos inteiros (A1;
  `vatBreakdown` via `jsonb_array_elements`). Teste de arquitetura garante
  zero métodos de escrita no módulo.
- **Loop de conversa** (`assistant-service.ts`): `ASSISTANT_MODEL` (Haiku por
  omissão), máx 5 tool calls/pergunta (6.ª cortada), tool call inválida →
  tool_result de erro e o loop continua, AuditLog `ASSISTANT_QUERY`
  (pergunta + tools) ANTES da resposta — também no caminho de falha
  (`failed: true`). Falha do modelo → `AssistantError` → 502 limpo pt-PT.
- **Rota** `POST /api/assistant/query`: `guard('assistant:query')`, rate
  limit 20/min/user, body zod, nunca 500.
- **RBAC**: ação `assistant:query` — OWNER/ACCOUNTANT/VIEWER sim (é leitura);
  roles desconhecidos (ex.: futuro CLIENT do portal) negados explicitamente
  pelo lookup do MATRIX. Extensão append-only no fim de `can.ts` para merge
  limpo com o branch paralelo.
- **UI `/assistant`**: chat mobile-first pt-PT, histórico só em memória
  (zero schema), 4 perguntas sugeridas, tabelas construídas dos dados
  estruturados do servidor com badges no mapeamento de cores global, links
  para ecrãs existentes (`/review?flag=…`, `/review?status=…`, `/documents`,
  `/bank?status=…`), export CSV client-side (BOM, `;`, vírgula — A9),
  estados loading/vazio/erro com retry. Link "Assistente" na sidebar
  (inserção append-only).

## Testes

- `tests/acceptance/assistant.test.ts` — 24 testes, **RED import-level
  confirmado antes de implementar** (registado em PROGRESS_ASSISTANT.md):
  isolamento cross-office parametrizado nas 5 tools, officeId forjado
  ignorado, IVA por taxa exato ao cêntimo, zod no loop, 6.ª call cortada,
  AuditLog, prompt-injection nos dados (scope intacto), can(), rate limit,
  erros limpos.
- `src/components/dashboard/assistant-chat.test.tsx` — 4 testes de
  componente (sugestões→envio, tabela+CSV+links, erro com retry, disabled
  durante loading).
- Mock próprio de tool-use em `tests/mocks/assistant-ai.ts` (o `mocks/ai.ts`
  partilhado ficou intocado).
- BD de teste isolada: `TEST_DATABASE_URL=…/gabify_test_assistant`.

## Restrições paralelas — cumprimento

- **Zero** alterações a `prisma/schema.prisma`, `prisma/migrations/**`,
  auth/adapter/convites, middleware/proxy, pipeline de upload, `/portal`.
- Pontos de contacto só por inserção de linhas (merge-safe): `can.ts` (união
  de tipos + bloco de extensão no fim), `rate-limit.ts` (função nova no fim),
  `sidebar.tsx` (import + item novo), `.env.example` (bloco no fim),
  `docs/HOW_IT_WORKS.md` (secção no fim).
- Docs de progresso próprios: `PROGRESS_ASSISTANT.md` + este ficheiro;
  `PROGRESS.md`/`HANDOFF.md` intocados.

## Envs novas

`ASSISTANT_MODEL` (default `claude-haiku-4-5-20251001`),
`RATE_LIMIT_ASSISTANT_PER_MIN` (default 20) — documentadas em `.env.example`.

## Fora de âmbito (v1, por spec)

Ações de escrita, memória entre sessões, perguntas sobre emails, anexos no
chat, streaming, qualquer alteração de schema. Persistência de conversas e
deep-links clientName→clientId ficam como futuro (ver
`docs/technical/assistant.md`).

## Notas de integração

- No merge com o branch paralelo: os pontos de contacto são inserções puras —
  conflitos improváveis; se o outro branch introduzir o role CLIENT, o deny
  do assistente já o cobre (teste explícito com role desconhecido).
- `docs/technical/OVERVIEW.md` NÃO foi tocado (evitar conflito) — ao integrar,
  acrescentar as duas envs à tabela de ambiente e o módulo à lista de docs.
