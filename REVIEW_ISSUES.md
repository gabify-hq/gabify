# REVIEW_ISSUES.md — Auditoria de engenharia (read-only)

**Data:** 07/07/2026 · **Branch:** `staging` @ `c4a3297` · **Método:** leitura integral do código crítico (V1: sync de email, parsing, copiloto; V2: revisão, banco, export, portal, fontes), navegação da app com `seed:demo`, chamadas reais às APIs locais. Nada foi corrigido — este documento é o output.

Convenções de severidade: **CRÍTICO** = perda de dados, quebra de segurança ou produto inoperável; **ALTO** = bug que morde um cliente real no primeiro mês; **MÉDIO** = custo de manutenção/correção latente; **BAIXO** = higiene.

> **Registo vivo (08/07/2026):** os itens marcados ✅ foram corrigidos no branch
> `feature/audit-fixes` (slice pós-auditoria, TDD RED→GREEN, gate verde por fase) — a
> referência entre parêntesis é o commit. Itens não marcados: transcritos para
> [BACKLOG.md](BACKLOG.md) para triagem humana.

---

## CRÍTICO

### C-1 — Convites apontam para uma página que não existe (`/accept-invite` → 404) ✅ corrigido (ca11fd9)
- **Localização:** `src/server/services/invitation-service.ts:52` (gera o link), `src/proxy.ts:25` (rota tratada como pública), `src/app/` (não existe `accept-invite/`)
- **Problema:** Todos os emails de convite (equipa **e** portal do cliente) contêm `/accept-invite?token=...`. A rota nunca foi implementada — devolve o 404 genérico do Next, **em inglês**. `validateInvitationToken()` existe no serviço e nunca é chamado por rota nenhuma.
- **Cenário:** Edgar convida a primeira contabilista real. Ela clica no link do email e recebe "404 — This page could not be found". Fim da adoção. Verificado ao vivo: `GET /accept-invite?token=abc → 404`.
- **Correção sugerida:** Criar a página `/accept-invite` que valida o token e encaminha para o fluxo de magic link com o email pré-preenchido — ou mudar o link do email para `/login?email=...` e eliminar o token morto.

### C-2 — Páginas "Documentos" e detalhe de cliente só mostram documentos vindos de email ✅ corrigido (dec7331)
- **Localização:** `src/app/(dashboard)/documents/page.tsx:23-31`, `src/app/(dashboard)/clients/[clientId]/page.tsx:81-101`
- **Problema:** Ambas filtram `attachment: { inboundEmail: { emailAccount: { officeId } } }` — relíquia do V1 em que todos os documentos vinham de anexos. Documentos `MANUAL_UPLOAD`, `PORTAL_UPLOAD`, `IMPORT`, `API_PULL` e os do seed **não têm attachment** e ficam invisíveis. Pior: o mapeamento de estado no detalhe de cliente colapsa `VALIDATED`/`PRE_VALIDATED`/`EXPORTED` em `NEEDS_REVIEW` (linhas 106-109), inflacionando "Para rever".
- **Cenário:** Verificado ao vivo com o seed: Silva & Costa tem ~19 documentos na BD; a página do cliente mostra "Documentos 0 · Nenhum documento recebido ainda". Um upload feito **na própria página Documentos** nunca aparece na lista dessa página.
- **Correção sugerida:** Trocar o filtro para `officeId` direto no `Document` (como já faz `/api/documents`) e mapear os estados reais; unificar as duas páginas sobre o mesmo DTO da fila de revisão.

### C-3 — Exportação organizada não tem UI nenhuma ✅ corrigido (e42bbf6)
- **Localização:** `src/server/services/export-service.ts` (completo, com testes de serviço), `src/app/api/exports/route.ts` (existe), componentes: **zero** chamadas a `/api/exports`
- **Problema:** A funcionalidade "fim do mês → ZIP Cliente/Ano/Mês/Tipo + lancamentos.csv" — a promessa central do produto — só é acionável via `curl`. Nenhum botão, página ou dialog a invoca.
- **Cenário:** Fim do mês do primeiro cliente real: não há forma na aplicação de exportar seja o que for.
- **Correção sugerida:** Página ou dialog "Exportar" (cliente(s) + período) que chama `POST /api/exports` e apresenta o link de download de `GET /api/exports/[batchId]/download`.

### C-4 — Gmail: sync incremental ignora `nextPageToken` → emails perdidos em silêncio ✅ corrigido (842e29b)
- **Localização:** `src/server/email-providers/GmailProvider.ts:119-146`
- **Problema:** O caminho incremental faz **um único** request a `/history` e nunca segue `historyData.nextPageToken` (o campo até está no tipo `GmailHistoryResponse:46`). A seguir persiste `historyData.historyId` (o mais recente), pelo que as mensagens das páginas seguintes nunca mais são apanhadas. O sync inicial também se limita a 50 mensagens sem paginação.
- **Cenário:** Gabinete com inbox movimentada fica 2 dias sem sync (worker em baixo). No arranque, o history tem >100 entradas → só a primeira página é processada, o cursor avança, e as faturas das restantes páginas **desaparecem sem erro, sem log, sem retry**.
- **Correção sugerida:** Loop `while (nextPageToken)` no caminho incremental (e paginação no sync inicial); só persistir o `historyId` final depois de consumir todas as páginas.

### C-5 — Gmail: `historyId` expirado bloqueia a conta para sempre ✅ corrigido (842e29b)
- **Localização:** `src/server/email-providers/GmailProvider.ts:119-127`
- **Problema:** A Gmail API devolve **404** quando `startHistoryId` é demasiado antigo (retenção típica ~1 semana). O código trata qualquer não-2xx como exceção e o job falha; no retry falha igual — não existe fallback para full sync nem limpeza do cursor.
- **Cenário:** Conta Gmail parada durante férias de agosto. Em setembro, todos os syncs falham 3× e morrem. Sem alerta (ver A-5), a conta parece "ligada" nas Definições enquanto não entra um único email.
- **Correção sugerida:** Capturar 404 do `/history`, limpar `historyId` e reexecutar o ramo de sync inicial (com paginação, cf. C-4).

---

## ALTO

### A-1 — Export CSV sem escaping: `;` num campo desalinha o `lancamentos.csv` ✅ corrigido (4fd1e40)
- **Localização:** `src/server/services/export-service.ts:144-164`
- **Problema:** As linhas são montadas com `join(';')` sem qualquer quoting. `supplierName`, `clientName` e sobretudo `reasoning` (texto livre gerado por IA, usado como coluna `descricao`) podem conter `;`, aspas ou quebras de linha.
- **Cenário:** Fornecedor "Silva; Costa & Filhos, Lda" → todas as colunas monetárias dessa linha deslocam-se uma posição. A contabilista importa o CSV no software e lança valores nas contas erradas.
- **Correção sugerida:** Quoting RFC 4180 (envolver em aspas e duplicar aspas internas) em todos os campos de texto; idem no `resumo_iva.csv`.

### A-2 — Export perde dinheiro para taxas fora de {0, 6, 13, 23} ✅ corrigido (4fd1e40)
- **Localização:** `src/server/services/export-service.ts:17-18, 134-143` vs `src/app/api/documents/[documentId]/review/route.ts:8-24`
- **Problema:** A revisão **valida e aceita** taxas dos Açores (4/9/16) e Madeira (5/12/22), mas o CSV/XLSX só tem colunas `base_6/13/23/isenta`. Uma banda a 16% emite uma linha com **todas as colunas de base/IVA a zero** (só o total na última linha da fatura). O `resumo_iva.csv` inclui a taxa (mapa por rate), tornando os dois ficheiros incoerentes entre si.
- **Cenário:** Cliente com fornecedor açoriano; fatura validada com IVA a 16%. No export, a base e o IVA dessa banda evaporam-se do `lancamentos.csv` — descoberto (na melhor das hipóteses) na reconciliação do IVA trimestral.
- **Correção sugerida:** Colunas dinâmicas por (região, taxa) ou colunas fixas para todas as taxas válidas de `VALID_VAT_RATES`; teste que garante Σ colunas = totais.

### A-3 — Race no refresh de tokens OAuth pode invalidar a conta ✅ corrigido (842e29b)
- **Localização:** `src/server/email-providers/OutlookProvider.ts:238-299`, `GmailProvider.ts:294-353`; agravado por `src/queues/email-sync.worker.ts:28` (concurrency 5) e A-4
- **Problema:** `refreshTokenIfNeeded()` é read-then-write sem lock. Dois jobs da mesma conta (webhook + poll agendado) podem refrescar em simultâneo; com rotação de refresh tokens (Microsoft roda sempre; Google por vezes), o perdedor grava um refresh token **já consumido** por cima do novo.
- **Cenário:** Pico de emails → webhook e poll disparam juntos → duplo refresh → `invalid_grant` em todos os syncs seguintes. A conta exige re-autenticação manual e ninguém é notificado (A-5).
- **Correção sugerida:** Lock distribuído por conta (Redis `SET NX PX`) à volta do refresh, ou transição condicional na BD (`updateMany where tokenExpiry = <lido>`), reaproveitando o padrão A7 que o resto do código já usa.

### A-4 — Jobs de sync da mesma conta correm em paralelo (sem dedupe real)
- **Localização:** `src/app/api/webhooks/graph/route.ts:91` (`jobId: sync-${id}-${Date.now()}` — dedupe inútil), `src/queues/email-sync.worker.ts:91-97` (scheduler adiciona sem jobId)
- **Problema:** Nada impede N jobs simultâneos para a mesma conta. O upsert de mensagens aguenta, mas: (1) alimenta a race de tokens A-3; (2) o find-then-create de `EmailThread` (`OutlookProvider.ts:331-354`, Gmail idem) não tem unique `(officeId, providerThreadId)` no schema → threads duplicadas; (3) delta/history cursors gravados fora de ordem.
- **Cenário:** Graph envia 3 notificações num minuto + tick do poll → 4 syncs concorrentes da mesma inbox → threads duplicadas e cursor recuado.
- **Correção sugerida:** `jobId: sync-${accountId}` estável (BullMQ deduplica jobs pendentes) ou lock por conta no processor; adicionar `@@unique([officeId, providerThreadId])` a `EmailThread`.

### A-5 — Zero visibilidade operacional: falhas às 3h da manhã não chegam a ninguém
- **Localização:** transversal — `src/queues/*.worker.ts` (só `console.error`), `JobLog` (escrito mas **nenhuma** rota/página o lê: grep de `jobLog` em `src/app` → 0 resultados)
- **Problema:** Todo o esforço de JobLog termina numa tabela que só é consultável via `psql`. Não há endpoint de health, painel de jobs falhados, email/notificação em `FAILED`, nem contador de retries esgotados. As Definições mostram "Inativo/Última actualização" para contas de email, mas pulls de fontes, parses e renovação de subscrições falham invisível.
- **Cenário:** O pull do Moloni falha às 03:00 (credenciais revogadas). Edgar descobre duas semanas depois quando o cliente pergunta porque faltam as faturas.
- **Correção sugerida:** Mínimo viável: página `/settings` com últimos N JobLog FAILED por fila + email diário ao OWNER quando `FAILED > 0`; ideal: alerta imediato no fim dos retries (BullMQ `failed` event → Resend).

### A-6 — Rascunho AI perdido para sempre se a geração falhar uma vez ✅ corrigido (842e29b)
- **Localização:** `src/queues/document-parse.processor.ts:339-344` + `src/queues/email-sync.processor.ts:22-44`
- **Problema:** Se `generateEmailDraft` falha (timeout da API, 529), o `EmailAction` é apagado para "libertar o slot", mas o job termina **COMPLETED** — não há retry do BullMQ. E `queuePendingAttachments` só re-enfileira anexos com `document: null`, que já não é o caso. Nenhum caminho volta a chamar `maybeGenerateDraftForEmail` para aquele email.
- **Cenário:** API da Anthropic instável durante 10 minutos → todos os emails processados nessa janela ficam sem rascunho, sem indicação de erro, sem botão "gerar de novo".
- **Correção sugerida:** Relançar (`throw`) após libertar o slot para o retry do BullMQ atuar, ou expor um "Gerar rascunho" manual no detalhe do email.

### A-7 — Estado `APPROVED` é um beco sem saída se o processo cair no envio
- **Localização:** `src/server/services/draft-review-service.ts:64-112, 260-287`
- **Problema:** A máquina de estados é `PENDING_REVIEW → APPROVED → (APPROVED_SENT | APPROVED_SEND_FAILED)`. Se o processo morre entre o `updateMany` para `APPROVED` e o desfecho do `sendReply` (ou depois do envio, antes do update final), o registo fica `APPROVED` — estado de que **nenhuma** transição parte (`retrySend` exige `APPROVED_SEND_FAILED`; approve/reject exigem outros estados). Só se resolve com UPDATE manual na BD. Nota: se o crash for *depois* do envio, um "retry" cego duplicaria o email — a recuperação tem de ser consciente disso.
- **Cenário:** Deploy no Railway a meio de uma aprovação → rascunho eternamente "aprovado" sem envio nem erro, invisível na UI (que só conhece pending/sent/failed/rejected).
- **Correção sugerida:** Job de recuperação: `APPROVED` com `updatedAt` > N minutos → `APPROVED_SEND_FAILED` com `sendError: 'interrompido'`, deixando o humano decidir o reenvio.

### A-8 — Webhook Gmail aceita JWT de qualquer projeto GCP
- **Localização:** `src/app/api/webhooks/gmail/route.ts:37-42`
- **Problema:** `jwtVerify` valida assinatura Google + `audience`, mas não o `issuer` nem o `email`/`sub` da service account. Qualquer pessoa com um projeto GCP pode criar uma subscription Pub/Sub push para este URL com o mesmo `audience` e injetar payloads arbitrários (`emailAddress`, `historyId`) assinados pela Google.
- **Cenário:** Atacante descobre o URL do webhook → força syncs contínuos de contas alheias (custo de API/quota, amplificação) ou explora o rate-limit por `emailAddress` forjado para fazer starvation das notificações legítimas.
- **Correção sugerida:** Validar `iss` (`accounts.google.com`) **e** o claim `email` contra a service account própria configurada em env (`PUBSUB_SERVICE_ACCOUNT`).

### A-9 — Import bancário: crash a meio deixa o import "PROCESSED" sem transações e sem repetição possível
- **Localização:** `src/server/services/bank-import-service.ts:386-458`
- **Problema:** A transição `PENDING → PROCESSED` acontece **antes** de criar as transações e correr o matching. Se o processo morrer a meio do `createMany`/matching, o retry devolve 409 "Import já confirmado" e o re-upload do mesmo ficheiro devolve 409 "já foi importado" (fileHash). O caminho de fuga (`force`) existe mas não é óbvio que se aplica a este caso.
- **Cenário:** Deploy durante a confirmação de um extrato de 800 linhas → 200 transações criadas, 600 perdidas, e a UI diz que o import está concluído.
- **Correção sugerida:** Ou embrulhar parse+createMany numa transação antes do claim final, ou permitir "re-confirmar" um PROCESSED cujo `errorReport` está vazio (o dedupHash torna a repetição idempotente).

### A-10 — `AuditLog` imutável só por convenção
- **Localização:** `prisma/migrations/*` (nenhum trigger/regra), `prisma/schema.prisma:803`
- **Problema:** A regra "AuditLog nunca é apagado/editado" vive apenas na disciplina do código da app. O utilizador de BD da aplicação tem DELETE/UPDATE; um bug (ou um `onDelete: Cascade` futuro mal pensado) apaga histórico sem barreira.
- **Cenário:** Migração futura adiciona cascade de Office → AuditLog; apagar um office de teste em produção leva o histórico junto. Ou: incidente de segurança e o atacante com a connection string limpa o rasto.
- **Correção sugerida:** Trigger Postgres `BEFORE UPDATE OR DELETE ... RAISE EXCEPTION` na tabela (com bypass explícito só para retenção), aplicado por migração SQL.

### A-11 — Duplicados e divisão de PDF: serviços completos sem rota nem UI ✅ corrigido (4fd1e40)
- **Localização:** `src/server/services/review-service.ts:416-517` (`resolveDuplicate`, `approveSplit`) — grep em `src/app` → **0** chamadas
- **Problema:** A resolução de duplicados (manter/apagar/são distintos) e a aprovação de split de baixa confiança estão implementadas e auditadas ao nível do serviço, mas nenhuma rota API as expõe e nenhum componente as chama. Na UI, um documento "Duplicado?" só pode ser Validado (a flag persiste) ou Rejeitado (soft-delete).
- **Cenário:** Ver UX_CONTABILISTA.md, jornada 3 — a contabilista não tem como dizer "são documentos distintos".
- **Correção sugerida:** Rota `POST /api/documents/[id]/resolve-duplicate` + botões no formulário de correção (o backend já está pronto, incluindo optimistic locking).

---

## MÉDIO

### M-1 — "Rejeitar" na fila de revisão apaga sem confirmação nem undo ✅ corrigido (4fd1e40)
- **Localização:** `src/components/dashboard/review-queue.tsx:203-209` → `review-service.ts:237-239` (`deletedAt = now`)
- **Problema:** Um clique (botão adjacente ao "Validar") faz soft-delete imediato — sem dialog, sem motivo, sem "anular" na UI. O documento sai de todas as filas e exports; recuperação só via BD.
- **Cenário:** Na revisão de 30 documentos em sequência, um misclick no vermelho elimina uma fatura real do dossiê fiscal.
- **Correção sugerida:** Confirmação com motivo (como o "Ignorar" do banco já faz) e/ou toast com "Anular" que reverte o `deletedAt`.

### M-2 — Login promete "link válido durante 10 minutos"; o token dura 24 horas
- **Localização:** `src/app/login/page.tsx` e `src/app/login/verify/page.tsx` (texto), `src/lib/auth.ts:16-36` (provider Resend sem `maxAge` → default 24h)
- **Problema:** O copy de segurança mente por um fator de 144. Ou o texto está errado, ou a janela de validade real é excessiva face à intenção declarada.
- **Cenário:** Magic link reencaminhado/comprometido continua utilizável um dia inteiro, quando o utilizador foi levado a crer que expirou.
- **Correção sugerida:** `maxAge: 600` no provider (e manter o texto), que é o comportamento prometido.

### M-3 — Cabeçalhos MIME e encodings PT tratados de forma incompleta no sync
- **Localização:** `GmailProvider.ts:490-518` (`parseFromHeader` não descodifica RFC 2047; `extractTextBody` assume UTF-8 e ignora `charset`), `OutlookProvider.ts:475-486` (`stripHtml` só descodifica 4 entidades — `&eacute;`, `&#231;` etc. ficam no texto)
- **Problema:** Remetentes portugueses com acentos chegam como `=?UTF-8?Q?Jos=C3=A9_Ant=C3=B3nio?=` na UI e no matching por nome; corpos em latin-1 ficam corrompidos; texto para classificação leva entidades HTML.
- **Cenário:** "José António <ja@empresa.pt>" aparece ilegível na caixa de entrada; classificação e rascunho citam texto com `&atilde;`.
- **Correção sugerida:** Usar `mailparser` (já é dependência!) para descodificar headers/corpos no Gmail, e uma tabela de entidades decente (ou `he`) no Outlook.

### M-4 — Código de classificação V1 morto + regressão do padrão SAFT
- **Localização:** `src/server/services/email-classification.ts:24-305` — `classifyDocument/classifyImage/classifyPdfDocument/classifyFromFilename/classifyFromATQR` só são usados nos próprios testes; pipeline real é `runExtractionCascade`
- **Problema:** ~280 linhas mortas com padrões antigos (sem validação Zod da resposta da IA, cast direto para enum). E `classifyFromFilename` (SAFT `NIF-ANO-MES-SAFT.xml` → `AT_COMMUNICATION` sem custo de IA) **não tem equivalente** no cascade novo — um SAFT agora vai parar ao Claude como texto.
- **Cenário:** Manutenção futura "corrige" o ficheiro errado; SAFTs gastam tokens e classificam pior do que o V1 fazia de graça.
- **Correção sugerida:** Apagar o código morto (e os testes que o cobrem) e portar o atalho SAFT para `runExtractionCascade` antes do passo de IA.

### M-5 — Correção de NIF na revisão não valida o dígito de controlo
- **Localização:** `src/app/api/documents/[documentId]/review/route.ts:34` (só `/^\d{9}$/`), `src/server/services/review-service.ts:82-154` (nada); contraste com `import-service.ts:126-128`, que usa `isValidNif`
- **Problema:** O import de folhas rejeita NIFs com checksum errado; a correção manual na revisão — precisamente o sítio onde humanos emendam OCR — aceita qualquer 9 dígitos. O mesmo vale para `type: z.string()` (linha 32), que aceita um tipo inexistente e rebenta com 500 no Prisma.
- **Cenário:** Fátima "corrige" um NIF trocando dois dígitos; o documento valida, exporta, e o erro só aparece na entrega da declaração.
- **Correção sugerida:** `isValidNif` no `validateCorrections` (aviso ou erro) e `z.enum` dos DocumentType na rota.

### M-6 — Export e matching bancário síncronos no request HTTP
- **Localização:** `src/server/services/export-service.ts:109-123` (download de todos os PDFs + ZIP em memória), `bank-import-service.ts:454-457` → `bank-matching.ts:258-272` (N transações × queries no confirm)
- **Problema:** Ambos escalam linearmente com o volume dentro de um request Next.js: um export de 500 documentos carrega 500 PDFs para RAM; um extrato de 1000 linhas dispara milhares de queries antes de responder.
- **Cenário:** Primeiro fim de mês com volume real → timeout do Railway a meio do export; batch fica `PENDING` para sempre (sem estado de erro), documentos ficam por marcar `EXPORTED`.
- **Correção sugerida:** Mover ambos para jobs BullMQ (as filas já existem) com polling do estado na UI; no export, stream para R2 em vez de ZIP em memória.

### M-7 — Falha de R2 durante o export omite PDFs em silêncio
- **Localização:** `src/server/services/export-service.ts:116-123`
- **Problema:** `downloadFromR2` falhado → `console.warn` e o documento sai do ZIP, mas a linha do CSV continua a referenciar `ficheiro` inexistente; o documento é marcado `EXPORTED` na mesma. Nenhum campo do `ExportBatch` regista os falhados.
- **Cenário:** Blip do R2 durante o export mensal → 3 PDFs em falta no ZIP entregue ao cliente; ninguém sabe até o software de contabilidade pedir o comprovativo.
- **Correção sugerida:** Acumular falhas no batch (`errorReport` como no import bancário), não marcar esses documentos como EXPORTED, e mostrar o aviso na UI de download.

### M-8 — Webhook Graph: segredo único global e resposta de erro reveladora
- **Localização:** `src/app/api/webhooks/graph/route.ts:40-53`; contraste com `.claude/rules/security.md` ("Return 200 immediately on validation failure")
- **Problema:** (1) O `clientState` é o mesmo `GRAPH_WEBHOOK_SECRET` para todas as subscrições de todos os offices — fuga num log da Microsoft compromete todos; (2) comparação `===` não constant-time; (3) mismatch devolve 401 com corpo explicativo, contra a própria regra de segurança do repo (o Gmail devolve 200 neutro no caso "conta desconhecida", o Graph não).
- **Cenário:** Segredo exposto → forjar notificações válidas para qualquer subscrição (impacto limitado a queuing de syncs, mas viola o modelo declarado).
- **Correção sugerida:** `clientState` por subscrição (HMAC de `subscriptionId` + segredo), `timingSafeEqual`, e alinhar os códigos de resposta com a regra escrita (ou atualizar a regra).

### M-9 — Rate limiting em memória por instância
- **Localização:** `src/server/rate-limit.ts:12` (`Map` module-level)
- **Problema:** Aceite pelo spec (§1.4), mas vale registar a consequência: com ≥2 instâncias web no Railway os limites multiplicam-se pelo nº de instâncias, e cada deploy faz reset. Os limites de magic-link (5/h) e de portal ficam efetivamente 2-3× mais largos.
- **Cenário:** Scale-out para 3 instâncias → atacante de enumeração de magic links tem 15 tentativas/hora por email+IP.
- **Correção sugerida:** Migrar para Redis (`INCR` + `EXPIRE`) quando houver segunda instância — o cliente já existe no projeto.

### M-10 — Matching bancário nunca reconhece a entidade em faturas emitidas
- **Localização:** `src/server/services/bank-matching.ts:107-118` (usa só `supplierNif`/`supplierName`), `CREDIT_DOCUMENT_TYPES:22`
- **Problema:** Para créditos (recebimentos), os candidatos são `INVOICE_ISSUED`, cuja contraparte está em `buyerNif`/`buyerName` — campos que o scoring ignora. Emitidas ficam limitadas a montante+data (máx. 75 pontos, e só com data ≤3 dias), raramente atingindo autoMatch com folga. `INVOICE_RECEIPT` emitidas (recibos verdes) nem sequer entram nos tipos de crédito.
- **Cenário:** Freelancer (Ana Ferreira) recebe transferências dos clientes dela — as sugestões saem sistematicamente fracas ou vazias apesar de o NIF do pagador estar no descritivo.
- **Correção sugerida:** Para tipos de crédito, pontuar `buyerNif`/`buyerName`; incluir `INVOICE_RECEIPT` no sentido apropriado à direção do documento.

### M-11 — Colisão de duplicado autoritativo salta os pós-checks
- **Localização:** `src/server/services/extraction.ts:384-411` (o ramo P2002 faz `return` antes de `runPostExtractionChecks`)
- **Problema:** Um documento que colide no índice único (officeId, supplierNif, documentNumber) fica `DUPLICATE_SUSPECT` mas nunca corre a deteção wrong-client, a auto-associação por buyerNif nem o upsert do registo de fornecedor.
- **Cenário:** O duplicado é, afinal, o exemplar "bom" (o primeiro veio truncado); ao resolvê-lo como distinto, faltam-lhe as associações que os irmãos têm.
- **Correção sugerida:** Chamar `runPostExtractionChecks` também no ramo de colisão (é idempotente).

### M-12 — CSV parser naïf no import (folhas e extratos)
- **Localização:** `src/server/services/import-service.ts:24-38` (`split(';')` sem tratamento de aspas; separador fixo `;`)
- **Problema:** Campos entre aspas com `;` interno partem a linha; CSVs exportados com vírgula (formato anglo de alguns homebankings) leem tudo para uma coluna; aspas envolventes ficam nos valores (e entram no `dedupHash` dos extratos).
- **Cenário:** Extrato do banco X com descritivo `"TRF; REF 123"` → linha rejeitada como "Data inválida" ou montante ilegível, sem pista da causa real.
- **Correção sugerida:** Parser CSV a sério (ex.: `csv-parse`, ou o próprio `XLSX.read` com `FS` detetado) com deteção de separador.

### M-13 — `resendInvitation` não escreve AuditLog
- **Localização:** `src/server/services/invitation-service.ts:219-241`; contraste com `createInvitation:139-148`
- **Problema:** Criar convite audita antes do envio (regra G5); reenviar — que regenera o token e reenvia email externo — não audita nada.
- **Cenário:** Investigação de acesso indevido não consegue reconstruir quantas vezes e quando um convite foi reenviado.
- **Correção sugerida:** Entrada `INVITATION_RESENT` antes do `resend.emails.send`, como no create.

### M-14 — `sncSource` mal etiquetado quando um humano corrige a conta
- **Localização:** `src/server/services/review-service.ts:264` (`'RULE' === doc.sncSource ? doc.sncSource : 'HUMAN'`)
- **Problema:** Se a conta veio de regra e o humano a **altera**, a origem fica `RULE` — o histórico de aprendizagem (HISTORY/RULE/HUMAN) fica poluído exatamente no caso mais informativo (humano a contrariar a regra).
- **Cenário:** Métricas futuras de "regras que os humanos corrigem" saem enviesadas para zero.
- **Correção sugerida:** Correção humana → `HUMAN`, sempre.

---

## BAIXO

### B-1 — Extensão de ficheiro não sanitizada entra na chave R2
- **Localização:** `src/queues/document-parse.processor.ts:349-363` (`split('.').pop()` aceita `/` — ex.: `f.a/b` → chave `...attId.a/b`)
- **Correção sugerida:** Whitelist `[a-z0-9]{1,5}`.

### B-2 — Formato legacy CBC aceite em `decryptToken` sem autenticação
- **Localização:** `src/lib/crypto.ts:60-70` — ciphertext maleável enquanto existirem tokens antigos; janela fecha-se sozinha no próximo refresh.
- **Correção sugerida:** Migração one-shot que re-encripta tudo para v2 e remove o ramo CBC.

### B-3 — Logout aponta para rota inexistente
- **Localização:** `src/components/dashboard/sidebar.tsx:48` (`callbackUrl: '/auth/signin'`) — funciona por acidente (proxy redireciona para /login).
- **Correção sugerida:** `callbackUrl: '/login'`.

### B-4 — Extração XML/UBL assume ordem dos elementos
- **Localização:** `src/server/services/extraction.ts:186-199` — primeiro `<cbc:Name>` pode ser do comprador; `nifs[0]/nifs[1]` dependem da ordem supplier→customer.
- **Correção sugerida:** Ancorar os regex dentro de `AccountingSupplierParty`/`AccountingCustomerParty`.

### B-5 — Dois documentos com mesmo nº+NIF geram o mesmo caminho dentro do ZIP
- **Localização:** `src/server/services/export-service.ts:113-119` — `addFile` duplicado; um dos PDFs desaparece do ZIP.
- **Correção sugerida:** Sufixar com o id curto do documento em caso de colisão.

### B-6 — Histórico do assistente é reenviado pelo cliente sem verificação
- **Localização:** `src/app/api/assistant/query/route.ts:18-26` — o browser pode forjar turns `assistant`. Risco baixo (ferramentas read-only, office-scoped), mas é input não confiável a moldar o prompt.
- **Correção sugerida:** Assinar o histórico devolvido (HMAC) ou guardá-lo server-side por sessão.

### B-7 — Threshold do rascunho usa o **máximo** das confianças dos anexos
- **Localização:** `src/queues/document-parse.processor.ts:263-265` — um anexo bom entre três ilegíveis autoriza um rascunho que "confirma a receção" de todos.
- **Correção sugerida:** Usar o mínimo, ou listar no rascunho apenas os anexos acima do threshold (a lista `receivedDocuments` já filtra por tipo, não por confiança).

---

## Top 5 a corrigir antes do primeiro cliente real

1. **C-1 — `/accept-invite` 404.** Sem isto não há sequer onboarding; é a primeira interação de qualquer utilizador convidado e morre num 404 em inglês.
2. **C-2 — Listas de documentos só-email.** O produto parece vazio/errado mal alguém carregue um ficheiro; destrói a confiança no primeiro dia e corrompe os contadores.
3. **C-4 + C-5 — Gmail sync que perde emails e encrava.** Perda silenciosa de dados no coração do produto ("nunca mais perder uma fatura"); o pior tipo de bug: invisível.
4. **C-3 — Export sem UI.** É o entregável mensal que justifica a compra; hoje só existe por curl.
5. **A-5 — Visibilidade de falhas.** Tudo o resto nesta lista é sobrevivível **se** alguém souber que aconteceu; hoje ninguém sabe. Um painel de JobLog FAILED + email diário muda o jogo operacional inteiro.
