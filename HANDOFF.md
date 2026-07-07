# HANDOFF.md — Gabify v2

Execução autónoma de SPEC_GABIFY_V2 + ADDENDUM em `feature/gabify-v2`.
**Último estado estável: `npm run gate` verde — 497 testes (51 ficheiros), tsc 0 erros, eslint 0 erros, thresholds de cobertura enforced (queues ≥80, api ≥70, server ≥75).**

## Integração TOConline v1 — push de compras (2026-07-07, branch `feature/toconline-integration`)

> **⚠️ IMPLEMENTADO / NÃO TESTADO CONTRA API REAL** — módulo doc-driven por
> decisão do dono. Fonte de verdade: `integrations/toconline/` (spec OpenAPI +
> páginas markdown oficiais, verbatim). Ambiguidades, decisões e o **checklist
> de validação humana obrigatório** antes de produção: `INTEGRATION_NOTES.md`.
> Detalhe técnico: `docs/technical/toconline.md`.

- **Arquitetura**: interface `ExportTarget` criada (`src/server/export-targets/` — a spec §7 reservava-a): `FileExportTarget` delega no `runExport` existente sem mudar nada; `ToconlineExportTarget` novo. Config por CLIENTE (`ToconlineConnection`, clientId unique, 4 dados do integrador, secret+tokens AES-GCM); `ToconlineEntityMap` (cache NIF→id); `ToconlinePushPreview` (dry-run). Job BullMQ `toconline-push` (worker novo `npm run worker:toconline` — só entra no Railway quando fôr para envios reais).
- **Fluxo**: rota push por item → PENDING + job → fornecedor (EntityMap→GET NIF→POST auditado) → idempotência remota (filtro documentado + marcador `GABIFY:<id>` em external_reference) → AuditLog ANTES do POST → compra v1 (cabeçalho+linhas, auto-finalizada) → SENT. Linhas do `vatBreakdown` em cêntimos, euros SÓ na fronteira. ENVIADO nunca re-envia; falha a meio retoma sem duplicar fornecedor.
- **Dry-run [INV]**: ligação nasce dryRun=true → zero rede (teste com fetch proibido), previews exatos sem segredos na UI; desligar = `toconline:goLive` OWNER-only com aviso explícito "nunca foi testada contra o TOConline real".
- **Limites v1 conscientes**: linhas isentas 0% recusadas (motivo de isenção não derivável), só EUR, `retention_type` omitido — tudo com erro/preview claro e registado nas notas.
- Gate no fecho: verde — 478 testes (49 ficheiros), thresholds mantidos.

### Extensão: pull de faturas emitidas + Ligações (2026-07-07, branch `feature/toconline-pull`)

- **Pull (fonte)**: job BullMQ `toconline-pull` (scan repeatable, `TOCONLINE_PULL_INTERVAL_MS` default 30 min + "Sincronizar agora") importa documentos de venda finalizados como `Document` — `API_PULL`/`INVOICE_ISSUED`/`PRE_VALIDATED`/confiança 1.0, vatBreakdown em cêntimos a partir dos campos por taxa do cabeçalho documentado, PDF via `url_for_print` (best effort), **IA nunca invocada** [INV]. Dedup por `ToconlineEntityMap` (SALES_DOCUMENT) — re-pull é no-op [INV]; anti-eco: `external_reference` GABIFY: nunca cria Document [INV]; incremental via filtro documentado `documents.updated_at>'…'::date` com sobreposição de 24h (só otimização — decisões #13–16 nas notas).
- **Dry-run do pull [INV]**: GETs permitidos, escrita impossível (client `readOnly` bloqueia antes da rede); o que seria criado vai para `ToconlinePushPreview` (method PULL, documentId null).
- **Ligações (esqueleto)**: painel renomeado, lista com TOConline como 1.ª entrada, toggles fonte/destino independentes (PATCH capabilities); **destino único por cliente** — índice UNIQUE parcial `ON (clientId) WHERE pushEnabled` + 409 claro; N fontes permitidas; abstração genérica de fontes ADIADA para o Moloni.
- Schema: `EntityMap.nif`→`externalKey` (rename), `PushPreview.documentId` nullable, `Document.buyerName`, migrações `20260707000008/09`.
- Gate no fecho da extensão: verde — 497 testes (51 ficheiros), thresholds mantidos.

> **Worktrees — setup obrigatório antes de testar:** todo o worktree novo precisa de `npm ci` (ou `npm install`) **+ `npx prisma generate`**. Sem o generate local, o Node resolve o `.prisma/client` do node_modules de um diretório ancestral (schema de outro branch) → dezenas de falhas fantasma "column does not exist". O global setup dos testes acceptance aborta com instrução de correção se detetar este drift (`checkPrismaClientDrift` em `tests/setup/test-env.ts`).

## Unificação de fontes — Moloni + InvoiceXpress ligados à BD (2026-07-07, branch `feature/sources-unification`)

> **⚠️ IMPLEMENTADO / NÃO TESTADO CONTRA AS APIs REAIS.** Consolida os
> conectores Moloni e InvoiceXpress (antes puros, sem BD) e unifica o contrato
> de fontes. Detalhe técnico completo: `docs/technical/sources.md`. Os handoffs
> originais `HANDOFF_MOLONI.md` e `HANDOFF_IVX.md` ficam como histórico.

- **U1 — contrato único** (`src/server/sources/types.ts`): `types-local.ts` do
  IVX fundido no contrato; taxa de IVA unificada em **permil** (Moloni já o era;
  IVX converte percent→permil com equivalência numérica provada em
  `rate-equivalence.test.ts`); `withholdingCents`/retenção/`dueDate`/`atcud`/…
  absorvidos como campos opcionais; `InvoicexpressConnector` passa a implementar
  `DocumentSourceConnector` (uma página por chamada, PDF → Buffer). Regressão
  zero nos dois conectores.
- **U2 — persistência + jobs**: modelos `MoloniConnection` /
  `InvoicexpressConnection` (por cliente, credenciais AES-GCM, `pullEnabled`
  default false) + **`SourceEntityMap` genérico** (dedup SALES_DOCUMENT + cache
  CLIENT do NIF; unique `(system, entityType, externalId, clientId)`). Runner
  partilhado `runSourcePull`: pagina o contrato, dedup, cria `Document`
  API_PULL/INVOICE_ISSUED/PRE_VALIDATED/confiança 1.0 (**IA nunca invocada**) +
  `SourceEntityMap` + `AuditLog` numa transação. Jobs BullMQ `moloni-pull` /
  `invoicexpress-pull` (repeatable, `*_PULL_INTERVAL_MS` default 30 min, +
  Sincronizar agora). NIF do IVX resolvido **1 chamada por cliente final**
  (memo + cache). [INV] job→BD: cêntimos exatos, re-pull no-op, credenciais
  cifradas, cross-tenant 404, API_PULL fora do seletor de push TOConline.
- **U3 — Ligações (UI + RBAC)**: `SourceConnectionsPanel` na ficha do cliente
  (só-fonte, sem toggle de destino/dry-run); rotas
  `/api/clients/[id]/sources/[system]` + `/sync`; RBAC `source:read` /
  `source:manage` (CLIENT negado, loop faseP1 atualizado).
- **U4 — TOConline pull no contrato**: `ToconlineSourceConnector implements
  DocumentSourceConnector` (listing + PDF); o serviço de pull mantém a
  orquestração própria (**dry-run** e **anti-eco GABIFY:** não cabem no runner
  genérico) e consome o conector. Regressão zero. Mapeamento extraído para
  `toconline-sales-mapping.ts`.
- **Fora do railway.toml**: `worker:moloni` e `worker:invoicexpress` só entram
  após validação humana (checklist consolidado em `docs/technical/sources.md`).
- Gate no fecho: verde.

## Fase P — Portal do cliente final v1 (2026-07-07, branch `feature/client-portal-v1`)

Módulo novo: os clientes finais de cada gabinete têm login próprio num portal minimal (carregar documentos + ver estado público dos seus). Módulo de maior sensibilidade de segurança — em dúvida, isolamento ganha SEMPRE. Detalhe em `docs/technical/client-portal.md`; ACs e decisões em PROGRESS.md/RELEASE_NOTES_V2.md.

- **P1 Role e convites**: `UserRole.CLIENT` + `User.clientId`/`Invitation.clientId` com CHECK `role='CLIENT' ⇔ clientId`; matriz can() dá a CLIENT APENAS `portal:document:read/upload` (decisão: conceder document:* internos abriria rotas internas — ações dedicadas); `clientInvitation:manage` (OWNER+ACCOUNTANT) para convites/gestão de acessos; aceitação copia role+clientId SÓ do convite; PATCH users nunca muda role de/para CLIENT; rate limits CLIENT 30/min API + 10/min upload.
- **P2 API com masking**: `/api/portal/documents` (+upload, +download) com DTO próprio campo-a-campo e mapa de estados público deny-by-default (internos→"Em processamento", VALIDATED/EXPORTADO→"Processado", rejeitado(soft-delete)→"Devolvido"); shape test estrito anti-spread; upload reutiliza pipeline A4 via `intakeUploadedFiles` (partilhado com a rota interna) com clientId forçado da sessão + AuditLog com o user CLIENT; signed URLs TTL 5min.
- **P3 UI**: layout `/portal` próprio mobile-first pt-PT (Documentos/Carregar/Sair); dupla barreira de role nos DOIS layouts via `resolveAreaRedirect` (proxy edge continua só cookie — §1.2); "Acessos do portal" na ficha do cliente (convidar/estados/revogar; revogação apaga Sessions + audit).

## Fase C — Conciliação bancária v1 (2026-07-07, spec adicional)

Módulo novo (import de extratos, sem PSD2), C1→C2→C3 com RED-first e gate verde entre fases. Detalhe técnico em `docs/technical/bank-reconciliation.md`; decisões e ACs em PROGRESS.md/RELEASE_NOTES_V2.md.

- **C1 Import**: BankAccount/BankStatementImport/BankTransaction; wizard 2 passos com deteção heurística de colunas PT (zero IA) e fallback IA — confirmação humana SEMPRE obrigatória; parser dedicado `centsFromBankAmount` (A1, nunca float); dedupHash unique por office (duplicados = skip+relatório, nunca 500); fileHash repetido → 409 com `force` explícito; magic bytes + 10MB.
- **C2 Matching determinístico**: pesos 50 (montante, eliminatório, tolerância por office `Office.reconciliationToleranceCents`)/25 (data)/20 (NIF>nome)/+15 (nº doc); ≥75 autoMatch (pré-seleciona na UI, NUNCA concilia sozinho), 45–74 revisão, máx 5 por transação; candidatos só do cliente da conta, VALIDATED/EXPORTADO, não conciliados; corre automático e síncrono pós-import.
- **C3 Conciliar**: reconcile multi-documento (Σ±tolerância→422) com optimistic locking A7 e entry+audit+estados num $transaction atómico; unreconcile reverte tudo; BankRule (IGNORE/SUGGEST_CLIENT, prioridade asc, aplicada ANTES do scoring); UI mobile-first /bank + /bank/import + /settings/bank-rules (OWNER+ACCOUNTANT via `bankRule:manage`); contadores por conciliar/sugeridas no dashboard.
- **Nota de execução**: fase C construída na worktree `.claude/worktrees/bank-c1` (o diretório principal mudou de branch durante a sessão); BD de teste isolada `gabify_test_bankc1` via env `TEST_DATABASE_URL` (opcional — o default `gabify_test` continua válido sem suites concorrentes).

## O que foi entregue (Fases 0–3, todas com gate verde)

**Fase 0 — disqualificantes de segurança**
- Onboarding fechado por convites (`Invitation`, token SHA-256, 72h, revogação/resend, anti-lockout do último OWNER, anti-enumeração no magic link). Bootstrap via `npm run seed:bootstrap`.
- Loop de aprovação de drafts real e server-side: `EmailReview` + `AuditLog` ANTES de `sendReply`, máquina de estados A3 com transições condicionais na BD, retry máx. 3, `dashboard-store.tsx` (sessionStorage) apagado.
- Anexos Outlook persistidos (paridade com Gmail) + caps A4; `toEmails`/`ccEmails`/`bodyHtml` nos dois providers.
- Webhooks fail-closed (Graph 503 sem secret / 401 clientState; Gmail 401 sem JWT); fallback "qualquer conta OUTLOOK" removido.
- Unique `EmailAction(inboundEmailId, type)` mata a race dos drafts; JobLog nos dois workers; AuditLog nunca atualizado (o padrão `entityId:'pending'` morreu).

**Fase 1 — fundações**
- RBAC central `can()`/`guard()` com DENY-precedence em todas as rotas; 404 em recurso, 403 em ação global.
- Sessões database (revogáveis, role fresco por request); proxy edge otimista por cookie.
- Webhooks ligados nos callbacks OAuth + renovação diária (<48h) + polling 5min c/ webhook, 30s sem.
- Rate limiting por classe A11 (env-configurável); paginação cursor (default 50, clamp 200); mock-data apagado (DTOs em `src/server/dto`); AES-256-GCM com leitura CBC legada; `EmailThread.officeId` com backfill; `parsePtDate` a meio-dia UTC; `APP_TZ`.

**Fase 2 — ingestão e extração rica**
- Upload manual (web drag&drop + câmara mobile) com magic bytes, zip-bomb protection, erros por ficheiro; caixa dedicada por cliente (A5 completo, adaptador de teste); import CSV/XLSX com confirmação humana obrigatória; split multi-fatura (QR determinístico → IA com cap 50 págs e cache sha256).
- Pipeline unificado: email, upload, ingest e filhos de split percorrem a MESMA cascata (`runExtractionCascade`: QR AT → UBL/XML → Claude+zod). Dinheiro: Decimal em colunas, cêntimos em JSONB (A1). Duplicados (A8, índice único parcial), empresa errada, auto-associação por NIF adquirente.

**Fase 3 — revisão e saída vendável**
- Fila de revisão com optimistic locking (A7), historial completo `DocumentReview` (before/after), bulk, resolve-duplicate, split-approve, reopen (A9). UI `/review` mobile-first.
- `SupplierRule` (cliente > global; autoValidate nunca salta flags; aprendizagem ≥3 correções → sugestão, nunca cria sozinho) + registo `Supplier`.
- Export ZIP (`Cliente/Ano/Mês/{Recebidas|Emitidas|Outros}`) + `lancamentos.csv` pt-PT (BOM, `;`, vírgula, linha por taxa) + `resumo_iva.csv` + `.xlsx` numérico; `ExportBatch`/`ExportDocument` N:M; re-export `includeExported`.
- SNC v1 (A13): seed de taxonomia via service, sugestão HISTORY→IA validada, contas sensíveis exigem revisão humana na 1.ª ocorrência, `accountOverrides` por cliente no export.

## Slice UI final (pós-handoff, frontend-only) — ENTREGUE

Correção campo-a-campo (`/review/[documentId]`), wizard de import (`/documents/import`), gestão de convites (`/settings/invitations`, OWNER only) e dashboard de contadores com fila filtrável (`/review?status=...&clientId=...&flag=...`). 4 testes de componente (submissão com correções, VIEWER sem escrita, erro de API preserva input, aviso de coerência não-bloqueante). Nenhuma rota/serviço/schema alterado.

### Insuficiências de API — RESOLVIDAS no slice S5 (2026-07-07)

As três insuficiências documentadas pelo slice de UI foram fechadas com TDD RED-first (`tests/acceptance/fase5.api-gaps.test.ts`, 8 testes):

- **S5.1 — `POST /api/documents/[id]/review`** aceita agora `vatBreakdown` (`{region?, rate, baseCents, vatCents}`, taxas válidas por região PT/PT-AC/PT-MA), `withholdingCents`, `currency` (ISO 4217) e `dueDate` (≥ issueDate). Coerência Σbases+ΣIVA vs total (convenção bruta OU líquida de retenção, ±2 cêntimos) validada no SERVIDOR → 422 com detalhe por campo; o aviso do cliente continua só aviso. `DocumentReview.before/after` cobre os campos novos. **Regra nova**: documento VALIDATED é imutável exceto na janela pós-reopen (última `DocumentReview` = `reopen`); a janela fecha na decisão seguinte. Reopen A9 e [INV] AC-4.1.d intocados. UI: linhas de IVA editáveis (adicionar/remover, taxa por região), retenção, moeda e vencimento editáveis.
- **S5.2 — `GET /api/documents`** novo: filtros AND por `status` (multi, vírgulas), `clientId`, `flag`, `from`/`to` (issueDate), `q` (fornecedor/nº doc, case-insensitive), `rootOnly`; cursor default 50 max 200 + `total`; `guard('document:read')`, scope por officeId (cross-tenant nunca aparece). A fila `/review` e os contadores do dashboard consomem este endpoint (Prisma removido do server component da fila). A tabela por cliente do dashboard mantém `groupBy` server-side — o endpoint de listagem não agrega (limite conhecido, aceitável).
- **S5.3 — `POST /api/documents/import`** devolve `headers: [{original, normalized}]` na ordem do ficheiro; o wizard usa-os no passo de mapeamento (chaves da amostra ficam como fallback).

## O que NÃO foi feito (dívidas conscientes)

1. **Fase 4 parcial** (regra 13 da spec): chasing v1 (S4.2) e settings de office/regras (S4.4 — APIs existem: `/api/supplier-rules`, `/api/clients/[id]/ingest-alias`). Convites (S4.3) e dashboard de contadores (S4.1) ficaram cobertos pelo slice de UI final; falta o "fechar período" do AC-6.4.
2. **Resend Inbound real**: entregue com interface + adaptador de teste (A5 permite); ativação documentada em RELEASE_NOTES_V2.md.
3. **Sugestão SNC por IA não corre automaticamente no parse** (decisão de custo): HISTORY/regra aplicam-se no parse; a sugestão IA é on-demand via `suggestSncForDocument` (falta expor endpoint/botão na UI de revisão).
4. Re-encriptação GCM é lazy (no próximo refresh de token) — tokens antigos continuam CBC até lá, por desenho (A12).
5. ~~Correções de `vatBreakdown`/retenção/moeda na review — bloqueadas pela API~~ — resolvido no slice S5 (ver acima).

## Arranque num ambiente novo

```bash
docker compose up -d                 # Postgres + Redis
cp .env.example .env.local           # preencher segredos
npx prisma migrate deploy
npm run seed:bootstrap               # BOOTSTRAP_OWNER_EMAIL obrigatório
npm run dev                          # + npm run worker:email + npm run worker:documents
npm run gate                         # verificação completa
```

Envs novas desde a v1: `AUTH_SECRET`, `GMAIL_WEBHOOK_URL`, `EMAIL_POLL_INTERVAL_MS`, `BOOTSTRAP_OWNER_EMAIL/OFFICE_NAME/OWNER_NAME`, `RATE_LIMIT_*` (6), `INGEST_DOMAIN`, `INGEST_TEST_SECRET` (dev), `TEST_DATABASE_URL` (opcional). `MICROSOFT_CLIENT_ID/SECRET` corrigidos no `.env.example` (eram `AZURE_AD_*`). `GRAPH_WEBHOOK_SECRET` agora é obrigatório (fail-closed).

Seeds: `npm run seed:bootstrap` (office+owner); taxonomia SNC: `seedSncTaxonomy()` em `src/server/services/snc-service.ts` (chamar num script de deploy ou no primeiro export — ainda sem npm script próprio).

## Testes

- `npm run test` — auto-suficiente num clone limpo (cria `gabify_test`, aplica migrações, gera fixtures A10).
- Projetos vitest: `unit` (mocks) e `acceptance` (BD real, sequencial). IA/providers/R2/Resend sempre mockados.
- `npm run gate` = tsc + eslint + testes + cobertura com thresholds.

## Decisões com latitude — ver secção "Decisões" do PROGRESS.md.
