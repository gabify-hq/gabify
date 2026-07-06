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
| Acceptance Fase 0 escrita (AC-0.1 a AC-0.5, 30 testes) | DONE | ✅ 5/5 ficheiros falham (módulos inexistentes: office-service, invitation-service, rotas approve/reject, processor). AC-0.4.c e AC-0.4.a re-confirmados RED contra implementação atual antes do slice S0.4 | — |
| S0.1 Onboarding por convites | — | — | — |
| S0.2/AC-0.3 Anexos Outlook | — | — | — |
| S0.3/AC-0.2 Loop de aprovação | — | — | — |
| S0.4 Webhooks fail-closed | — | — | — |
| S0.5 Fundação (constraint draft, JobLog, AuditLog imutável, gate) | — | — | — |

## Decisões (latitude da spec)

- Testes de aceitação correm contra PostgreSQL real (`gabify_test`) — constraints e concorrência (A3/A7/AC-0.5.b) não são verificáveis com Prisma mockado.
- Factories usam serviços onde existem (`office-service`); entidades sem serviço de criação (EmailAccount, InboundEmail, EmailAction) são criadas via Prisma com a mesma forma que o código de produção escreve.
- Estado transitório interno `APPROVED` usado durante o envio (transição condicional na BD PENDING_REVIEW→APPROVED vence a corrida; estados finais A3: APPROVED_SENT / APPROVED_SEND_FAILED).
