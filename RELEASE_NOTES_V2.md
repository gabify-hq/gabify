# RELEASE_NOTES_V2.md — Gabify v2

Execução autónoma da SPEC_GABIFY_V2 (+ ADDENDUM) na branch `feature/gabify-v2`.
Estado final: **Fases 0–3 completas + slice de UI + slice S5 + Fase C (conciliação bancária v1), gate verde (349 testes, thresholds de cobertura enforced)**. Fase 4 não executada (regra 13 — ver HANDOFF.md).

## Dependências adicionadas (bibliotecas, não infraestrutura — A6)

`pdf-lib` (split/fixtures), `file-type` (magic bytes A4), `decimal.js` (A1), `jose` (explícito — já era usado), `qrcode` (dev, fixtures A10), `@vitest/coverage-v8` (dev).

## Recomendações de produção (fora de scope — A4/A5)

- **Antivírus/scanning** de ficheiros carregados: recomenda-se scanning ao nível do R2/CDN (fora de scope por A4).
- **Resend Inbound**: a caixa dedicada de ingestão usa a interface `InboundEmailProvider` com um adaptador de teste (`POST /api/ingest/simulate`, protegido por `INGEST_TEST_SECRET`, desativado em produção). Para ativar em produção: configurar Resend Inbound (ou equivalente) a fazer POST do payload normalizado para um endpoint que chame `processInboundIngest`, definir `INGEST_DOMAIN` e o DNS MX do domínio de ingestão.

## Tabela de aceitação (AC → resultado)

| AC | Resultado | Notas |
|---|---|---|
| AC-0.1.a–k (onboarding por convite, anti-lockout A2) | PASS | |
| AC-0.2.a–h (loop de aprovação, máquina de estados A3) | PASS | |
| AC-0.3.a–d (anexos Outlook, caps A4, to/cc/html) | PASS | |
| AC-0.4.a–d (webhooks fail-closed) | PASS | |
| AC-0.5.a–d (coverage, constraint anti-race, JobLog, AuditLog imutável) | PASS | AC-0.5.a verificado pelo gate (`test:coverage` exit 0) |
| AC-1.1.a–c (RBAC matriz, arch-test, 404 cross-tenant) | PASS | |
| AC-1.2.a–c (sessões database) | PASS | testado ao nível adapter+callback (ver PROGRESS decisões) |
| AC-1.3.a–d (webhooks ativos, renovação, polling 5min) | PASS | |
| AC-1.4.a–g (paginação, rate limits A11, mock-data purge, EmailThread officeId, GCM A12, workers) | PASS | |
| AC-2.1.a–f (upload manual, magic bytes, zip-bomb A4) | PASS | |
| AC-2.2.a–f (caixa dedicada A5: DMARC, allowlist, rate limit, token ≥10) | PASS | |
| AC-2.3.a–e (split A6: QR determinístico, cap 50, cache sha256) | PASS | |
| AC-2.4.a (cliente errado + sugestão) | PASS | |
| AC-2.5.a–c (import com confirmação obrigatória) | PASS | |
| AC-3.1.a–c (QR autoritativo multi-taxa, Decimal/cêntimos A1) | PASS | |
| AC-3.2.a–d (extração IA zod, coerência ±2c, retenção) | PASS | |
| AC-3.3.a–b (XML determinístico + fallback) | PASS | extração UBL leve; parser CIUS-PT completo fora de scope (§7) |
| AC-3.4.a–d (duplicados, normalização A8, colisão sem 500) | PASS | |
| AC-3.5.a (Supplier por office) | PASS | |
| AC-4.1.a–f (fila, optimistic locking A7, bulk, EXPORTED imutável) | PASS | |
| AC-4.2.a–e (regras: autoValidate, flags nunca saltam fila, isolamento, aprendizagem 3×) | PASS | |
| AC-5.1.a–e (SNC: HISTORY zero-IA, code inventado rejeitado, gate A13, overrides) | PASS | |
| AC-6.1.a–d (export ZIP, nunca não-validados, cross-tenant, audit antes do URL) | PASS | |
| AC-6.2.a–c (CSV BOM `;` vírgula, linha por taxa, somas exatas, xlsx numérico) | PASS | |
| AC-6.3.a–b (reopen OWNER c/ motivo, re-export sem mudar estado) | PASS | |
| AC-6.4.a (dashboard de fecho) | NÃO EXECUTADO | Fase 4 — ver HANDOFF |
| AC-6.5.a (E2E funil completo) | PASS | um teste, o produto inteiro |
| S5.1.a–d (review completo: vatBreakdown/retenção/moeda/dueDate, coerência no servidor, VALIDATED imutável sem reopen) | PASS | slice pós-entrega S5 |
| S5.2.a–c (GET /api/documents: filtros AND, cross-tenant nunca, cursor) | PASS | slice pós-entrega S5 |
| S5.3.a (headers na resposta do import) | PASS | slice pós-entrega S5 |

### Fase C — Conciliação bancária v1 (spec adicional, 2026-07-07)

| AC | Resultado | Notas |
|---|---|---|
| C1.a [INV] ("1.234,56" → 123456 cêntimos; datas/saldo; período do import) | PASS | parser dedicado `centsFromBankAmount`, nunca parseFloat (A1) |
| C1.b [INV] (coluna única "-45,00" ≡ Débito=45,00 → mesmo amountCents) | PASS | |
| C1.c [INV] (linha repetida no ficheiro → 1 transação + aviso, nunca 500) | PASS | dedupHash unique (officeId) |
| C1.d [INV] (mesmo ficheiro 2× → 409; force → 0 duplicados) | PASS | |
| C1.e [INV] (extrato do office A invisível no office B; cross-tenant 404) | PASS | |
| C1.f [INV] (VIEWER não importa nem cria contas; lê via bank:read) | PASS | |
| C1.g [INV] (confirmação humana obrigatória; 2ª confirm → 409; heurística PT zero IA) | PASS | |
| C1.h (cabeçalhos crípticos → fallback IA + confirmação) | PASS | |
| C1.i (magic bytes 422; >10MB 413) | PASS | |
| C2.a [INV] (montante exato + NIF + 2 dias → score 95 EXATO; breakdown persistido; autoMatch; SUGGESTED; nunca conciliada sozinha) | PASS | asserção numérica ao ponto |
| C2.b [INV] (montante fora de tolerância → zero sugestões — eliminatório) | PASS | |
| C2.c (tolerância por office: 45 pontos dentro; 0 cêntimos elimina) | PASS | `Office.reconciliationToleranceCents` |
| C2.d [INV] (documento de outro cliente do mesmo office nunca é candidato) | PASS | |
| C2.e [INV] (conciliado / não-VALIDADO nunca é candidato) | PASS | |
| C2.f (débito↔recebidas, crédito↔emitidas — os dois lados testados) | PASS | |
| C2.g (nome 12, referência +15, buckets de data 15/5; 45–74 autoMatch=false) | PASS | |
| C2.h (máx 5 sugestões ordenadas; re-corrida idempotente) | PASS | |
| C2.i [INV] (multi-doc: somas que não fecham → 422 no ato de conciliar) | PASS | |
| C2.j (confirm do import corre o matching automaticamente) | PASS | |
| C3.a [INV] (aceitar sugestão persiste entry + audit + estados nos dois lados) | PASS | |
| C3.b [INV] (unreconcile reverte tudo, auditado) | PASS | |
| C3.c [INV] (2ª conciliação → 409; expectedVersion errada → 409 — A7) | PASS | |
| C3.d [INV] (multi-doc a fechar → 200 com N documentos; sem fechar → 422) | PASS | |
| C3.e [INV] (regra IGNORAR: IGNORED com referência à regra, zero sugestões; ignorar manual exige motivo) | PASS | |
| C3.f [INV] (transação conciliada nunca reaparece como candidata; documento idem) | PASS | |
| C3.g [INV] (VIEWER só lê; cross-tenant 404 em todas as ações) | PASS | |
| C3.h (regra SUGERIR_CLIENTE redireciona candidatos) | PASS | |

Fora de âmbito respeitado: sem PSD2/agregadores, sem matching IA, sem extratos PDF, sem lógica multi-moeda (campo existe), sem export contável dos movimentos.

Nenhum teste `[INV]` foi apagado, skipado ou enfraquecido.

### Fase P — Portal do cliente final v1 (spec adicional, 2026-07-07, branch `feature/client-portal-v1`)

| AC | Resultado | Notas |
|---|---|---|
| P1.a [INV] (convite CLIENT sem clientId → 422; clientId de outro office → 404; nada criado) | PASS | validação zod + verificação no serviço |
| P1.b [INV] (aceitação cria User com role CLIENT + clientId EXATOS do convite — anti-escalada) | PASS | role/clientId copiados SÓ da linha do convite |
| P1.c [INV] (matriz can(): CLIENT negado em TODAS as ações internas; portal:* exclusivo de CLIENT) | PASS | ações dedicadas `portal:document:read/upload` — ver decisões no PROGRESS |
| P1.d [INV] (loop parametrizado: CLIENT → 403/404 em 25 rotas internas, uma a uma) | PASS | emails, clients, invitations, documents, review, export, bank, supplier-rules, users, attachments |
| P1.e [INV] (regressão zero na matriz OWNER/ACCOUNTANT/VIEWER) | PASS | |
| P1.f [INV] (mudar role de/para CLIENT via /api/users → 409/422; role e clientId intactos) | PASS | |
| P1.g [INV] (constraints BD: role CLIENT ⇔ clientId, em User e Invitation) | PASS | CHECK constraints em SQL puro |
| P1.h (rate limiting CLIENT: API 30/min, upload 10/min, env-configurável) | PASS | |
| P2.a [INV] (DTO shape estrito — chaves exatas, nenhum campo interno, anti-spread) | PASS | protege contra leaks futuros |
| P2.b [INV] (masking: internos/flags → Em processamento; VALIDATED/EXPORTADO → Processado; rejeitado → Devolvido; DUPLICATE_SUSPECT nunca visível) | PASS | mapa deny-by-default |
| P2.c [INV] (âmbito: documentos de outro cliente/office nunca aparecem) | PASS | |
| P2.d [INV] (upload: clientId do body IGNORADO — documento fica no clientId do user; AuditLog com o user CLIENT) | PASS | source PORTAL_UPLOAD |
| P2.e [INV] (signed URL: só do próprio clientId, TTL 300s; de outro cliente → 404) | PASS | |
| P2.f (pipeline mantido: magic bytes/zip-bomb/limites iguais ao upload manual) | PASS | `intakeUploadedFiles` partilhado |
| P3.a [INV] (CLIENT → /dashboard redireciona /portal; internos → /portal redireciona dashboard) | PASS | `resolveAreaRedirect` nos dois layouts |
| P3.b [INV] (lista do portal renderiza estados públicos pt-PT, nunca strings internas) | PASS | teste de componente |
| P3.c [INV] (gestão de acessos: revogar apaga Sessions + audit; internos/outros clientes → 404; VIEWER/CLIENT negados) | PASS | |

Fora de âmbito respeitado: sem notificações ao cliente final, sem comentários, sem multi-cliente por user, sem chasing, sem download em massa, sem visibilidade financeira agregada.

Envs novas: `RATE_LIMIT_CLIENT_API_PER_MIN` (30), `RATE_LIMIT_CLIENT_UPLOAD_PER_MIN` (10).

Nenhum teste `[INV]` foi apagado, skipado ou enfraquecido.
