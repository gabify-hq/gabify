# HANDOFF_IVX.md — Conector InvoiceXpress como fonte (pull) v1

> **Estado global: IMPLEMENTADO / NÃO LIGADO À BD / NÃO TESTADO CONTRA API REAL.**
> Branch: `feature/invoicexpress-source` (base `origin/staging`). Worktree
> `C:\Users\edgar\gabify-ivx`, BD de teste isolada `gabify_test_ivx`.
> Desenvolvido em paralelo com os agentes toconline (dono de `prisma/**`) e
> moloni (dono de `src/server/sources/types.ts`) — zonas nunca tocadas.

## O que existe (tudo IMPLEMENTADO, com testes verdes)

| Ficheiro | Papel |
|---|---|
| `integrations/invoicexpress/docs/` | Doc oficial v2.0.0 verbatim (OpenAPI + páginas .md) — fonte de verdade |
| `src/server/sources/invoicexpress/types-local.ts` | DTO local (`InvoicexpressSourceDocument`) — duplicação DELIBERADA do conceito SourceDocument, a unificar pós-merge |
| `src/server/sources/invoicexpress/money.ts` | `amountToCents` (parser decimal por string, caso 19.99 coberto) + `percentToWithholdingCents` (retenção IRS derivada, aritmética inteira) |
| `src/server/sources/invoicexpress/redact.ts` | Redaction obrigatória da api_key (viaja na query string — [INV CRÍTICO]) |
| `src/server/sources/invoicexpress/schemas.ts` | Contratos zod **estritos** derivados da doc guardada |
| `src/server/sources/invoicexpress/invoicexpress-client.ts` | HTTP: subdomínio da conta, api_key na query, timeout 30s, retry 3× só 5xx/timeout/rede, 2 req/s, erros sempre redigidos |
| `src/server/sources/invoicexpress/mapping.ts` | Listagem → DTO: cêntimos na fronteira, datas ISO, breakdown IVA por taxa, notas de crédito negativas |
| `src/server/sources/invoicexpress/connector.ts` | `InvoicexpressConnector.listIssuedDocuments` (paginado, dedup por externalId, nunca rascunhos) + `fetchPdf` (poll 202→200) |
| `src/server/sources/invoicexpress/fixtures.ts` + 6 `*.test.ts` | Mocks derivados da doc + 56 testes [INV] |
| `INTEGRATION_NOTES_IVX.md` | 12 ambiguidades da doc e decisões conservadoras |

Uso (zero persistência — credenciais por parâmetro):

```typescript
const connector = new InvoicexpressConnector({ accountName, apiKey })
const { documents } = await connector.listIssuedDocuments({ dateFrom: '2026-06-01' })
const { pdfUrl } = await connector.fetchPdf(documents[0].externalId)
```

## (a) Desenho do slice de integração pós-merge — NÃO IMPLEMENTADO

1. **Schema (dono: quem tiver `prisma/**` na altura)** — modelo
   `InvoicexpressConnection`: `id`, `officeId` (FK Office, `onDelete: Cascade`),
   `accountName String`, `apiKeyEncrypted String` (AES-256-GCM com
   `TOKEN_ENCRYPTION_KEY`, como as restantes ligações), `lastPulledAt DateTime?`,
   `lastCursorPage Int?`, `active Boolean`, `deletedAt DateTime?`, timestamps.
   Migração com nome semântico; nunca `db push`.
2. **Painel Ligações** — entrada "InvoiceXpress" como **fonte** (pull), ao lado
   das ligações existentes: formulário accountName + apiKey (nunca ecoada de
   volta), teste de ligação = `listIssuedDocuments({ perPage: 1 })`.
3. **Job de pull (BullMQ)** — worker idempotente: por ligação ativa, janela
   `date[from] = lastPulledAt - margem`, `listIssuedDocuments`, e por documento:
   **dedup por `externalId`** (unique composto `officeId + source + externalId`),
   origem **`API_PULL`**, estado **`PRE_VALIDADO`**; `AuditLog` antes de
   persistir cada documento (aiGenerated: false, action: `INVOICEXPRESS_PULL`).
   `JobLog` início/fim; backoff exponencial, máx. 3 retries.
4. **PDF** — opcional no job: `fetchPdf` → download do `pdfUrl` → R2 com signed
   URLs (nunca públicas). Atenção: a doc não diz se o `pdfUrl` exige
   autenticação — testar com conta real.
5. **Unificação do DTO** — fundir `types-local.ts` com o contrato de sources do
   moloni (`src/server/sources/types.ts`): mapear
   `InvoicexpressSourceDocument` → `SourceDocument` unificado; os campos são
   deliberadamente próximos (externalId, cêntimos, vatBreakdownCents,
   withholdingCents, raw). Depois apagar `types-local.ts` e atualizar imports —
   slice pequeno e mecânico.
6. **Docs** — criar `docs/technical/invoicexpress.md` e secção em
   `docs/HOW_IT_WORKS.md` (não criados agora para não tocar em ficheiros
   partilhados durante o paralelo).

## (b) Checklist de validação humana (conta InvoiceXpress real)

Pré-requisito: conta de teste + `INVOICEXPRESS_ACCOUNT_NAME`/`INVOICEXPRESS_API_KEY`
no `.env.local` (placeholders já no `.env.example`).

- [ ] `listIssuedDocuments()` devolve as faturas finalizadas da conta (comparar
      com a UI web) — **confirmar se faturas com estado "final" (finalizadas mas
      não enviadas) aparecem** com o filtro `sent/settled/second_copy`
      (INTEGRATION_NOTES_IVX §1). Se faltarem, rever o filtro.
- [ ] Zod estrito não rebenta com campos extra não documentados (§12); se
      rebentar, relaxar campo a campo e registar.
- [ ] Fatura real com retenção IRS: `withholdingCents` derivado bate certo com o
      valor mostrado pela UI do InvoiceXpress (§3) e `totalCents` corresponde ao
      campo `total` (§4).
- [ ] Nota de crédito real: confirmar que a API devolve valores positivos (o
      conector aplica o sinal negativo — §8).
- [ ] Fatura simplificada emitida na conta: com que `type` aparece na listagem?
      (§2)
- [ ] Paginação real: conta com >30 documentos, verificar lista completa sem
      duplicados e `fromPage` a retomar corretamente.
- [ ] `fetchPdf`: 202→200 real e download do `pdfUrl` (autenticação? — §PDF).
- [ ] Redaction: forçar erro (api_key inválida, DNS errado) e grep ao output
      por a chave — não pode aparecer.
- [ ] Rate limit: pull grande não excede 780 req/min (o gate de 2 req/s garante
      120/min).
- [ ] Multi-moeda: se a conta tiver documentos não-Euro, verificar `currencyRaw`
      (§11).

## (c) INTEGRATION_NOTES_IVX.md

Completo na raiz do repo — 12 ambiguidades documentadas com decisão e fonte.

## Gate (verificado em 2026-07-07)

- `npx vitest run` com `TEST_DATABASE_URL=…/gabify_test_ivx`: **verde** (baseline
  478 + 56 novos). ⚠️ A BD partilhada `gabify_test` estava corrompida por
  contenção entre agentes paralelos — usar sempre BD própria por worktree.
- `npx tsc --noEmit`: limpo. `npm run lint`: 0 erros (14 warnings pré-existentes,
  nenhum nos ficheiros novos).
- Commits atómicos: docs → RED → GREEN → handoff. **Sem push, sem merge** (regra
  do paralelo); PR para staging só depois de os três agentes fecharem.
