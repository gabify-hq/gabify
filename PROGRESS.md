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

### GREEN (2026-07-07)

| Slice | Estado | Gate |
|---|---|---|
| S5.1 — review completo (vatBreakdown/retenção/moeda/dueDate, zod estrito, coerência 422 no servidor, before/after, VALIDATED imutável sem reopen) + UI de linhas de IVA editáveis + 2 testes de componente novos | DONE | ✅ |
| S5.2 — `GET /api/documents` (filtros AND, cursor 50/200, `total`, `rootOnly`) + fila `/review` e contadores do dashboard a consumir o endpoint | DONE | ✅ |
| S5.3 — `headers` `[{original, normalized}]` na resposta do import + wizard a usá-los | DONE | ✅ |

**Gate no fecho do slice S5: verde — 302 testes (32 ficheiros), zero regressões, thresholds mantidos.**
Nota: a tabela por cliente do dashboard continua server-side (`groupBy`) — o endpoint de listagem não agrega; documentado em HANDOFF.md.

## Fase C — Conciliação bancária v1 (import de extratos, sem PSD2)

### RED C1 (2026-07-07)

`tests/acceptance/faseC1.bank-import.test.ts` (9 testes) + `src/lib/bank-amount.test.ts` (11 testes) — **RED import-level confirmado** antes de qualquer implementação (2/2 ficheiros falham: módulos `@/app/api/bank/*` e `src/lib/bank-amount` inexistentes).

| Slice | Estado | RED | Gate |
|---|---|---|---|
| C1 Modelos (BankAccount, BankStatementImport, BankTransaction) + migração `20260707000001_c1_bank_reconciliation_import` | DONE | ✅ | ✅ |
| C1 Parser dedicado de montantes PT (`centsFromBankAmount`: "1.234,56"→123456, regras de separador determinísticas, nunca parseFloat) | DONE | ✅ 11/11 | ✅ |
| C1 Import wizard 2 passos: POST /api/bank/imports (multipart, magic bytes A4, 10MB, fileHash 409+force) → deteção heurística de colunas PT (zero IA) com fallback IA → POST /api/bank/imports/[id]/confirm (confirmação humana obrigatória) | DONE | ✅ | ✅ |
| C1 dedupHash (officeId unique): linha repetida no ficheiro/re-import → skip + aviso no relatório, nunca 500; débito/crédito separados OU coluna única com sinal → mesmo amountCents | DONE | ✅ | ✅ |
| C1 GET /api/bank/accounts + GET /api/bank/transactions (filtros AND, cursor 50/200, cross-tenant 404) + ações RBAC novas (bank:read incl. VIEWER; bank:manage/import/reconcile/bankRule:manage OWNER+ACCOUNTANT) | DONE | ✅ | ✅ |

**Fim do C1: `npm run gate` verde — 322 testes (34 ficheiros), thresholds mantidos.**

### RED C2 (2026-07-07)

`tests/acceptance/faseC2.bank-matching.test.ts` (10 testes) — **RED import-level confirmado** (`@/server/services/bank-matching` inexistente) antes de implementar.

| Slice | Estado | RED | Gate |
|---|---|---|---|
| C2 Modelos (ReconciliationSuggestion unique (tx,doc), Office.reconciliationToleranceCents default 2, Document.reconciledEntryId) + migração `20260707000002_c2_reconciliation_suggestions` | DONE | ✅ | ✅ |
| C2 Scorer puro (`scoreCandidate`): montante 50/45 eliminatório, data 25/15/5 (dueDate→issueDate), NIF 20 com fronteira de dígitos / nome normalizado ≥4 chars word-boundary 12, referência +15 space-insensitive — fixture 95 EXATO [INV] | DONE | ✅ | ✅ |
| C2 `generateSuggestionsForTransaction`: candidatos só do MESMO cliente da conta, VALIDATED/EXPORTED, não conciliados, pré-filtro SQL por janela de tolerância; ≥75 autoMatch + tx→SUGGESTED (transição condicional), 45–74 revisão, máx 5 ordenadas, idempotente (skipDuplicates) | DONE | ✅ | ✅ |
| C2 `validateReconciliationTotals` (multi-doc: Σtotais = |amountCents| ± tolerância — 422 no ato de conciliar em C3) + wiring: confirm do import corre matching automaticamente (zero IA) | DONE | ✅ | ✅ |

**Fim do C2: `npm run gate` verde — 341 testes (36 ficheiros), thresholds mantidos.**

### RED C3 (2026-07-07)

`tests/acceptance/faseC3.reconcile.test.ts` (8 testes) — **RED import-level confirmado** (rotas reconcile/unreconcile/rules inexistentes) antes de implementar.

| Slice | Estado | RED | Gate |
|---|---|---|---|
| C3 Modelos (ReconciliationEntry 1:1 tx c/ documentIds snapshot, BankRule, BankTransaction.version A7, FK Document.reconciledEntryId) + migração `20260707000003_c3_reconciliation_entries_bank_rules` | DONE | ✅ | ✅ |
| C3 POST reconcile (documentIds[] OU ignore+motivo, expectedVersion): claim condicional + entry + links + sugestões ACCEPTED/REJECTED + AuditLog num único $transaction atómico; multi-doc Σ±tolerância → 422; 2ª conciliação/versão errada → 409 | DONE | ✅ | ✅ |
| C3 POST unreconcile: reverte tx→UNRECONCILED, documentos desligados, sugestões→PENDING, entry apagada, AuditLog do undo | DONE | ✅ | ✅ |
| C3 BankRule engine (prioridade asc, first-match; CONTAINS/EQUALS accent-insensitive, SIMPLE_REGEX seguro) aplicado ANTES do scoring: IGNORE→entry+audit+IGNORED sem sugestões; SUGGEST_CLIENT redireciona candidatos + CRUD /api/bank/rules (bankRule:manage) | DONE | ✅ | ✅ |
| C3 UI mobile-first pt-PT: /bank (contas por cliente + fila com score/breakdown visível, aceitar 1 toque em autoMatch, multi-doc por checkbox, ignorar com motivo, reverter), /bank/import (wizard 3 passos + força reimport), /settings/bank-rules, item "Banco" na sidebar, contadores por conciliar/sugeridas no dashboard | DONE | — (UI) | ✅ |

**Fim do C3: `npm run gate` verde — 349 testes (37 ficheiros), thresholds mantidos. Fase C completa.**

### Decisões C (latitude da spec)

- 45–74 gera sugestão com autoMatch=false mas NÃO muda o estado da transação (a spec só manda SUGERIDA para ≥75); a fila da UI mostra ambas.
- Débito casa com INVOICE_RECEIVED/INVOICE_RECEIPT/RECEIPT; crédito com INVOICE_ISSUED (o repo tem os dois lados — testados os dois).
- `Document.reconciledEntryId` entra em C2 como coluna simples (candidatura exclui conciliados desde já); a FK para ReconciliationEntry chega com o modelo em C3.
- Matching corre sincronamente no fim do confirm do import (determinístico, zero IA, sem custo) — sem job novo.
- Conciliação manual multi-documento aceita documentos de qualquer cliente do office (o contabilista decide); a restrição ao cliente da conta aplica-se só aos CANDIDATOS do scoring. Regras SUGGEST_CLIENT legitimam o cross-client.
- AuditLog da conciliação vive dentro do $transaction atómico (existe sse a ação aconteceu) — sem ação externa não há ordering "antes" observável; padrão igual ao interno da review.
- Undo apaga a ReconciliationEntry (o rasto imutável fica nos DOIS AuditLogs: reconcile e unreconcile com o payload da entry).
- DELETE de BankRule é hard delete (registo de configuração, não de negócio); entries antigas mantêm ruleId a null via SetNull.
- amountMin/amountMax das regras comparam contra amountCents COM sinal (débitos são negativos) — documentado na UI pelo placeholder.

- Enums em inglês por regra da casa (precedente DocumentStatus): POR_CONCILIAR→UNRECONCILED, SUGERIDA→SUGGESTED, CONCILIADA→RECONCILED, IGNORADA→IGNORED; PENDENTE/ACEITE/REJEITADA→PENDING/ACCEPTED/REJECTED.
- Confirmação humana do mapeamento é obrigatória nos DOIS caminhos (heurística e IA) — a heurística só evita a chamada à IA; consistente com o wizard de import de documentos (AC-2.5.c).
- 409 de fileHash aplica-se a imports PENDING e PROCESSED da mesma conta; `force=true` cria na mesma e o dedupHash das linhas garante zero transações duplicadas.
- `rowCount` = linhas de dados do ficheiro; relatório detalha imported/skippedDuplicates/errors por linha.
- Ações bancárias RBAC fora do guarda-chuva `settings:manage` (OWNER-only): a spec C3 exige regras bancárias para OWNER **e** ACCOUNTANT.
- Execução em worktree `.claude/worktrees/bank-c1` (o diretório principal mudou de branch a meio — outra sessão ativa); BD de teste isolada `gabify_test_bankc1` via `TEST_DATABASE_URL` para evitar contenção com outras suites concorrentes.

## Fase P — Portal do cliente final v1 (branch `feature/client-portal-v1`, 2026-07-07)

Módulo de maior sensibilidade de segurança: utilizadores externos dentro do sistema. Regra da spec aplicada em todas as decisões: **em dúvida entre conveniência e isolamento, ganha o isolamento.**

### RED P1 (2026-07-07)

`tests/acceptance/faseP1.client-role.test.ts` (35 testes) — **8 falhas confirmadas** antes de implementar (convite CLIENT 422/404, aceitação role+clientId, constraints BD, PATCH de role de CLIENT, limite 30/min). Os 27 testes do loop de negação sobre 25 rotas internas nasceram verdes por DENY-precedence (role desconhecido = negado) — precedente fase1 (workers).

| Slice | Estado | RED | Gate |
|---|---|---|---|
| P1 Schema (UserRole.CLIENT, User.clientId, Invitation.clientId, CHECKs `role='CLIENT' ⇔ clientId`) — migrações `20260707000004` (ALTER TYPE isolado) + `20260707000005` | DONE | ✅ | ✅ |
| P1 Matriz can(): CLIENT só `portal:document:read/upload`; `clientInvitation:manage` nova (OWNER+ACCOUNTANT); portal:* exclusivo de CLIENT | DONE | ✅ | ✅ |
| P1 Convites CLIENT (clientId obrigatório do próprio office 422/404; aceitação copia role+clientId SÓ do convite; revoke/resend de convites CLIENT via clientInvitation:manage) | DONE | ✅ | ✅ |
| P1 Anti-escalada em users: PATCH nunca muda role de/para CLIENT (409/422) | DONE | ✅ | ✅ |
| P1 Rate limiting CLIENT: API 30/min no guard(), upload 10/min (fn pronta, aplicada em P2) | DONE | ✅ | ✅ |

**Fim do P1: `npm run gate` verde — 384 testes (38 ficheiros), thresholds mantidos.**

### RED P2 (2026-07-07)

`tests/acceptance/faseP2.portal-api.test.ts` (9 testes) — **RED import-level confirmado** (rotas `/api/portal/*` inexistentes) antes de implementar.

| Slice | Estado | RED | Gate |
|---|---|---|---|
| P2 DocumentSource.PORTAL_UPLOAD + migração `20260707000006` | DONE | ✅ | ✅ |
| P2 portal-service: DTO próprio campo-a-campo {id, filename, submittedAt, origin, status} + shape test estrito anti-spread [INV]; mapa público deny-by-default (internos→PROCESSING, VALIDATED/EXPORTED→PROCESSED, rejeitado→RETURNED); SPLIT parents excluídos | DONE | ✅ | ✅ |
| P2 GET /api/portal/documents (cursor 50/200, pesquisa por nome, clientId SÓ da sessão) | DONE | ✅ | ✅ |
| P2 POST /api/portal/documents/upload (pipeline A4 partilhado `intakeUploadedFiles`, clientId do body IGNORADO, AuditLog PORTAL_DOCUMENT_UPLOADED com o user CLIENT, rate limit 10/min) | DONE | ✅ | ✅ |
| P2 GET /api/portal/documents/[id]/download (signed URL TTL 300s; outro cliente → 404) | DONE | ✅ | ✅ |

**Fim do P2: `npm run gate` verde — 393 testes (39 ficheiros), thresholds mantidos.**

### RED P3 (2026-07-07)

3 ficheiros — **RED confirmado** antes de implementar (módulos inexistentes): `tests/acceptance/faseP3.portal-access.test.ts` (5), `src/lib/area-redirect.test.ts`, `src/components/portal/portal-document-table.test.tsx`.

| Slice | Estado | RED | Gate |
|---|---|---|---|
| P3 Dupla barreira por role: `resolveAreaRedirect` consumido pelos DOIS layouts (dashboard redireciona CLIENT→/portal; portal redireciona internos→/inbox); raiz `/` aterra por role | DONE | ✅ | ✅ |
| P3 UI /portal (layout próprio, nav mínima Documentos/Carregar/Sair, mobile-first bottom-bar, pt-PT): lista com estados públicos + pesquisa + paginação; /portal/upload reutiliza UploadDocuments (props endpoint/showClientSelector) com drag&drop + câmara | DONE | ✅ | ✅ |
| P3 "Acessos do portal" na ficha do cliente (OWNER+ACCOUNTANT): convidar, estados, revogar convite, revogar acesso — GET/DELETE /api/clients/[id]/portal-access[/userId] (revogação apaga Sessions + audit PORTAL_ACCESS_REVOKED) | DONE | ✅ | ✅ |

**Fim do P3 / fase P completa: `npm run gate` verde — 407 testes (42 ficheiros), thresholds mantidos.**

### Decisões P (latitude da spec)

- **Ações portal dedicadas** em vez de conceder `document:read/upload` internos a CLIENT: a concessão literal abriria `/api/documents`, `/api/documents/import` e `/api/attachments` (DTOs internos) — contradiz o próprio P2. `portal:document:read/upload` entregam a mesma semântica ("APENAS do seu clientId") com DENY-precedence limpa; internos não têm ações portal (isolamento simétrico).
- Estados públicos com códigos em inglês na API (`PROCESSING/PROCESSED/RETURNED`) e labels pt-PT na UI — regra da casa (precedente enums fase C); o mapa é deny-by-default: qualquer estado interno futuro cai em "Em processamento".
- "REJEITADO → Devolvido" implementado sobre o soft-delete da review (reject=soft-delete, S3.1): a lista do portal INCLUI documentos apagados pela review, mascarados como RETURNED — o cliente sabe que deve reenviar.
- SPLIT parents fora da lista do portal (artefacto interno; as faturas-filhas aparecem individualmente).
- Barreira "middleware + layout" da spec: com sessões database o proxy edge só vê o cookie (§1.2) — a dupla barreira real são os DOIS layouts (dashboard e portal), ambos sobre `resolveAreaRedirect` (fonte única). Proxy continua a exigir cookie para /portal.
- Convite CLIENT via POST /api/invitations com ação derivada do role ANTES da validação (401/403 precedem detalhe de validação — anti-enumeração); página de convites da equipa exclui convites de portal (vivem na ficha do cliente).
- Revogação de acesso = soft-delete do User CLIENT + deleteMany das Sessions num $transaction (revogação imediata com strategy database) + AuditLog; users internos e CLIENTs de outro cliente são 404 nessa rota.
- Loop de negação P1 sobre o route map interno nasceu verde (DENY-por-omissão da matriz) — mantido como teste de regressão [INV]; os 8 RED reais eram a funcionalidade nova.
