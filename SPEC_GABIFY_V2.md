# SPEC_GABIFY_V2.md — Gabify v2 (execução autónoma)

**Destinatário:** Claude Code (Fable), a correr na raiz do repo Gabify, branch de trabalho `feature/gabify-v2`.
**Modo:** execução contínua, fase a fase, sem checkpoints humanos. Cada fase só começa quando o gate da anterior passa.
**Stack:** a existente no repo — Next.js 16 + TypeScript, Prisma + PostgreSQL, BullMQ + Redis, Cloudflare R2, NextAuth (magic links via Resend), Claude API. **NÃO migrar de stack.** Não introduzir dependências de infraestrutura novas (sem novas bases de dados, sem novos brokers).
**Idioma de toda a UI:** pt-PT. **Toda a UI nova é mobile-first** (desenhar para ~380px primeiro, expandir depois).

---

## 0. REGRAS DE EXECUÇÃO (guard rails globais — violá-las = falhar a spec)

1. **Git:** trabalhar apenas em `feature/gabify-v2`. Commits atómicos por slice, mensagem `feat(S0.1): ...` / `fix(...)` / `test(...)`. **NUNCA fazer merge para `main` ou `staging`. NUNCA criar tags. NUNCA fazer push --force.**
2. **TDD nos invariantes de segurança:** para cada teste marcado 🔴RED nesta spec, escrever o teste PRIMEIRO, correr, **confirmar que falha**, registar a falha no `PROGRESS.md`, e só depois implementar. Sem exceções.
3. **Gate por fase:** criar na Fase 0 um script `npm run gate` que corre, por esta ordem: `tsc --noEmit` (0 erros em `src/`), `eslint src/` (0 erros), `vitest run` (0 falhas), `vitest run --coverage` com thresholds (ver regra 4). O gate tem de sair com exit code 0. **Se o mesmo gate falhar 3 tentativas consecutivas, PARAR, escrever `BLOCKED.md` com diagnóstico e estado, e não avançar.**
4. **Cobertura mínima (enforced no vitest config a partir do fim da Fase 1):** `src/queues/**` ≥ 80%, `src/app/api/**` ≥ 70%, `src/server/**` ≥ 75% (lines). Instalar `@vitest/coverage-v8` (está em falta — o script `test:coverage` existe mas não corre).
5. **AuditLog antes de qualquer ação externa** (envio de email, escrita em provider, export). AuditLog é imutável: **nunca** criar com `entityId: 'pending'` e atualizar depois — obter o id real primeiro ou criar o AuditLog após ter o id, mas sempre ANTES da ação externa disparar.
6. **JobLog em todos os workers** (início e fim com resultado), incluindo `document-parse` (hoje não escreve — corrigir).
7. **Fail-closed em tudo o que é segurança:** webhooks sem secret/assinatura → 401 sempre; env var de segurança em falta → o processo recusa arrancar (validação à entrada), nunca "aceita tudo".
8. **Paginação obrigatória** em todos os list endpoints: default 50, máximo 200, cursor ou offset consistente.
9. **Zero imports de `src/lib/mock-data.ts` em código de produção** a partir do fim da Fase 1 (verificado por teste de arquitetura — ver S1.6).
10. **Multi-tenancy:** toda a query de dados filtra por `officeId` da sessão; acesso cross-tenant devolve **404, nunca 403**. Toda a tabela nova tem `officeId` (direto ou via relação obrigatória com constraint).
11. **Segredos:** nunca hardcoded, nunca logados. Atualizar `.env.example` sempre que uma env var for adicionada/renomeada (está errado hoje: documenta `AZURE_AD_*`, o código lê `MICROSOFT_*` — corrigir na Fase 1).
12. **Progresso:** manter `PROGRESS.md` na raiz — uma linha por slice: estado (DONE/BLOCKED), testes RED confirmados, resultado do gate.
13. **Prioridade em caso de tempo/contexto limitado:** as fases estão por ordem de valor. É preferível entregar Fases 0–3 impecáveis do que Fases 0–5 a meio. Nunca saltar a Fase 0.

---

## 1. CONTEXTO (autocontido — o que precisas de saber do estado atual)

O repo tem ~12.9k LOC. O que funciona: sync de email Outlook/Gmail (polling 30s), pipeline de parsing de documentos com cascata de classificação (filename SAF-T → QR fiscal AT → Claude Vision → Claude PDF → Claude texto), schema Prisma sólido (multi-tenant `officeId`, soft deletes, modelos `EmailReview`/`DocumentReview`/`Session`/`Invitation`-like já previstos ou fáceis de adicionar), encriptação AES-256-CBC de tokens, R2 com signed URLs, OAuth flows corretos.

**Defeitos críticos conhecidos (confirmados por auditoria, com localizações):**
- `src/lib/auth-adapter.ts:23-33` — qualquer signup por magic link é associado ao **primeiro Office da BD**. Breach multi-tenant.
- `src/lib/dashboard-store.tsx` + `src/components/dashboard/email-detail.tsx:35-51` — aprovar/rejeitar drafts vive em `sessionStorage`; nenhuma API, nenhum `EmailReview`, nenhum envio real.
- `src/server/email-providers/OutlookProvider.ts:291-361` — `upsertMessage` nunca cria `EmailAttachment`; anexos Outlook nunca entram no pipeline.
- RBAC ausente: `UserRole` existe e nunca é verificado em rota nenhuma.
- Webhooks fail-open: `src/app/api/webhooks/graph/route.ts:43` (só verifica `clientState` se env var existir) e `gmail/route.ts:27` (só verifica JWT se header vier).
- `watchChanges` implementado nos dois providers e nunca invocado; `outlookSubscriptionId`/`gmailWatchExpiry` nunca preenchidos.
- Race em `document-parse.worker.ts:241-245`: dois jobs concorrentes podem criar dois drafts (falta unique constraint).
- `at-fiscal-qr.ts` já parseia IVA por taxa (campos I1–K4) e o sistema **descarta** — só usa total/NIF/data.
- Extração limitada a 3 campos (data, total, NIF emitente). Sem fornecedor, nº documento, linhas, IVA por taxa.
- `mock-data.ts` é dependência de produção (worker importa `DOCUMENT_TYPE_LABELS`; `document-table.tsx:92` renderiza `MOCK_CLIENTS`).
- Sessões: `strategy: 'jwt'` congela role/officeId 24h; modelo `Session` da BD existe e não é usado.
- Sem rate limiting, sem paginação, coverage não medível, workers/webhooks/OAuth com 0 testes.
- Lixo: ficheiro `console.log(j.id` na raiz, `.claude/worktrees/` abandonadas, `scripts/debug-*` com erros de tsc.

**Referência de produto (paridade Kabilio, adaptada a PT):** o alvo comercial é uma camada pré-contabilística: ingestão multi-canal → extração rica → classificação → revisão humana → export estruturado. Diferenciadores a construir sobre o Kabilio: regras por fornecedor explícitas, deteção de duplicados e de empresa errada, split de PDFs multi-fatura, e export utilizável sem integração API (ZIP + CSV de lançamentos).

---

## 2. FASE 0 — DISQUALIFICANTES DE SEGURANÇA (bloqueia tudo o resto)

### S0.1 — Onboarding fechado com convites
**Objetivo:** eliminar o first-office attach; entrada só por convite.

Implementação:
- Novo modelo `Invitation`: `id, officeId, email (lowercase, unique parcial com pending), role (UserRole), tokenHash (SHA-256 do token; token em claro só no email), expiresAt (72h), acceptedAt?, invitedByUserId, createdAt`. Índice `(officeId, email)`.
- Rotas: `POST /api/invitations` (cria + envia email via Resend com link `/(auth)/accept-invite?token=...`), `GET /api/invitations` (lista, paginada), `DELETE /api/invitations/[id]` (revoga se pendente). Apenas OWNER (verificação inline por agora; migra para `can()` em S1.1).
- Reescrever `GabifyAdapter.createUser`: só cria `User` se existir `Invitation` pendente, não expirada, para esse email (case-insensitive); aplica `officeId` e `role` do convite; marca `acceptedAt`; AuditLog `INVITATION_ACCEPTED`. Magic link pedido para email sem user e sem convite: **não cria user**, resposta genérica idêntica à de sucesso (não revelar existência de contas).
- Bootstrap do primeiro Office/OWNER: script `npm run seed:bootstrap` que chama serviços (não SQL direto), idempotente, lê `BOOTSTRAP_OWNER_EMAIL` do env. Remover completamente o hack do adapter.

🔴RED (escrever primeiro, confirmar falha):
1. Signup por magic link sem convite → user NÃO é criado, nenhum Office é associado.
2. Convite expirado → rejeitado; `acceptedAt` permanece null.
3. Convite para `a@x.pt` não serve para `b@x.pt`.
4. Token de convite não é reutilizável após aceite.
5. User criado herda exatamente `officeId` e `role` do convite.
6. VIEWER/ACCOUNTANT não conseguem criar convites (403 → será 404/permission após S1.1; por agora 403 é aceitável NESTA rota apenas).

Acceptance: os 6 testes acima verdes; `seed:bootstrap` corre duas vezes sem duplicar; `npm run gate` verde.

### S0.2 — Anexos Outlook
**Objetivo:** o canal prioritário passa a processar documentos.

Implementação:
- Em `OutlookProvider.upsertMessage`: quando `hasAttachments`, chamar `GET /messages/{id}/attachments` (Graph), filtrar `#microsoft.graph.fileAttachment` (ignorar inline `isInline=true` e `itemAttachment`), criar `EmailAttachment` com metadata (name, contentType, size, providerAttachmentId) em paridade com o que `GmailProvider.ts:444-468` já faz. Download do conteúdo permanece responsabilidade do worker de parse (comportamento atual do Gmail — manter simetria).
- Adicionar método ao provider para download de um attachment por id (se não existir), usado pelo worker.

🔴RED:
1. Fixture de delta query Graph com `hasAttachments: true` → `EmailAttachment` criados com metadata correta.
2. Attachment inline → NÃO cria registo.
3. Mensagem sem anexos → zero chamadas ao endpoint de attachments.
4. E2E (mocks Graph): mensagem Outlook com PDF → attachment persistido → job `document-parse` enfileirado.

Acceptance: 4 testes verdes; gate verde.

### S0.3 — Loop de aprovação real (server-side)
**Objetivo:** substituir o sessionStorage por persistência, auditoria e envio real.

Implementação:
- Rotas: `POST /api/emails/[emailId]/actions/[actionId]/approve` (body opcional `{ editedBody }`) e `.../reject` (body opcional `{ reason }`). Scope por `officeId` (404 no miss).
- Fluxo approve: validar estado (só `PENDING_REVIEW` ou equivalente atual) → criar `EmailReview` (decision, reviewedByUserId, editedBody?, timestamps) → AuditLog `DRAFT_APPROVED` → `provider.sendReply(...)` com o corpo final → atualizar estado para `SENT` (ou `SEND_FAILED` com erro persistido e retry manual possível). Reject: `EmailReview` + AuditLog `DRAFT_REJECTED` + estado `REJECTED`.
- Idempotência: unique constraint `EmailReview(emailActionId)`; segunda aprovação → 409.
- Falha no envio: `EmailReview` e AuditLog permanecem; estado `SEND_FAILED`; endpoint `POST .../retry-send` reusa o corpo aprovado.
- UI: remover `dashboard-store.tsx` (sessionStorage) por completo; `email-detail.tsx` chama as APIs; estado vem do servidor (server components / revalidate). Botões com estados loading/erro. Mobile-first.

🔴RED:
1. Approve persiste `EmailReview` + AuditLog e invoca `sendReply` exatamente uma vez (mock provider).
2. Segunda aprovação do mesmo action → 409, `sendReply` não é chamado.
3. Reject nunca chama `sendReply`.
4. Approve de action de outro office → 404, nada persistido.
5. `sendReply` a falhar → estado `SEND_FAILED`, review/audit persistidos, retry funciona.
6. AuditLog criado ANTES do `sendReply` (ordem verificável no teste por spy/sequence).
7. Grep de arquitetura: `sessionStorage` não aparece em `src/` (exceto testes).

Acceptance: 7 testes verdes; gate verde. **Fim da Fase 0: `npm run gate` verde + PROGRESS.md atualizado.**

---

## 3. FASE 1 — FUNDAÇÕES

### S1.1 — RBAC `can()` com DENY-precedence
- Criar `src/server/authz/can.ts`: `can(session, action, resource?) → boolean`, mapa central de permissões, **DENY por omissão** (ação não mapeada = negada). Ações mínimas: `client:read|create|update|delete`, `email:read`, `draft:approve|reject`, `document:read|review|upload`, `invitation:manage`, `export:run`, `settings:manage`, `emailAccount:connect`.
- Matriz: OWNER = tudo; ACCOUNTANT = tudo exceto `invitation:manage` e `settings:manage`; VIEWER = apenas `*:read`.
- Aplicar em TODAS as rotas de `src/app/api/**`. Falha de permissão em recurso identificável → **404**; em ação global (ex: criar convite) → 403.
🔴RED: teste-matriz parametrizado (3 roles × todas as ações × esperado) + VIEWER a tentar `POST /api/clients` → sem escrita na BD. Teste de arquitetura: toda a rota em `src/app/api` (exceto webhooks/auth/health) invoca `can()` (verificar por análise estática simples — grep/AST no teste).

### S1.2 — Sessões database
- `session: { strategy: 'database' }` (modelo `Session` já existe). `officeId`/`role` resolvidos da BD por request (callback), não congelados. Logout revoga (delete session). Expiração 24h com rolling.
🔴RED: mudar role de user na BD reflete-se no request seguinte sem re-login; sessão apagada → 401.

### S1.3 — Webhooks ligados e fail-closed
- Invocar `watchChanges` no fim dos dois callbacks OAuth; persistir `outlookSubscriptionId`/`gmailWatchExpiry`; worker de renovação (BullMQ repeatable, diário) renova subscrições a expirar em <48h.
- Fail-closed: arranque valida `GRAPH_WEBHOOK_SECRET` e config Gmail (falta → crash com mensagem clara); webhook Graph sem/errado `clientState` → 401; webhook Gmail sem header `Authorization` ou JWT inválido → 401. Manter polling como fallback com intervalo subido para 5 min quando a conta tem webhook ativo.
🔴RED: POST no webhook Graph sem clientState → 401 e nada enfileirado; idem Gmail sem Authorization; callback OAuth cria subscrição (mock) e persiste id.

### S1.4 — Rate limiting
- Middleware simples (janela deslizante em memória por instância é aceitável; chave: IP + rota para anónimo, userId + rota para autenticado). Limites: auth/magic-link 5/15min por email+IP; webhooks 120/min; APIs gerais 100/min; upload 20/min. 429 com `Retry-After`.
🔴RED: exceder limite no magic-link → 429; abaixo do limite → 200.

### S1.5 — Paginação
- Todos os `findMany` em rotas list: `take` default 50, max 200, `cursor` por id, resposta `{ items, nextCursor }`.
🔴RED: `clients` com 60 registos → 50 + nextCursor; `?limit=500` → clamp a 200.

### S1.6 — Purga do mock-data
- Mover `DOCUMENT_TYPE_LABELS` e tipos para `src/lib/document-types.ts`; substituir tipos `MockEmail`/`MockDocument` por DTOs reais (`src/server/dto/`); remover `MOCK_CLIENTS` do `document-table.tsx` (popular com clientes reais do office); `mock-data.ts` passa a ser importado apenas por testes/fixtures.
🔴RED (teste de arquitetura): nenhum ficheiro fora de `**/*.test.*`/`tests/` importa `mock-data`.

### S1.7 — Higiene e dívida
- Instalar `@vitest/coverage-v8`; ativar thresholds da regra global 4.
- Unique constraint para a race do draft: `EmailAction(inboundEmailId, type)` (ou equivalente no schema atual) + tratamento de conflito no worker (segundo job deteta e sai limpo).
- `document-parse` escreve JobLog (start/end/resultado/erro).
- Corrigir `.env.example` (MICROSOFT_*, GMAIL_WEBHOOK_URL, EMAIL_POLL_INTERVAL_MS, GRAPH_WEBHOOK_SECRET, BOOTSTRAP_OWNER_EMAIL, e todas as novas).
- Apagar: ficheiro `console.log(j.id`, `.claude/worktrees/`, scripts de debug com erros (ou movê-los para `scripts/_attic/` fora do tsconfig/lint).
- Testes em falta críticos: os dois workers (caminhos felizes + erro + idempotência), 4 rotas OAuth (state CSRF válido/ inválido), `qr-reader` smoke, `auth-adapter` (já coberto por S0.1).
- `parsePtDate`: normalizar para meio-dia UTC ou date-only para eliminar o bug latente de fuso; teste com "31-12-2025".

Acceptance Fase 1: tudo acima verde; `vitest run --coverage` cumpre thresholds; gate verde.

---

## 4. FASE 2 — INGESTÃO COMPLETA E EXTRAÇÃO RICA

### S2.1 — Upload manual (web + mobile)
- `POST /api/documents/upload` (multipart; PDF/JPG/PNG/XML; max 25MB; até 10 ficheiros por request): valida tipo por magic bytes (não só extensão), grava em R2 (key namespaced por office), cria `Document` origem `MANUAL_UPLOAD` (novo enum em `DocumentSource`: EMAIL | MANUAL_UPLOAD | IMPORT), enfileira `document-parse` com o mesmo payload que o caminho de email usa (o worker já é agnóstico a partir do buffer — reutilizar, não duplicar).
- UI: página de documentos com drag&drop + botão; em mobile, `<input type="file" accept="image/*,application/pdf" capture="environment">` para foto direta. Progresso por ficheiro, erros por ficheiro. Seleção obrigatória de cliente (dropdown de clientes reais) ou "por classificar". Mobile-first.
🔴RED: upload de PNG com extensão .pdf → 422; ficheiro válido → Document criado + job enfileirado; upload para office de outro user → impossível por construção (officeId da sessão); VIEWER → sem permissão (`can()`).

### S2.2 — Split de PDFs multi-fatura
- No worker de parse, ANTES da cascata: se PDF tem >1 página, correr deteção de fronteiras — heurística primeiro (QR AT distintos por página; cabeçalhos "Fatura/Invoice" repetidos; NIFs emitentes distintos), fallback Claude (prompt: devolve JSON `[{startPage,endPage}]`). Se >1 fatura: criar N `Document` filhos (relação `parentDocumentId`), cada um com o PDF recortado (pdf-lib), enfileirar parse individual; o pai fica `SPLIT` e fora das listagens default.
🔴RED: fixture PDF com 3 faturas (gerar nas fixtures com 3 QRs AT distintos) → 3 filhos + pai SPLIT; PDF de fatura única multi-página → NÃO é dividido.

### S2.3 — Extração rica
- Alargar `Document`: `supplierName, supplierNif, documentNumber, issueDate, dueDate?, currency (default EUR), totalAmount, netAmount?, vatBreakdown Json` (`[{rate, base, amount}]`), `withholdingAmount?`, `documentLines Json?` (`[{description, qty, unitPrice, vatRate, total}]` — best effort, nullable), `buyerNif?`.
- **QR AT primeiro:** `at-fiscal-qr.ts` já parseia I1–K4 (bases e IVA por taxa), F (data), G (nº doc), A/B (NIFs) — mapear TUDO para os campos novos. Quando o QR existe, `vatBreakdown`/totais vêm do QR (autoritativo, custo IA zero) e a IA só complementa (fornecedor por extenso, linhas).
- Prompts Claude (Vision/PDF/texto) atualizados para devolver o JSON completo com schema estrito; validação com zod; campos em falta ficam null (nunca inventar).
- Retenção na fonte: detetar menções de retenção IRS/IRC e preencher `withholdingAmount`.
🔴RED: fatura com QR AT (fixture real do parser) → vatBreakdown por taxa correto SEM chamada à IA para esses campos (verificar por mock: cliente Claude não recebe pedido de extração de totais quando QR presente); resposta IA com campo inventado fora do schema → rejeitada por zod e documento fica NEEDS_REVIEW.

### S2.4 — Import Excel/CSV
- `POST /api/documents/import` (xlsx/csv): parse com a lib `xlsx` já presente; mapeamento de colunas assistido por IA (amostra de 5 linhas → mapping proposto → utilizador confirma na UI antes de importar); campos mínimos: data, nº doc, NIF, base, taxa IVA, total. Cada linha vira `Document` origem `IMPORT` já com campos preenchidos (sem parse IA), estado direto para revisão. Erros linha a linha em relatório descarregável.
🔴RED: ficheiro com linha inválida (NIF malformado) → restantes importadas, relatório contém a linha e o motivo; nenhuma chamada de parsing IA para documentos IMPORT.

### S2.5 — Duplicados e empresa errada
- Duplicado: no fim do parse, procurar `Document` do mesmo office com igual `(supplierNif, documentNumber)` ou `(supplierNif, issueDate, totalAmount)` → flag `duplicateOfId`, estado `DUPLICATE_SUSPECT`, aparece na fila de revisão com comparação lado-a-lado (aceitar como duplicado = arquivar; rejeitar = limpar flag).
- Empresa errada: se `buyerNif` extraído existe e ≠ NIF do cliente associado → flag `WRONG_CLIENT_SUSPECT` + ação de reassociar (individual; bulk é v2).
🔴RED: segundo parse de fatura igual → DUPLICATE_SUSPECT com `duplicateOfId` correto; buyerNif de outro cliente do mesmo office → sugestão de reassociação para esse cliente.

### S2.6 — Endereço de ingestão por cliente
- Tabela `ClientIngestAlias (officeId, clientId, alias unique)`; gerar alias tipo `{slug-cliente}-{6 hex}`. No sync de email, se o destinatário (To/CC) contém `{alias}@{INGEST_DOMAIN}` (env var), associar automaticamente ao cliente correspondente antes do client-matching normal. UI: mostrar/copiar o endereço na ficha do cliente, regenerar alias. (Infra de mailbox catch-all é responsabilidade de deploy — a spec cobre o routing lógico; documentar no README a config necessária.)
🔴RED: email recebido com To = alias do cliente X → `InboundEmail` associado a X mesmo que o remetente seja desconhecido; alias de outro office → não associa.

Acceptance Fase 2: tudo verde, gate verde, e um teste E2E integrador: upload manual de PDF com QR AT → parse → campos ricos preenchidos → aparece na fila de revisão.

---

## 5. FASE 3 — REVISÃO E SAÍDA VENDÁVEL

### S3.1 — Fila de revisão de documentos real
- Estados do documento (adaptar enum existente): `A_REVER → PRE_VALIDADO → VALIDADO → EXPORTADO` (+ `DUPLICATE_SUSPECT`, `WRONG_CLIENT_SUSPECT`, `SPLIT` laterais). Thresholds existentes (0.85/0.60) mapeiam confiança → `PRE_VALIDADO`/`A_REVER`.
- Rotas: `POST /api/documents/[id]/review` (body: correções de campos tipados + decisão `validate|correct|reject`), cria `DocumentReview` (before/after em Json, reviewedBy) + AuditLog. Documento `VALIDADO` fica imutável exceto por nova review explícita (que gera novo DocumentReview — historial completo).
- UI: fila com filtros (estado, cliente, período), detalhe com preview do ficheiro (signed URL) lado a lado com os campos editáveis, ações validar/corrigir/rejeitar, bulk validate de PRE_VALIDADOS. Mobile-first (em mobile: preview colapsável acima dos campos).
🔴RED: corrigir campo persiste before/after no DocumentReview; VALIDADO recusa PATCH direto de campos; validar sem permissão (`document:review`) → 404/negado; bulk validate só toca em PRE_VALIDADOS do office.

### S3.2 — Regras por fornecedor (diferenciador vs Kabilio)
- Modelo `SupplierRule (officeId, clientId?, supplierNif, defaultDocumentType?, defaultAccountCode?, defaultVatTreatment?, autoValidate bool default false, createdFromReviewId?, active bool)`. Regra com `clientId` null aplica-se a todos os clientes do office; a mais específica ganha.
- Aplicação: no fim do parse, se existe regra ativa para o `supplierNif` → aplicar defaults; se `autoValidate` e confiança ≥ 0.85 e sem flags (duplicado/empresa errada) → `PRE_VALIDADO` direto com anotação "por regra".
- Aprendizagem: quando uma review corrige o mesmo campo do mesmo fornecedor pela 2ª vez, a UI propõe criar a regra (um clique). Nunca criar regras silenciosamente.
🔴RED: documento de fornecedor com regra → defaults aplicados; `autoValidate` NUNCA salta a fila quando há flag de duplicado; regra de office A não afeta office B.

### S3.3 — Export ZIP + CSV de lançamentos
- Job assíncrono `export` (BullMQ): input = office + filtro (cliente(s), período, só VALIDADOS ainda não exportados ou re-export explícito). Output em R2: ZIP com estrutura `Cliente/{Ano}/{Mês}/{Tipo}/{nºdoc}-{fornecedor}.pdf` + `lancamentos.csv` na raiz (UTF-8 BOM, separador `;` — Excel PT): colunas `data;tipo_documento;numero;fornecedor;nif_fornecedor;cliente;conta_sugerida;descricao;base_isenta;base_6;iva_6;base_13;iva_13;base_23;iva_23;retencao;total;moeda;ficheiro`. Também gerar `.xlsx` equivalente (lib `xlsx`).
- Marca documentos como `EXPORTADO` com `exportBatchId`; AuditLog do batch ANTES de disponibilizar o download; download via signed URL 15 min; histórico de exports com quem/quando/filtros.
🔴RED: export inclui apenas VALIDADOS do filtro; CSV abre com totais por taxa corretos contra fixtures conhecidas (asserção numérica exata); re-correr o mesmo export sem "re-export" → 0 documentos; documento exportado fica EXPORTADO.

### S3.4 — Classificação SNC v1 (sugestão, nunca decisão)
- Seed (via service) da taxonomia SNC mínima: contas 62x (FSE detalhado: 6221 trabalhos especializados, 6222 publicidade, 6223 vigilância, 6224 honorários, 6226 conservação, 6231/6232 ferramentas/livros, 6241/6242/6248 energia/água/outros, 6251/6252 deslocações, 6261 rendas, 6262 comunicação, 6263 seguros, 6267 limpeza, 6268 outros), 31x compras, 43x/45x ativos, 6811 impostos, 63x pessoal (fora de âmbito de sugestão automática — nunca sugerir), 21x/22x terceiros, 2432x IVA dedutível por taxa.
- Sugestão: prompt Claude com (fornecedor, descrição/linhas, tipo doc, histórico de contas usadas para este fornecedor via SupplierRule/reviews) → `{accountCode, vatTreatment: DEDUTIVEL_TOTAL|NAO_DEDUTIVEL|AUTOLIQUIDACAO|ISENTO, confidence}` validado por zod contra a taxonomia (código fora da lista → descartado). Guardar como `suggestedAccountCode`/`suggestedVatTreatment` no documento; a conta só se torna definitiva por review humana ou SupplierRule. **Nunca auto-validar com base apenas na sugestão IA.**
🔴RED: sugestão com conta inexistente na taxonomia → descartada e documento segue sem sugestão; sugestão nunca transita documento de estado por si só; fornecedor com regra → regra ganha à IA.

Acceptance Fase 3: E2E completo com mocks externos: email com PDF (QR AT) → parse rico → regra de fornecedor aplica conta → fila de revisão → validar → export → ZIP contém o PDF no caminho certo e o CSV tem o lançamento com os valores do QR. Gate verde.

---

## 6. FASE 4 — POLIMENTO DE PRODUTO (executar só com Fases 0–3 verdes)

- **S4.1 Dashboard operacional:** contadores reais por estado (a rever, pré-validados, duplicados suspeitos, por exportar) por cliente e agregado; substitui o overview atual. Mobile-first.
- **S4.2 Notificações de documentos em falta (chasing v1):** por cliente, marcar periodicidade esperada (mensal); job semanal identifica clientes sem documentos no período e gera rascunho de email de lembrete (usa o pipeline de drafts existente — passa pela mesma aprovação humana de S0.3, nunca envia sozinho).
- **S4.3 Onboarding de equipa:** página de convites (S0.1) com estados enviado/aceite/expirado + reenviar.
- **S4.4 Settings por office:** domínio de ingestão, defaults de exportação, gestão de SupplierRules (CRUD com `can()`).
🔴RED por slice: mínimo 2 testes por rota nova + 1 de permissão. Acceptance: gate verde.

---

## 7. FORA DE ÂMBITO (NÃO implementar, NÃO começar)

- Integrações API com TOConline/Cegid/Sage/Moloni (deixar apenas a interface `ExportTarget` com a implementação `FileExportTarget` de S3.3 — mais nada).
- Parser/validação CIUS-PT / UBL, faturação eletrónica própria, conciliação bancária/PSD2, portal do cliente final, WhatsApp, app nativa, agente conversacional de queries, IMAP provider, migração da fila para PostgreSQL, migração de stack.
- Qualquer merge, tag, deploy ou alteração de CI/CD.

---

## 8. ENCERRAMENTO DA EXECUÇÃO

No fim (ou ao esgotar capacidade): garantir `npm run gate` verde no último estado estável; `PROGRESS.md` completo; `HANDOFF.md` na raiz com: fases/slices concluídos, decisões tomadas onde a spec dava latitude, dívidas conscientes deixadas, e instruções de arranque (envs novas, seeds, config do domínio de ingestão). Commit final `chore: handoff gabify-v2`. **Não fazer merge.**
