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

## Fase 1

| Slice | Estado | RED | Gate |
|---|---|---|---|
| Acceptance Fase 1 escrita (AC-1.1 a AC-1.4 + S1.7, 27 testes) | DONE | ✅ 4/5 ficheiros RED (workers já verdes — processor nasceu na Fase 0) | — |
| S1.1 RBAC `can()` DENY-precedence + `guard()` em todas as rotas | DONE | ✅ | ✅ |
| S1.2 Sessões database (strategy database, role fresco por request, proxy otimista por cookie) | DONE | ✅ | ✅ |
| S1.3 Webhooks ligados (watchChanges nos callbacks OAuth, renovação diária <48h, polling 5min c/ webhook, env-check fail-closed, fallback Graph morto) | DONE | ✅ | ✅ |
| S1.4 Rate limiting por classe A11 (api/user, magic-link email+IP, webhook por subscrição, upload user+office, ingest) | DONE | ✅ | ✅ |
| S1.5 Paginação (clients + invitations: default 50, clamp 200, cursor) | DONE | ✅ | ✅ |
| S1.6 Purga mock-data (DTOs em src/server/dto, format.ts, document-types.ts; mock-data.ts APAGADO; MOCK_CLIENTS → clientes reais) | DONE | ✅ | ✅ |
| S1.7 Higiene (GCM c/ prefixo v2 + CBC legado, EmailThread.officeId c/ backfill, Document.clientId scoping, parsePtDate UTC-noon, qr-reader smoke, OAuth CSRF tests, APP_TZ, thresholds ON) | DONE | ✅ | ✅ |

**Fim da Fase 1: `npm run gate` verde — 231 testes, coverage thresholds enforced (queues 80/api 70/server 75).**

## Fase 2

| Slice | Estado | RED | Gate |
|---|---|---|---|
| Acceptance Fase 2 escrita (AC-2.1/2.2/2.3/2.4/2.5 + AC-3.1/3.2/3.3/3.4, 27 testes) + fixtures A10 geradas | DONE | ✅ 5/5 ficheiros RED (módulos inexistentes) | — |
| S2.1 Upload manual (magic bytes A4, zip-bomb A4, 25MB/10 ficheiros, erros por ficheiro, UI drag&drop + câmara mobile) | DONE | ✅ | ✅ 6/6 |
| S2.2 Split multi-fatura (QR determinístico por página zero-IA, cap 50 págs A6, cache sha256 A6, pdf-lib, filhos com parse próprio) | DONE | ✅ | ✅ 6/6 |
| S2.3 Extração rica (QR I1–K8→vatBreakdown cents A1, Decimal em colunas, prompts+zod estrito, coerência ±2c, retenção, XML UBL determinístico) | DONE | ✅ | ✅ 12/12 |
| S2.4 Import CSV/XLSX (mapeamento IA proposto → confirmação humana obrigatória AC-2.5.c, validação NIF checksum + aritmética, relatório por linha) | DONE | ✅ | ✅ 3/3 |
| S2.5 Duplicados (normalização A8, índice único parcial SQL, colisão→DUPLICATE_SUSPECT nunca 500) + empresa errada + auto-associação por NIF adquirente | DONE | ✅ | ✅ |
| S2.6/A5 Caixa dedicada (alias token 12 chars sem ambíguos, DMARC→quarentena SENDER_UNVERIFIED, allowlist, rate limit por endereço, adaptador de teste + rota simulate dev-only) | DONE | ✅ | ✅ 7/7 |

**Fim da Fase 2: `npm run gate` verde — 265 testes (101 acceptance).**

## Fase 3

| Slice | Estado | RED | Gate |
|---|---|---|---|
| Acceptance Fase 3 escrita (AC-4.1/4.2, AC-3.5, AC-5.1, AC-6.1/6.2/6.3/6.5 — 23 testes) | DONE | ✅ 3/3 ficheiros RED | — |
| S3.1 Fila de revisão (optimistic locking `version`/`expectedVersion` A7, DocumentReview 1:N com before/after, bulk com relatório por item, resolve-duplicate, split-approve, reject=soft-delete, reopen A9) + UI mobile-first `/review` | DONE | ✅ | ✅ |
| S3.2 SupplierRule (cliente > global, autoValidate só sem flags, aprendizagem ≥3 correções → sugestão, NUNCA criada sem clique) + Supplier registry (AC-3.5) | DONE | ✅ | ✅ |
| S3.3 Export ZIP+CSV+XLSX (estrutura Cliente/Ano/Mês/Tipo, CSV pt-PT BOM `;` vírgula A9, linha por taxa, resumo_iva em cêntimos A1, ExportDocument N:M, re-export includeExported, AuditLog antes do URL, signed URL 15min) | DONE | ✅ | ✅ |
| S3.4 SNC v1 (seed 28 contas via service, HISTORY→IA validada por zod, code inventado descartado + NEEDS_REVIEW, gate A13 contas sensíveis 1.ª ocorrência, accountOverrides no export) | DONE | ✅ | ✅ |
| E2E AC-6.5.a (caixa dedicada → QR zero-IA → regra auto-valida → export com valores exatos) | DONE | ✅ | ✅ |

**Fim da Fase 3: `npm run gate` verde — 288 testes (124 acceptance).**

## Slice UI final (pós-handoff, frontend-only)

| Bloco | Estado | Gate |
|---|---|---|
| 1. Correção campo-a-campo em `/review/[documentId]` (preview lado a lado via signed URL, colapsável em mobile; coerência Σbases+ΣIVA−retenção=total no cliente como aviso; optimistic locking com recuperação de 409 sem perder input; 4 testes de componente jsdom+testing-library) | DONE | ✅ |
| 2. UI do import `/documents/import` (wizard 3 passos: ficheiro → mapeamento confirmável com amostra → relatório linha-a-linha descarregável em CSV) | DONE | ✅ |
| 3. Gestão de convites `/settings/invitations` (estados pendente/aceite/expirado/revogado, criar/revogar/reenviar; página bloqueada a não-OWNER via `can()`; link só visível a OWNER) | DONE | ✅ |
| 4. Dashboard de contadores (a rever / pré-validados / duplicados / por exportar, agregado + por cliente, links para `/review` filtrada por status/cliente/flag) + filtros por query param na fila | DONE | ✅ |

**Gate no fecho do slice: verde — 292 testes (inclui 4 de componente).**

## Fase 4 — NÃO EXECUTADA

Por regra 13 da spec (fases por ordem de valor; melhor 0–3 impecáveis do que 0–5 a meio) e capacidade de contexto, a Fase 4 (dashboard operacional, chasing v1, página de convites, settings de office) ficou por executar. As APIs subjacentes existem (convites, supplier rules, exports); falta a camada de UI de gestão. Ver HANDOFF.md.

## Decisões (latitude da spec)

- Testes de aceitação correm contra PostgreSQL real (`gabify_test`) — constraints e concorrência (A3/A7/AC-0.5.b) não são verificáveis com Prisma mockado.
- Factories usam serviços onde existem (`office-service`); entidades sem serviço de criação (EmailAccount, InboundEmail, EmailAction) são criadas via Prisma com a mesma forma que o código de produção escreve.
- Estado transitório interno `APPROVED` usado durante o envio (transição condicional na BD PENDING_REVIEW→APPROVED vence a corrida; estados finais A3: APPROVED_SENT / APPROVED_SEND_FAILED).
- Geração de draft (A12/G5): EmailAction criado primeiro (claim do slot via unique constraint), AuditLog com id real ANTES da chamada à IA, draft preenchido depois; em falha da IA o EmailAction é libertado (o AuditLog fica como registo imutável da tentativa).
- Fallback do webhook Graph ("qualquer conta OUTLOOK ativa") removido já na Fase 0 (a spec só o exigia em S1.3) — evita retrabalho.
- `DOCUMENT_TYPE_LABELS` movido para `src/lib/document-types.ts` já na Fase 0 (o processor novo não podia importar mock-data); purga completa do mock-data continua em S1.6.
- Migração aplicada com `migrate diff` + `migrate deploy` (o `migrate dev` do Prisma 7 recusa terminais não interativos); SQL inclui dedupe de EmailAction antes da unique constraint.
- Proxy (edge) com sessões database: verificação otimista por presença de cookie; validação real (revogação/role) acontece por request no runtime Node via `auth()` — padrão recomendado NextAuth para strategy database.
- AC-1.2 testado ao nível adapter+callback (`getSessionAndUser` + `enrichSession`) — o plumbing de cookies do NextAuth não é unit-testável sem HTTP server real.
- `src/queues/*.worker.ts` excluídos da cobertura: são shells de wiring BullMQ (ligam ao Redis no import); toda a lógica vive nos `*.processor.ts`, 100% cobertos.
- Anti-lockout/gestão de users em rota própria `/api/users/[userId]` com ação RBAC `user:manage` (OWNER only) — a spec não a listava; necessária para A2.
- Pipeline unificado (Fase 2): `runExtractionCascade` substitui as funções classify* no worker — email, upload, ingest e filhos de split percorrem exatamente o mesmo caminho (`{documentId}` vs `{attachmentId}` só muda a obtenção do buffer). As funções classify* antigas mantêm-se exportadas (testes unitários), mas fora do fluxo.
- `Document.officeId` direto (backfill na migração) — obrigatório para fontes sem cadeia de email; simplifica scoping.
- Convenção A1 adotada: cêntimos inteiros em JSONB (`vatBreakdown`, `documentLines`), `Decimal(14,2)` em colunas (documentado em OVERVIEW).
- Extração XML: leitura determinística leve de campos UBL (totais, NIFs, nº, data) — o parser/validador CIUS-PT completo continua fora de âmbito (§7).
- Fixtures A10 comitadas em `tests/fixtures/generated/` (determinísticas; regeneradas pelo globalSetup se faltarem). QRs embebidos como JPEG (DCTDecode) porque o qr-reader de produção só extrai streams JPEG de PDFs.
- Rota `/api/ingest/simulate` isenta do arch-test de RBAC (autentica por secret, como os webhooks); desativada em produção.
- Mocks de fase0.foundation atualizados para a nova arquitetura (anthropic mockado ao nível do cliente) — invariantes AC-0.5 inalterados.

## Slice S5 — fechar insuficiências de API do HANDOFF (pós-UI)

### RED (2026-07-07)

`tests/acceptance/fase5.api-gaps.test.ts` — 8 testes, **8 falhas confirmadas** antes de qualquer implementação:
- S5.1.a–d: rota review ignora/rejeita `vatBreakdown`/`withholdingCents`/`currency`/`dueDate`; sem validação de taxas PT nem coerência no servidor; VALIDATED ainda era corrigível sem reopen.
- S5.2.a–c: `GET /api/documents` não existe (módulo sem export GET).
- S5.3.a: resposta do import não traz `headers`.

### Decisões S5

- Nomes dos campos de vatBreakdown na API: `{region?, rate, baseCents, vatCents}` (convenção A1 do repo — sufixo Cents), não `{rate, base, amount}` literal da spec.
- Taxas válidas por região: PT {0,6,13,23}, PT-AC {0,4,9,16}, PT-MA {0,5,12,22} (o repo já suporta regiões via QR I/J/K).
- Coerência no servidor reutiliza a convenção A1 existente: aceita total bruto OU líquido de retenção (min dos dois deltas ≤ 2 cêntimos) — o QR AT (campo O) é bruto.
- VALIDATED imutável exceto janela pós-reopen: review sobre VALIDATED só é aceite se a última DocumentReview do documento for `reopen` (reopen A9 devolve EXPORTED→VALIDATED, [INV] AC-4.1.d intocado); a janela fecha na correção seguinte.
