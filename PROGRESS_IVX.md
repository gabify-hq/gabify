# PROGRESS_IVX.md — Conector InvoiceXpress (fonte, pull) — 3.º agente

Branch `feature/invoicexpress-source` (base `origin/staging` @ 1a2e51e).
Worktree `gabify-ivx`; BD de teste isolada `gabify_test_ivx`.

## 2026-07-07

- ✅ Arranque: fetch, worktree próprio (dir principal ocupado pelo agente
  toconline — árvore suja), `npm ci` + `prisma generate`, baseline.
  ⚠️ Baseline com a BD partilhada `gabify_test`: 11 falhas (schema drift por
  contenção entre agentes). Com `TEST_DATABASE_URL=…/gabify_test_ivx`:
  **478/478 verde** — vermelho era ambiental, não de código.
- ✅ PASSO 0: doc oficial InvoiceXpress API v2.0.0 capturada verbatim
  (`docs.invoicexpress.com` via `/llms.txt` + bundle OpenAPI 3.1 oficial) em
  `integrations/invoicexpress/docs/` com README de proveniência.
  Confirmado na doc real: JSON exclusivo; api_key na **query string** (sem
  alternativa por header); base `https://{account}.app.invoicexpress.com`;
  filtros/paginação de `GET /invoices.json`; PDF via poll 202→200; enums de
  type/status; retenção só como percentagem string; NIF ausente das respostas
  de documentos. — commit `613aa00`
- ✅ 🔴RED: 6 suites [INV] contra mocks derivados da doc (56 testes): cêntimos
  exatos c/ IVA 23% + retenção IRS; nota de crédito negativa; rascunhos nunca
  devolvidos; paginação 2 páginas sem duplicados + cursor `fromPage`; api_key
  nunca em logs/erros/raw (grep, sucesso e erro); contratos zod estritos;
  caso 19.99. RED confirmado (6 ficheiros a falhar). — commit `6978ea6`
- ✅ 🟢GREEN: `money.ts` (parser decimal por string, zero aritmética float),
  `redact.ts`, `schemas.ts` (zod estrito), `invoicexpress-client.ts` (timeout
  30s, retry 3× só 5xx/timeout, 2 req/s, redaction), `mapping.ts`,
  `connector.ts` (`listIssuedDocuments` + `fetchPdf`). 56/56 verdes; tsc
  limpo; lint 0 erros. `.env.example` append-only (placeholders comentados).
  — commit `f2671c9`
- ✅ Handoff: `INTEGRATION_NOTES_IVX.md` (12 ambiguidades + decisões),
  `HANDOFF_IVX.md` (slice de BD pós-merge, checklist de validação humana,
  unificação do DTO), `PROGRESS_IVX.md`.
- ✅ Gate final: `npx vitest run` completo (BD isolada) + `tsc --noEmit` +
  `npm run lint` — ver resultado no fim do HANDOFF_IVX.md.

## Estado

**IMPLEMENTADO / NÃO LIGADO À BD / NÃO TESTADO CONTRA API REAL.**
Sem push, sem merge — aguarda fecho dos três agentes paralelos.
