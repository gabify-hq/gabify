# RELEASE_NOTES_V2.md — Gabify v2

Execução autónoma da SPEC_GABIFY_V2 (+ ADDENDUM) na branch `feature/gabify-v2`.
Estado final: **Fases 0–3 completas + slice de UI + slice S5 (insuficiências de API fechadas), gate verde (302 testes, thresholds de cobertura enforced)**. Fase 4 não executada (regra 13 — ver HANDOFF.md).

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

Nenhum teste `[INV]` foi apagado, skipado ou enfraquecido.
