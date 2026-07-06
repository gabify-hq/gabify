# HANDOFF.md — Gabify v2

Execução autónoma de SPEC_GABIFY_V2 + ADDENDUM em `feature/gabify-v2`.
**Último estado estável: `npm run gate` verde — 288 testes (30 ficheiros), tsc 0 erros, eslint 0 erros, thresholds de cobertura enforced (queues ≥80, api ≥70, server ≥75).**

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

## O que NÃO foi feito (dívidas conscientes)

1. **Fase 4 inteira** (regra 13 da spec): dashboard operacional de fecho (AC-6.4), chasing v1, página de convites (API existe: `/api/invitations*`), settings de office/regras (APIs existem: `/api/supplier-rules`, `/api/clients/[id]/ingest-alias`). É essencialmente UI sobre APIs prontas e testadas.
2. **UI de correção campo-a-campo** na fila de revisão: a API `POST /api/documents/[id]/review` com `corrections` está completa e testada; a UI atual só expõe validar/rejeitar/bulk/preview.
3. **UI do import** (passo de confirmação do mapeamento): API completa (`/api/documents/import` + `/confirm`), sem ecrã.
4. **Resend Inbound real**: entregue com interface + adaptador de teste (A5 permite); ativação documentada em RELEASE_NOTES_V2.md.
5. **Sugestão SNC por IA não corre automaticamente no parse** (decisão de custo): HISTORY/regra aplicam-se no parse; a sugestão IA é on-demand via `suggestSncForDocument` (falta expor endpoint/botão na UI de revisão).
6. Re-encriptação GCM é lazy (no próximo refresh de token) — tokens antigos continuam CBC até lá, por desenho (A12).

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
