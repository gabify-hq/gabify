# ACCEPTANCE_GABIFY_V2.md — Catálogo de aceitação (TDD, RED-first)

**Como usar (obrigatório):** no início de cada fase, o agente escreve TODOS os testes `AC-*` dessa fase, corre a suite, e **confirma que os novos testes falham (RED)** — commit `fase N: acceptance RED (X testes a falhar)`. Só depois implementa até verde. Um AC marcado `[INV]` é um invariante de segurança: o seu teste nunca pode ser enfraquecido/apagado para "passar".

Convenções: `t()` = teste vitest; providers/IA/email sempre mockados; toda a factory de dados cria por serviços (não INSERTs crus); cada teste de isolamento usa dois offices (`officeA`, `officeB`) criados pelo seed de teste. IDs referenciam SPEC (§) e ADDENDUM (A#).

Ficheiros de teste sugeridos por fase: `tests/acceptance/fase0.*.test.ts`, etc. — organização interna à discrição do agente, IDs no nome do teste: `t('AC-0.1.a — signup sem convite não cria user', ...)`.

---

## FASE 0

### AC-0.1 Onboarding por convite (§0.1, A2)
- **AC-0.1.a [INV]** GIVEN BD com officeA existente · WHEN magic link pedido para email desconhecido sem convite e callback completado · THEN nenhum `User` criado, nenhuma sessão, resposta neutra (não distingue "sem conta" de "sem convite").
- **AC-0.1.b [INV]** GIVEN convite para `x@y.pt` no officeA com role ACCOUNTANT · WHEN aceite com token válido · THEN User criado com `officeId=A`, `role=ACCOUNTANT`, `acceptedAt` preenchido.
- **AC-0.1.c [INV]** GIVEN convite expirado (>72h) · WHEN aceitação tentada · THEN rejeitado; nenhum User.
- **AC-0.1.d [INV]** GIVEN convite já aceite · WHEN token reutilizado · THEN rejeitado.
- **AC-0.1.e [INV]** GIVEN convite emitido no officeA · WHEN aceite · THEN User não tem qualquer acesso a dados de officeB (smoke: GET clientes de B ⇒ 404/vazio).
- **AC-0.1.f [INV]** WHEN ACCOUNTANT ou VIEWER chama `POST /api/invitations` · THEN bloqueado; OWNER ⇒ 201.
- **AC-0.1.g** GIVEN convite pendente · WHEN `DELETE /api/invitations/:id` por OWNER · THEN aceitação posterior rejeitada (A2 revogação).
- **AC-0.1.h [INV]** GIVEN User existente no officeB · WHEN OWNER de A convida o mesmo email · THEN 409 `EMAIL_ALREADY_REGISTERED` (A2 um-user-um-office).
- **AC-0.1.i [INV]** GIVEN officeA com um único OWNER · WHEN tentativa de o apagar ou despromover · THEN 409 anti-lockout (A2).
- **AC-0.1.j** GIVEN convite pendente · WHEN `resend` · THEN token antigo inválido, novo válido; 6.º resend/hora ⇒ 429 (A2+A11).
- **AC-0.1.k** WHEN `scripts/seed-office.ts` corre em BD vazia · THEN Office + OWNER criados via serviços; correr 2.ª vez ⇒ idempotente ou erro claro, nunca duplicado.

### AC-0.2 Loop de aprovação de drafts (§0.2, A3)
- **AC-0.2.a [INV]** GIVEN draft `PENDING_REVIEW` · WHEN approve · THEN `EmailReview` e `AuditLog(EMAIL_DRAFT_APPROVED)` persistidos ANTES da invocação de `sendReply` (verificar ordem por spy/sequência) e `sendReply` chamado exatamente 1×.
- **AC-0.2.b [INV]** WHEN approve chamado 2× (sequencial ou concorrente via `Promise.all`) · THEN 1 envio, 2.ª chamada ⇒ 409/estado existente (A3 transição condicional na BD).
- **AC-0.2.c [INV]** GIVEN approve e reject concorrentes · THEN exatamente um vence; o outro 409 (A3).
- **AC-0.2.d [INV]** WHEN reject · THEN `sendReply` nunca invocado; `EmailReview` + `AuditLog(EMAIL_DRAFT_REJECTED)` persistidos.
- **AC-0.2.e** GIVEN `sendReply` mock a falhar · WHEN approve · THEN estado `APPROVED_SEND_FAILED` persistido + erro devolvido; `retry-send` com mock ok ⇒ `APPROVED_SENT`; 4.º retry ⇒ 409 (A3 máx 3).
- **AC-0.2.f [INV]** GIVEN estado ≠ `PENDING_REVIEW` · WHEN `PATCH .../draft` · THEN 409 (A3).
- **AC-0.2.g [INV]** WHEN VIEWER chama approve/reject · THEN bloqueado.
- **AC-0.2.h** Decisões sobrevivem a "fecho de sessão": aprovar via API, nova sessão, GET do email ⇒ estado `APPROVED_SENT` vindo da BD (nenhuma leitura de storage de browser no caminho — grep no gate cobre o resto).

### AC-0.3 Anexos Outlook (§0.3)
- **AC-0.3.a [INV]** GIVEN resposta Graph mockada com mensagem `hasAttachments=true` e 2 anexos (PDF+JPG) · WHEN `upsertMessage` · THEN 2 `EmailAttachment` criados com metadados corretos e 2 jobs `document-parse` enfileirados.
- **AC-0.3.b** GIVEN anexo inline (contentId, imagem pequena) · THEN não cria attachment de pipeline.
- **AC-0.3.c** GIVEN anexo de 30MB (A4 cap 25MB) · THEN ignorado com log, mensagem processada sem crash.
- **AC-0.3.d** Ambos os providers preenchem `toEmails`, `ccEmails`, `bodyHtml` quando presentes no payload (achado #19).

### AC-0.4 Webhooks fail-closed (§0.4)
- **AC-0.4.a [INV]** GIVEN `GRAPH_WEBHOOK_SECRET` indefinido · WHEN POST ao webhook Graph · THEN 503, nada processado.
- **AC-0.4.b [INV]** GIVEN secret definido · WHEN POST com `clientState` errado · THEN 401; com correto ⇒ 200 e processado.
- **AC-0.4.c [INV]** WHEN POST ao webhook Gmail sem header `Authorization` · THEN 401 (hoje passa — este teste TEM de nascer RED).
- **AC-0.4.d [INV]** WHEN JWT Gmail inválido · THEN 401; válido ⇒ processado.

### AC-0.5 Fundação
- **AC-0.5.a** `npm run test:coverage` sai 0 e emite relatório.
- **AC-0.5.b [INV]** GIVEN 2 jobs `document-parse` concorrentes para o mesmo `(inboundEmailId, type)` · THEN exatamente 1 draft criado (constraint, não check) — achado #10.
- **AC-0.5.c** Worker `document-parse` escreve `JobLog` start/end e em erro (achado #17).
- **AC-0.5.d** `AuditLog` nunca é atualizado após criação: grep/teste que garante ausência de `update` sobre AuditLog no código de produção; fluxo do worker cria o log com `entityId` real (A12).

---

## FASE 1

### AC-1.1 RBAC (§1.1)
- **AC-1.1.a [INV]** Teste de matriz parametrizado: para CADA rota de `src/app/api/` × cada role {OWNER, ACCOUNTANT, VIEWER} ⇒ resultado esperado da tabela §1.1. (Rota nova sem entrada na matriz ⇒ o teste falha por definição — DENY por omissão verificado com ação inventada `'foo'` ⇒ false.)
- **AC-1.1.b [INV]** VIEWER cria/edita/apaga cliente ⇒ bloqueado (nasce RED — hoje passa, achado #4).
- **AC-1.1.c [INV]** Recurso de officeB acedido por user de officeA ⇒ **404** (nunca 403), em todas as rotas de recurso identificável.

### AC-1.2 Sessões database (§1.2)
- **AC-1.2.a [INV]** GIVEN sessão ativa de ACCOUNTANT · WHEN role muda para VIEWER na BD · THEN request seguinte já é avaliada como VIEWER (sem re-login).
- **AC-1.2.b [INV]** WHEN registo de `Session` apagado · THEN request seguinte não autenticada.
- **AC-1.2.c** Grep-gate: `strategy: 'jwt'` ausente de `src/`.

### AC-1.3 Webhooks ativos (§1.3)
- **AC-1.3.a** WHEN connect flow Outlook/Google completa (mocks) · THEN `watchChanges` invocado e `outlookSubscriptionId`/`gmailWatchExpiry` persistidos.
- **AC-1.3.b** Job de renovação: subscrição perto de expirar ⇒ renovada e persistida; falha de renovação ⇒ JobLog de erro + conta marcada para polling 30s.
- **AC-1.3.c [INV]** Webhook Graph com `subscriptionId` desconhecido ⇒ rejeitado (o fallback "qualquer conta OUTLOOK" morreu).
- **AC-1.3.d** Conta com webhook saudável ⇒ intervalo de polling efetivo 5min; sem webhook ⇒ 30s.

### AC-1.4 Higiene (§1.4, A11, A12)
- **AC-1.4.a** Todos os list endpoints paginam: pedir com `take=5` devolve 5 + cursor; `take=999` ⇒ clamp a 200.
- **AC-1.4.b** Rate limit: exceder o limite da classe (usar limites baixos via env de teste) ⇒ 429 + `Retry-After`; chaves corretas por classe (A11): 2 users do mesmo office não partilham o limite de user; webhooks limitados por conta, não por IP.
- **AC-1.4.c [INV]** Grep-gate mock-data: nenhum import de `mock-data` fora de testes; dropdown de documentos lista clientes reais do office (e só desse office).
- **AC-1.4.d [INV]** `EmailThread` com `officeId`: threads de A invisíveis para B; backfill da migração cobre threads existentes (teste de migração com dados pré-existentes).
- **AC-1.4.e [INV]** `Document.clientId` de officeB rejeitado na escrita por user de officeA.
- **AC-1.4.f** `crypto.ts` GCM: novo ciphertext tem prefixo de versão GCM; ciphertext CBC legado ainda decripta; após refresh, regravado como GCM (A12).
- **AC-1.4.g** Workers testados: sync feliz, erro de provider (não crasha, JobLog de erro), re-execução idempotente (mesmo delta 2× ⇒ sem duplicados).

---

## FASE 2

### AC-2.1 Upload manual (§2.1, A4)
- **AC-2.1.a** Upload PDF válido ⇒ `Document(origem MANUAL_UPLOAD)` + job enfileirado; percorre o MESMO pipeline (estado final igual ao de um anexo de email com o mesmo ficheiro).
- **AC-2.1.b [INV]** `fx-fake-pdf.exe.pdf` (magic bytes não-PDF) ⇒ 422 rejeitado e logado (A4).
- **AC-2.1.c** >25MB ⇒ 413; 21 ficheiros ⇒ 400; tipo não suportado ⇒ 415; erros por ficheiro (batch com 1 mau ⇒ os bons entram, relatório identifica o mau).
- **AC-2.1.d [INV]** `fx-zipbomb.zip` ⇒ rejeitado antes de extração completa (A4); ZIP válido com 3 PDFs ⇒ 3 Documents.
- **AC-2.1.e [INV]** VIEWER ⇒ bloqueado; upload de A nunca visível em B.
- **AC-2.1.f** Sem `clientId` e NIF adquirente extraído corresponde a cliente ⇒ auto-associado; sem match ⇒ fila "por atribuir".

### AC-2.2 Caixa dedicada (§2.2, A5)
- **AC-2.2.a** Payload inbound simulado (adaptador de teste) para o `ingestAddress` do cliente X ⇒ Documents associados a X sem heurística.
- **AC-2.2.b [INV]** Endereço desconhecido ⇒ rejeitado + log; endereço regenerado ⇒ antigo morto.
- **AC-2.2.c [INV]** Falha dura DMARC no payload ⇒ documento em quarentena com `SENDER_UNVERIFIED`, vai a revisão — nunca processado como confiável nem descartado silenciosamente (A5).
- **AC-2.2.d** `allowedSenderDomains` definido e remetente fora ⇒ quarentena; dentro ⇒ normal (A5).
- **AC-2.2.e** 101.º email/hora para o mesmo endereço ⇒ recusado (A5+A11).
- **AC-2.2.f** Token do endereço ≥10 chars não-ambíguos (A5).

### AC-2.3 Split multi-fatura (§2.3, A6)
- **AC-2.3.a** `fx-multi-invoice.pdf` (3 QRs distintos) ⇒ 3 Documents filhos com `parentDocumentId`, page-ranges corretos, campos do QR respetivo, PDFs filhos no R2 — **zero chamadas IA** (determinístico).
- **AC-2.3.b** `fx-qr-single.pdf` ⇒ nenhum split.
- **AC-2.3.c** PDF sem QR, 5 páginas, mock IA devolve fronteiras com confidence 0.6 ⇒ NÃO splita; `NEEDS_REVIEW` com sugestão persistida (§2.3).
- **AC-2.3.d** PDF 51 páginas sem QR ⇒ `TOO_LARGE_FOR_AUTOSPLIT`, zero chamadas IA (A6).
- **AC-2.3.e** Mesmo binário re-submetido ⇒ resultado de split vem de cache por sha256, zero novas chamadas IA (A6).

### AC-2.4 Cliente errado (§2.4)
- **AC-2.4.a** Doc com NIF adquirente = cliente Y entregue na caixa de X ⇒ `WRONG_CLIENT_SUSPECT` + sugestão Y; reatribuição move e audita.

### AC-2.5 Import sheet (§2.5)
- **AC-2.5.a** `fx-sheet-valid.csv` ⇒ mapeamento IA (mock) apresentado; após confirmação, N Documents.
- **AC-2.5.b** `fx-sheet-2bad.csv` (10 linhas, 2 más: NIF checksum inválido; base+IVA≠total) ⇒ 8 importadas, relatório identifica linha e motivo das 2.
- **AC-2.5.c [INV]** Import NUNCA acontece sem confirmação do mapeamento (chamada direta sem passo de confirmação ⇒ 409).

---

## FASE 3

### AC-3.1 QR autoritativo (§3.2, A1)
- **AC-3.1.a [INV]** `fx-qr-multirate.pdf` ⇒ `vatBreakdown` completo (taxas/bases/valores por região), ATCUD, NIFs, retenção se presente — persistidos com **zero invocações Claude** (spy no cliente IA). ESTE TESTE NASCE RED (hoje descarta I1–K4).
- **AC-3.1.b [INV]** Campos de origem QR nunca sobrescritos por extração IA posterior no mesmo doc.
- **AC-3.1.c [INV]** Todos os montantes persistidos como Decimal/cêntimos — teste que injeta `0.1+0.2` clássico no caminho e verifica soma exata (A1).

### AC-3.2 Extração IA (§3.3)
- **AC-3.2.a** `fx-noqr-invoice.pdf` com mock IA válido ⇒ objeto canónico completo persistido, `extractionSource=AI_*`, confidences presentes.
- **AC-3.2.b [INV]** Mock IA devolve JSON malformado/campo em falta ⇒ Zod rejeita ⇒ `NEEDS_REVIEW`, ZERO persistência parcial (doc sem campos extraídos fantasma).
- **AC-3.2.c** `fx-recibo-verde.pdf` ⇒ `totalWithholding` > 0 e coerência Σbases+ΣIVA−retenção=total verificada.
- **AC-3.2.d** Incoerência aritmética (mock com delta de 5 cêntimos) ⇒ `NEEDS_REVIEW` com delta apontado; 1 cêntimo ⇒ passa (tolerância A1).

### AC-3.3 XML (§3.4)
- **AC-3.3.a** `fx-ciuspt.xml` ⇒ extração determinística completa, `extractionSource=XML`, zero IA.
- **AC-3.3.b** `fx-xml-random.xml` ⇒ fallback IA sem crash.

### AC-3.4 Duplicados (§3.5, A8)
- **AC-3.4.a** Mesmo doc via email e via upload ⇒ 2.º `DUPLICATE_SUSPECT` com link ao 1.º.
- **AC-3.4.b** `documentNumber` " ft 2026/12 " vs "FT 2026/12" ⇒ detetado como mesmo (normalização A8).
- **AC-3.4.c [INV]** Colisão na unique parcial ⇒ tratada como suspeito, nunca 500 (A8).
- **AC-3.4.d** Docs distintos mesmo fornecedor/dia/totais diferentes ⇒ sem flag.

### AC-3.5 Fornecedores (§3.6)
- **AC-3.5.a** Extração cria/atualiza `Supplier` por `(officeId, nif)`; stats atualizadas; NIF igual em offices diferentes ⇒ Suppliers separados.

---

## FASE 4

### AC-4.1 Fila e estados (§4.1, A7)
- **AC-4.1.a** Confiança ≥0.85 + coerente + sem flags ⇒ `PRE_VALIDATED`; resto ⇒ `NEEDS_REVIEW`.
- **AC-4.1.b [INV]** `validate`/`correct` ⇒ `DocumentReview` (com diffs campo-a-campo no correct) + `AuditLog`; VIEWER bloqueado.
- **AC-4.1.c [INV]** Dois reviewers concorrentes no mesmo doc: um vence, outro 409 com estado atual (`expectedVersion` — A7). Nasce RED.
- **AC-4.1.d [INV]** Doc `EXPORTED` rejeita qualquer edição/review (exceto `reopen` — ver AC-6.3).
- **AC-4.1.e** Bulk 200: item com conflito reporta `CONFLICT`, sem role reporta `FORBIDDEN`, resto `OK`; falha de um não reverte os outros (A7).
- **AC-4.1.f** `resolve-duplicate(keep|delete|distinct)` e `split-approve` funcionam e auditam.

### AC-4.2 Regras por fornecedor (§4.2)
- **AC-4.2.a** Regra `autoValidate` + doc confiança ≥0.85 sem flags ⇒ direto a `VALIDATED` com `AuditLog(AUTO_VALIDATED_BY_RULE, ruleId)`.
- **AC-4.2.b** Doc com flag (duplicado/DMARC/aritmética) NUNCA auto-valida, mesmo com regra.
- **AC-4.2.c** Regra de cliente sobrepõe regra global do office.
- **AC-4.2.d [INV]** Regra de officeA nunca se aplica a docs de officeB.
- **AC-4.2.e** 3 correções humanas idênticas (mesma categoria, mesmo fornecedor) ⇒ sugestão de regra aparece; 2 ⇒ não; regra nunca criada sem clique humano.

---

## FASE 5

### AC-5.1 Sugestão SNC (§5.1–5.2, A13)
- **AC-5.1.a** Fornecedor com histórico validado ⇒ sugestão `sncSource=HISTORY`, zero IA.
- **AC-5.1.b [INV]** Mock IA devolve code inexistente na taxonomia ⇒ rejeitado, `NEEDS_REVIEW` — nunca persiste code inventado.
- **AC-5.1.c** Correção humana da rubrica atualiza o histórico (próximo doc do fornecedor sugere a corrigida).
- **AC-5.1.d [INV]** Rubrica de dedutibilidade sensível (621x/625x) na 1.ª ocorrência por fornecedor ⇒ `NEEDS_REVIEW` de IVA obrigatório (A13); com regra humana criada ⇒ automatiza.
- **AC-5.1.e** `accountOverrides` do cliente mapeia o code para a conta específica no export.

---

## FASE 6

### AC-6.1 Export ZIP (§6.1, A9)
- **AC-6.1.a** Export de período com 10 docs `VALIDATED` (2 multi-taxa) ⇒ ZIP com estrutura `Cliente/Ano/Mês/{Recebidas|Emitidas|Outros}/...` exata (abrir o ZIP no teste e verificar paths); docs transitam para `EXPORTED`; `ExportDocument` liga export↔docs (A9).
- **AC-6.1.b [INV]** Docs `NEEDS_REVIEW`/`PRE_VALIDATED` nunca incluídos por defeito.
- **AC-6.1.c [INV]** Export cross-tenant impossível (clientId de B por user de A ⇒ 404).
- **AC-6.1.d** `AuditLog` do export escrito antes da geração do signed URL; re-download gera novo URL.

### AC-6.2 CSV/Excel (§6.2, A9, A1)
- **AC-6.2.a** `lancamentos.csv`: separador `;`, decimal vírgula, UTF-8 BOM (verificar bytes BOM), 12 linhas para os 10 docs (split por taxa), cabeçalho de formato presente.
- **AC-6.2.b [INV]** Somas do `resumo_iva` = Σ dos docs, calculadas em Decimal/cêntimos, exatas ao cêntimo (A1).
- **AC-6.2.c** `.xlsx` abre com tipos numéricos (células numéricas, não texto) e rubrica SNC transportada (com override do cliente aplicado — AC-5.1.e).

### AC-6.3 Reabertura e re-export (A9)
- **AC-6.3.a** `reopen` por OWNER com motivo ⇒ `EXPORTED → VALIDATED`, auditado; por ACCOUNTANT ⇒ bloqueado; sem motivo ⇒ 400.
- **AC-6.3.b** Re-export com `includeExported=true` inclui docs exportados sem lhes mudar o estado.

### AC-6.4 Dashboard de fecho (§6.3)
- **AC-6.4.a** Contagens por estado = verdade da BD; "fechar período" com pendências ⇒ redireciona à fila filtrada, não exporta parcial sem confirmação explícita.

### AC-6.5 E2E final [INV]
- **AC-6.5.a** Funil completo num teste: email simulado com `fx-qr-multirate.pdf` na caixa dedicada do cliente X → extração QR (zero IA) → regra de fornecedor auto-valida → export do período → ZIP contém o PDF no path correto + linha(s) no CSV com os valores exatos do QR. Um teste, o produto inteiro.

---

## Regras finais
1. Nenhum `[INV]` pode ser apagado, skipado (`.skip`) ou enfraquecido para fazer um gate passar. Se um `[INV]` não consegue passar, é `BLOCKED.md`, não é rasura.
2. Testes adicionais são bem-vindos; este catálogo é o mínimo, não o teto.
3. Mocks de IA vivem em `tests/mocks/ai.ts` com cenários nomeados (válido, malformado, code-inventado, low-confidence) reutilizados entre fases.
4. No `RELEASE_NOTES_V2.md`: tabela final AC-id → PASS/BLOCKED.
