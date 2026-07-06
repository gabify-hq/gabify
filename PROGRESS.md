# PROGRESS.md — Gabify v2

Registo de execução por slice (SPEC_GABIFY_V2 + ADDENDUM + ACCEPTANCE).
Formato: slice · estado · RED confirmado · gate.

## Infra de execução

| Item | Estado | Notas |
|---|---|---|
| BD de teste (`gabify_test`, Postgres docker) + `prisma migrate deploy` em globalSetup | DONE | `tests/setup/` — suite auto-suficiente (A10) |
| Projeto vitest `acceptance` (BD real, sequencial) + projeto `unit` (mocks, existente) | DONE | `vitest.config.ts` |
| `@vitest/coverage-v8` instalado; thresholds condicionais (`COVERAGE_ENFORCE=1` a partir do fim da Fase 1) | DONE | regra 4 da spec |
| Higiene para gate: `console.log(j.id` apagado, `.claude/worktrees/` removidas, scripts de debug → `scripts/_attic/` (fora de tsc/lint) | DONE | achado #20 |

## Fase 0

| Slice | Estado | RED | Gate |
|---|---|---|---|
| Acceptance Fase 0 escrita (AC-0.1 a AC-0.5, 39 testes) | DONE | ✅ 5/5 ficheiros falham (módulos inexistentes: office-service, invitation-service, rotas approve/reject, processor) | — |
| S0.1 Onboarding por convites (Invitation, adapter, anti-lockout, seed) | DONE | ✅ import-level RED confirmado | ✅ 13/13 |
| S0.3/AC-0.2 Loop de aprovação (EmailReview, AuditLog→sendReply, A3, retry, UI sem sessionStorage) | DONE | ✅ | ✅ 10/10 |
| S0.2/AC-0.3 Anexos Outlook (fileAttachment, inline skip, cap 25MB A4, to/cc/bodyHtml ambos providers) | DONE | ✅ | ✅ 6/6 |
| S0.4/AC-0.4 Webhooks fail-closed (Graph 503 sem secret, 401 clientState; Gmail 401 sem/JWT inválido; fallback "qualquer conta OUTLOOK" removido) | DONE | ✅ 5/5 RED confirmado contra implementação antiga antes de implementar | ✅ 5/5 |
| S0.5/AC-0.5 Fundação (coverage-v8, unique EmailAction(inboundEmailId,type), JobLog nos dois workers, AuditLog sem update/'pending', processors extraídos, npm run gate) | DONE | ✅ | ✅ |

**Fim da Fase 0: `npm run gate` verde — tsc 0 erros, eslint 0 erros, 218 testes (179 unit + 39 acceptance), coverage report emitido (AC-0.5.a).**

## Decisões (latitude da spec)

- Testes de aceitação correm contra PostgreSQL real (`gabify_test`) — constraints e concorrência (A3/A7/AC-0.5.b) não são verificáveis com Prisma mockado.
- Factories usam serviços onde existem (`office-service`); entidades sem serviço de criação (EmailAccount, InboundEmail, EmailAction) são criadas via Prisma com a mesma forma que o código de produção escreve.
- Estado transitório interno `APPROVED` usado durante o envio (transição condicional na BD PENDING_REVIEW→APPROVED vence a corrida; estados finais A3: APPROVED_SENT / APPROVED_SEND_FAILED).
- Geração de draft (A12/G5): EmailAction criado primeiro (claim do slot via unique constraint), AuditLog com id real ANTES da chamada à IA, draft preenchido depois; em falha da IA o EmailAction é libertado (o AuditLog fica como registo imutável da tentativa).
- Fallback do webhook Graph ("qualquer conta OUTLOOK ativa") removido já na Fase 0 (a spec só o exigia em S1.3) — evita retrabalho.
- `DOCUMENT_TYPE_LABELS` movido para `src/lib/document-types.ts` já na Fase 0 (o processor novo não podia importar mock-data); purga completa do mock-data continua em S1.6.
- Migração aplicada com `migrate diff` + `migrate deploy` (o `migrate dev` do Prisma 7 recusa terminais não interativos); SQL inclui dedupe de EmailAction antes da unique constraint.
