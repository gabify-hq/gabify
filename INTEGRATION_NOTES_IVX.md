# INTEGRATION_NOTES_IVX.md — InvoiceXpress v1 (pull de faturas emitidas)

> **Estado: IMPLEMENTADO / NÃO LIGADO À BD / NÃO TESTADO CONTRA API REAL.**
> Todo o código nasceu de documentação (doc-driven), por decisão explícita do
> dono do projeto. Nenhum pedido foi feito ao InvoiceXpress real. Antes de usar
> em produção, seguir o **Checklist de validação humana** no HANDOFF_IVX.md.

## Fontes de verdade guardadas no repo

| Ficheiro | Origem | Conteúdo |
|---|---|---|
| `integrations/invoicexpress/docs/openapi.yaml` | `https://docs.invoicexpress.com/_bundle/index.yaml` (link "Download OpenAPI description" da doc oficial) | Spec OpenAPI 3.1 oficial, API v2.0.0 |
| `integrations/invoicexpress/docs/*.md` | `https://docs.invoicexpress.com/<página>.md` (versões markdown oficiais via `/llms.txt`) | Cópia verbatim das páginas usadas |
| `integrations/invoicexpress/docs/README.md` | — | Proveniência, data de captura (2026-07-07) e factos-chave verificados |

**Regra aplicada:** nenhum endpoint, campo, parâmetro ou semântica inventados —
tudo o que o código usa existe na spec ou nas páginas guardadas. Ambiguidades
resolvidas pela leitura mais conservadora (registadas abaixo).

## Endpoints usados e onde estão documentados

| Pedido | Fonte |
|---|---|
| `GET /invoices.json?api_key=…&type[]=…&status[]=…&non_archived=true&page=…&per_page=…&date[from]=…&date[to]=…` | `docs/listinvoices.md`; spec `QueryParamns` + `InvoiceListAllResponse` |
| `GET /api/pdf/{document-id}.json?api_key=…` → 202 (repetir) → 200 `{output:{pdfUrl}}` | `docs/generatepdf.md`; spec `PdfResponse` + schema `202` |

- Base URL: `https://{account_name}.app.invoicexpress.com` (spec, Servers).
- Formato: JSON exclusivo; `Accept: application/json` nos GET.
- Autenticação: `api_key` **na query string** (spec, Security `apiKeyAuth In: query`).
- Rate limit documentado: 780 req/min por conta (429 em excesso). O cliente
  interno limita a 2 req/s por instância — muito abaixo do limite.

## [INV CRÍTICO] api_key na query string — redaction

A doc **não oferece alternativa por header** — a chave viaja no URL de todos os
pedidos. Mitigação implementada (`redact.ts` + `invoicexpress-client.ts`):

- Toda a mensagem de erro que inclua o URL do pedido passa por `redactUrl` +
  `redactApiKey` antes de ser lançada.
- Erros de rede (que embebem o URL no texto, ex. `fetch failed: … api_key=…`)
  são igualmente redigidos.
- O campo `raw` do DTO é o corpo da resposta (nunca o URL do pedido), portanto
  nunca contém a chave — verificado por teste (grep no JSON serializado, nos
  caminhos de sucesso e de erro).
- O cliente nunca faz `console.*` — verificado por teste com spies.

## Ambiguidades encontradas e decisões tomadas

1. **`status[]` do filtro vs `status` da resposta** — o enum documentado do
   filtro é `draft, sent, settled, canceled, second_copy, deleted`, mas os
   exemplos de resposta mostram `status: "final"` (não existe no enum do
   filtro). Decisão conservadora: pedir `status[]=sent&status[]=settled&status[]=second_copy`
   (todos os estados finalizados do enum) **e** aplicar guarda client-side que
   descarta qualquer documento devolvido com `draft`/`canceled`/`deleted`;
   `final` na resposta é aceite como finalizado. ⚠️ A validação humana tem de
   confirmar se faturas finalizadas mas não enviadas ("final") são devolvidas
   por estes filtros — se não forem, o filtro tem de ser revisto.
2. **`SimplifiedInvoice` ausente do enum de `type[]`** — o path de criação/get
   aceita `simplified_invoices`, mas o enum documentado do filtro de listagem é
   `Invoice, InvoiceReceipt, CreditNote, DebitNote, Receipt, CashInvoice`.
   Decisão: pedir apenas os seis tipos documentados; se a conta emitir faturas
   simplificadas, verificar na validação humana com que `type` aparecem na
   listagem.
3. **Retenção IRS: só a percentagem existe** — `retention` é uma **string** com
   a percentagem (ex. `"25.0"`); a doc não expõe o valor retido nem a base de
   incidência. Decisão: `withholdingCents` é **derivado** =
   `round(before_taxes_em_cêntimos × retention%)` com aritmética inteira
   (percentagem convertida em fração numerador/denominador — zero floats),
   assumindo incidência sobre a base antes de IVA (regra fiscal PT para
   retenção IRS de profissionais). Campo documentado como derivado no DTO;
   validação humana obrigatória com uma fatura real com retenção.
4. **`total` inclui ou não a retenção?** — exemplo da doc: `sum 24.39, taxes
   5.61, total 30` ⇒ `total = before_taxes + taxes`, sem menção a retenção.
   Decisão: `totalCents` = campo `total` da API tal-e-qual (sinal à parte);
   o valor a receber (total − retenção) não é calculado neste slice.
5. **NIF do cliente final não vem nos documentos** — nas respostas de listagem
   o `client` é `{id, name, country}` e no detalhe `{id, name, code, country,
   email}`; `fiscal_id` só existe em `GET /clients/{client-id}.json`
   (`docs/getclient.md`). Decisão: `clientNif: null` no DTO v1, com
   `clientExternalId` preservado para resolução futura via endpoint de clients
   (fora de âmbito: seria "sync de clientes").
6. **Unicidade do `id` entre tipos de documento** — a doc não o afirma
   explicitamente, mas `GET /api/pdf/{document-id}.json` recebe **só o id**
   (sem tipo), logo o id identifica o documento de forma única na conta.
   Decisão: `externalId = String(id)`.
7. **Montantes como floats JSON** — `sum/before_taxes/taxes/total` e os campos
   dos itens (`subtotal`, `tax_amount`) vêm como números JSON; `unit_price` e
   `quantity` dos itens da listagem vêm como **strings** (`"1.0"`). Decisão:
   conversão para cêntimos na fronteira via representação decimal em string
   (nunca multiplicação float); `unit_price`/`quantity` preservados como raw
   strings no DTO (`unitPriceRaw`/`quantityRaw`).
8. **Notas de crédito devolvidas com valores positivos** — a doc não mostra
   exemplos de CreditNote com sinal. Decisão conservadora: o mapper aplica
   sinal negativo a TODOS os campos monetários quando `type === 'CreditNote'`
   (semântica de fonte: crédito reduz faturação). Confirmar na validação
   humana que a API devolve mesmo valores positivos.
9. **Envelope do detalhe (`GET /{invoices-type}/{id}.json`)** — a spec documenta
   sempre a chave `invoice`, mesmo para notas de crédito, o que é suspeito.
   Decisão: **não usar o endpoint de detalhe** neste slice — a listagem já traz
   itens, impostos e totais completos.
10. **Breakdown de IVA não existe como campo** — derivado por agregação dos
    itens (`items[].tax.value` × `subtotal`/`tax_amount`), somado em cêntimos
    por taxa. Itens sem `tax` entram na taxa 0.
11. **`currency: "Euro"`** — a API devolve o nome, não o código ISO. Decisão:
    mapa mínimo `Euro → EUR`; qualquer outro valor passa tal-e-qual em
    `currency` e fica sempre preservado em `currencyRaw`.
12. **Zod estrito** — os schemas rejeitam campos não documentados de propósito
    (contrato doc-driven). Se a API real devolver campos extra não documentados,
    o pull falha de forma explícita: nesse caso relaxar campo a campo,
    registando cada um aqui. (Alternativa `passthrough` rejeitada: esconderia
    divergências da doc.)

## Fora de âmbito (v1)

Push/emissão de documentos, sync de clientes/itens, webhooks (não documentados
na doc guardada), guias de transporte, estimates/orçamentos, SAF-T, persistência
em BD, UI. Ver HANDOFF_IVX.md para o desenho do slice de BD pós-merge.
