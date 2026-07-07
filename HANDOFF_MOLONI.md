# HANDOFF_MOLONI.md — Moloni source connector v1

Estado: **IMPLEMENTADO / NÃO LIGADO À BD / NÃO TESTADO CONTRA API REAL**

Branch `feature/moloni-source`. Tudo doc-driven a partir de
`integrations/moloni/docs/` (verbatim, 2026-07-07); decisões e leituras
conservadoras em `INTEGRATION_NOTES_MOLONI.md`.

## O que existe

| Ficheiro | Papel |
|---|---|
| `src/server/sources/types.ts` | Contrato v1: `DocumentSourceConnector`, `SourceDocument` (DTO neutro, tudo em cêntimos), `Page<T>` |
| `src/server/sources/moloni/client.ts` | HTTP client puro: OAuth (password + refresh grants), access token reutilizado até 60 s do fim da hora, retry 3× só 5xx/timeout, timeout 30 s, rate limit interno 2 req/s, redaction de credenciais |
| `src/server/sources/moloni/connector.ts` | `MoloniConnector implements DocumentSourceConnector`: getAll→filtro status≠0→getOne→map; cursor = offset; de-dup por `document_id`; `fetchPdf` via getPDFLink (signed=1) |
| `src/server/sources/moloni/mapper.ts` | getOne → `SourceDocument`; floats→cêntimos na fronteira; vatBreakdown agregado por taxa (permil) |
| `src/server/sources/moloni/money.ts` | Parser decimal dedicado (string/inteiros, meio-para-cima); nunca aritmética float encadeada |
| `src/server/sources/moloni/schemas.ts` | Zod estrito 1:1 com a doc guardada (grant, getAll, getOne, getPDFLink, erro auth) |
| `src/server/sources/moloni/mock-api.ts` + `fixtures.ts` | Fake API doc-driven usado pelas suites [INV] |
| Testes | 45 testes: IVA exato ao cêntimo (caso 19.99), rascunhos nunca devolvidos, paginação com retoma e de-dup, reutilização de token (>1 grant/hora falha o teste), refresh, retry/timeout, redaction (grep), contrato estrito |

O connector é **puro**: recebe `MoloniCredentials` (+ `MoloniTokenState`
opcional) por parâmetro e devolve dados. Novos tokens saem pelo callback
`onTokenState` — é o gancho para a persistência.

## (a) Desenho do slice de integração pós-merge

### Modelo `MoloniConnection` (proposta — NÃO criado; schema é do outro agente)

```prisma
model MoloniConnection {
  id            String   @id @default(cuid())
  officeId      String
  office        Office   @relation(fields: [officeId], references: [id], onDelete: Restrict)
  clientId      String?  // Client da carteira a que esta empresa Moloni corresponde
  companyId     Int      // Moloni company_id (companies/getAll)
  companyName   String   // cache para o painel
  username      String   // login Moloni do cliente — AES-GCM como as outras credenciais
  password      String   // AES-GCM
  refreshToken  String?  // AES-GCM; validade 14 dias
  accessToken   String?  // AES-GCM; validade 1 h
  tokenExpiresAt DateTime?
  cursor        String?  // retoma de listIssuedDocuments
  lastPulledAt  DateTime?
  status        String   @default("ACTIVE") // ACTIVE | ERROR | DISABLED
  lastError     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime? // soft delete (regra Gabify)

  @@unique([officeId, companyId])
}
```

- Encriptação AES-GCM com `TOKEN_ENCRYPTION_KEY`, como as restantes
  credenciais OAuth (regra `security.md`).
- `MOLONI_CLIENT_ID` / `MOLONI_CLIENT_SECRET` (credenciais de developer da
  app Gabify) vêm do ambiente — já em `.env.example` — nunca da BD.

### Dedup e estados

- Dedup por `externalId` em `EntityMap` (`system: MOLONI`, chave
  `document_id`), como o toconline faz para push — aqui em sentido pull.
- Origem do documento: `API_PULL`; estado inicial `PRE_VALIDADO` (veio de
  software de faturação certificado, não precisa de OCR nem classificação).
- Anti-eco: **N/A** — não há push para o Moloni, logo não há risco de
  reimportar o que exportámos.

### Painel Ligações

- Entrada "Moloni" como **fonte** (pull), ao lado das ligações existentes:
  formulário username/password + escolha da empresa (companies/getAll),
  estado da ligação, último pull, último erro.
- PT-PT, tabela, estados de loading/vazio/erro (regras `ui.md`).

### Job `moloni-pull`

- Worker BullMQ (idempotente, backoff exponencial, máx. 3 retries, JobLog):
  1. carrega `MoloniConnection` ativa, desencripta credenciais
  2. instancia `MoloniConnector` com `tokenState` + `onTokenState` a
     persistir tokens re-encriptados
  3. `listIssuedDocuments(connection.cursor)` em loop de páginas
  4. por documento: dedup via EntityMap → cria Document (origem API_PULL,
     PRE_VALIDADO) → `fetchPdf` → upload R2 (URLs assinados) → AuditLog
  5. guarda `cursor`/`lastPulledAt`
- Cadência sugerida: repeatable job de hora a hora por ligação.
- **Nota cursor**: cursor de offset só cresce; para apanhar documentos
  novos numa execução seguinte, recomeçar do último offset conhecido é
  correto porque o Moloni pagina por inserção — validar com conta real
  (checklist b3); alternativa documentada: `documents/getModifiedSince`
  (doc guardada) com `lastPulledAt`, mais robusto para sync incremental.

## (b) Checklist de validação humana com conta Moloni real

1. Criar conta developer (Developer ID, Client Secret, Redirect URI) e
   confirmar que o grant `password` está autorizado para o client id.
2. `grant_type=password` devolve `expires_in: 3600` e refresh de 14 dias;
   confirmar reutilização (nenhum 2.º grant numa sessão de pulls).
3. Paginação real: empresa com >50 documentos → 2+ páginas sem duplicados;
   confirmar se offset cresce por ordem de inserção (nota cursor acima).
4. Fatura real multi-taxa: `vatBreakdownCents` bate certo com o PDF, ao
   cêntimo (23%/13%/6%, caso com isenção M07).
5. Confirmar semântica de `status` fora de {0,1} (anulados? — doc não
   enumera; ver `documentCancel` na doc).
6. `getPDFLink` com `signed=1` devolve PDF assinado; URL expira? (doc não
   diz — medir).
7. Confirmar content-type exigido na prática (a doc contradiz-se no modo
   JSON — ver INTEGRATION_NOTES §1).
8. Empresa com moeda estrangeira (exchange_currency): validar leitura
   conservadora `currency: 'EUR'` (INTEGRATION_NOTES §6).
9. Rate limit real da API (a doc não publica — temos 2 req/s interno).

## (c) INTEGRATION_NOTES_MOLONI.md

Todas as decisões doc-driven, com fonte por página e ambiguidades marcadas
⚠️ — ver ficheiro na raiz.

## Fora de âmbito (não fazer neste slice)

Push para Moloni; sync de clientes/produtos; webhooks; InvoiceXpress (o
contrato `DocumentSourceConnector` fica pronto para ele); qualquer toque em
`prisma/**`, ficheiros toconline, ExportTarget/export, UI da ficha do
cliente, auth/middleware/portal. `docs/technical/moloni-source.md` e a
secção em HOW_IT_WORKS ficam para o slice de integração (ficheiros fora da
zona autorizada deste trabalho paralelo).
