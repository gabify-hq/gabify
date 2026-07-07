# AUDIT_GABIFY.md

**Data:** 06/07/2026
**Âmbito:** auditoria read-only completa do repositório Gabify (branch `feature/dev`, commit `3108cfa`)
**Referência de mercado:** modelo Kabilio — camada pré-contabilística (ingestão → extração IA → classificação contabilística → revisão humana → export estruturado para software de contabilidade PT)
**Método:** leitura integral do código de produção (~12.9k LOC em `src/`), execução da suite de testes, typecheck, lint, análise do schema e das migrações. Nenhum ficheiro de código foi alterado.

---

## 1. INVENTÁRIO FUNCIONAL

Projeto com 74 commits entre 30/05/2026 e 19/06/2026 (~3 semanas de desenvolvimento). Roadmap declarado no CLAUDE.md: Módulo 1 Fase 2 (Dashboard UI). O inventário abaixo reflete o que **realmente existe**, não o que o roadmap diz.

### 1.1 Módulo 0 — Foundation (schema, clients, workers)

**Estado: COMPLETO com uma falha crítica de onboarding.**

| Componente | Estado | Entry points | Dependências externas |
|---|---|---|---|
| Schema Prisma (14 modelos, 8 enums) | Completo | `prisma/schema.prisma` | PostgreSQL |
| Migrações (5) | Completo | `prisma/migrations/` | — |
| Auth (magic links, JWT session) | Parcial — ver 3.3 | `src/lib/auth.ts`, `src/lib/auth-adapter.ts`, `src/proxy.ts` | Resend |
| Gestão de clientes (CRUD) | Completo | `src/app/api/clients/route.ts`, `src/app/api/clients/[clientId]/route.ts` | — |
| Encriptação de tokens (AES-256-CBC) | Completo | `src/lib/crypto.ts` | — |
| R2 storage (signed URLs) | Completo | `src/lib/r2.ts` | Cloudflare R2 |

O schema é bom: multi-tenant via `officeId`, soft deletes, AuditLog imutável, índices razoáveis, relações com `onDelete` corretos. É a parte mais sólida do projeto.

### 1.2 Módulo 1 — Email Copilot

**Estado: PARCIAL — o pipeline de entrada funciona; o loop de saída (aprovação → envio) é fachada.**

| Componente | Estado | Entry points | Dependências externas |
|---|---|---|---|
| `EmailProvider` interface | Completo | `src/server/email-providers/EmailProvider.ts` | — |
| `OutlookProvider` (Graph delta sync, refresh tokens, sendReply, watchChanges) | Completo **mas não persiste attachments** — ver 3.5 | `src/server/email-providers/OutlookProvider.ts` | Microsoft Graph |
| `GmailProvider` (historyId sync, attachments, sendReply, watch) | Completo | `src/server/email-providers/GmailProvider.ts` | Gmail API |
| `ImapProvider` | Esqueleto (stub declarado, aceitável) | `src/server/email-providers/ImapProvider.ts` | — |
| OAuth connect flows (Outlook + Google) | Completo (CSRF state cookie, encriptação) | `src/app/api/auth/{outlook,google}/{initiate,callback}/route.ts` | Azure AD, Google OAuth |
| Worker email-sync (polling 30s + JobLog) | Completo | `src/queues/email-sync.worker.ts` | Redis/BullMQ |
| Webhooks (Graph + Gmail Pub/Sub) | Parcial — endpoints existem, **subscrições nunca são criadas** (`watchChanges` nunca é chamado fora de testes). Sistema vive 100% de polling | `src/app/api/webhooks/{graph,gmail}/route.ts` | — |
| Client matching (knownEmails/domínio) | Completo | `src/server/services/client-matching.ts` | — |
| Associação retroativa de remetentes | Completo | `src/app/api/emails/associate-sender/route.ts` | — |
| Geração de draft (Claude, PT-PT) | Completo | `generateEmailDraft` em `src/server/services/email-classification.ts` | Claude API |
| **Aprovação/rejeição/envio de drafts** | **FACHADA** — `src/lib/dashboard-store.tsx` guarda a decisão em `sessionStorage` do browser. Nenhuma API, nenhum `EmailReview`, nenhum `AuditLog`, nenhum `sendReply` é invocado em código de aplicação. O modelo `EmailReview` existe no schema e **nunca é escrito** | `src/components/dashboard/email-detail.tsx:35-51` | — |

Consequência direta: o princípio central do produto ("AI copilot, aprovação explícita, tudo auditado") **não está implementado**. A decisão do contabilista evapora ao fechar o browser. Nenhum email de resposta alguma vez foi ou pode ser enviado pela aplicação no estado atual.

### 1.3 Módulo 3 (antecipado) — Document Parser

**Estado: PARCIAL-forte. É o ativo mais valioso do repositório.**

| Componente | Estado | Entry points | Dependências externas |
|---|---|---|---|
| Worker document-parse (download → R2 → classificação → AuditLog → draft) | Completo, idempotente | `src/queues/document-parse.worker.ts` | R2, Claude, Redis |
| Cascata de classificação: filename (SAF-T) → QR AT (imagem) → QR AT (PDF renderizado) → Claude Vision → Claude PDF nativo → Claude texto | Completo | `src/server/services/email-classification.ts` | Claude API |
| Parser de QR fiscal AT (campos A–S) | Completo, testado | `src/lib/at-fiscal-qr.ts` + `.test.ts` | — |
| Leitura QR (jsQR + zxing-wasm + render pdfjs/canvas) | Completo | `src/lib/qr-reader.ts` | canvas, pdfjs-dist |
| Extração de texto (PDF, DOCX, XLSX, XML, ZIP, CSV) | Completo, testado | `src/lib/text-extractor.ts` | pdf-parse, mammoth, xlsx, adm-zip |
| Extração de dados | **Limitada a 3 campos**: data, valor total, NIF do emitente. Sem linhas de fatura, sem IVA por taxa, sem nome do fornecedor, sem número de documento (exceto via QR) | — | — |
| Revisão de classificação (`DocumentReview`) | Modelo existe no schema; **nenhuma rota ou UI escreve nele** | — | — |

### 1.4 Módulo 1 Fase 2 — Dashboard UI

**Estado: PARCIAL — lê dados reais, mas está estruturalmente acoplado a mock data.**

| Componente | Estado | Notas |
|---|---|---|
| Overview (contadores por office) | Completo | `src/app/(dashboard)/page.tsx` — queries Prisma reais |
| Inbox + detalhe de email | Parcial | Server components leem da BD mas **mapeiam para tipos `MockEmail`/`MockEmailAction`** de `src/lib/mock-data.ts` |
| Documentos | Parcial | Idem (`MockDocument`); pior: `document-table.tsx:92` renderiza um dropdown com **`MOCK_CLIENTS` hardcoded** em produção |
| Clientes + detalhe por período | Completo | Dados reais |
| Settings (contas de email) | Completo | Connect Outlook/Google |
| Login (magic link) | Completo | |

`src/lib/mock-data.ts` é simultaneamente fixture de demo **e** dependência de produção: `DOCUMENT_TYPE_LABELS` é importado pelo worker de produção (`document-parse.worker.ts:7`) a partir do ficheiro de mocks.

### 1.5 Módulos 2, 4, 5, 6, 7

**Estado: NÃO EXISTEM.** Zero código de portal de cliente, calendário fiscal, lembretes, export ZIP ou integração com software de contabilidade. Coerente com o roadmap declarado, mas relevante para o gap analysis abaixo.

---

## 2. GAP ANALYSIS vs KABILIO

Esforço: **S** = dias, **M** = 1–3 semanas, **L** = 1–3 meses (1 dev com IA).

| Capacidade-alvo (Kabilio) | Estado no Gabify | Detalhe | Esforço p/ fechar |
|---|---|---|---|
| **Ingestão multi-canal** (email Graph, upload manual, foto mobile) | **PARCIAL** | Email via Graph/Gmail existe e funciona (por polling; webhooks não ativados). **Não existe upload manual** — a única porta de entrada de documentos é um anexo de email. Sem UI de upload, sem endpoint, sem mobile. Para um produto "recebe faturas de clientes", isto é metade do canal em falta | **M** — endpoint upload + UI drag&drop reutilizam todo o pipeline existente (o worker já é agnóstico à origem a partir do buffer); mobile foto é PWA/câmara sobre o mesmo endpoint |
| **Extração/parsing de faturas com IA** | **PARCIAL** | Cascata de classificação é genuinamente boa (QR AT é diferenciador real — dados autoritativos sem custo de IA). Mas extrai só tipo + data + total + NIF emitente. Kabilio extrai: fornecedor, nº documento, linhas, bases e IVA por taxa, retenções, moeda. O prompt e o schema `Document` não têm onde guardar isso | **M** — alargar schema (`documentLines`, `vatBreakdown` JSON), alargar prompts; o QR AT já traz IVA por taxa (campos I1–K4 já parseados em `at-fiscal-qr.ts` e **descartados** — só se usa total/NIF/data) |
| **Classificação contabilística** (plano de contas SNC, códigos IVA, rubricas) | **NÃO EXISTE** | A "classificação" atual é tipologia documental (13 tipos: fatura, recibo, extrato…), não contabilística. Não há noção de plano de contas, conta 62x/31x, código de IVA dedutível/liquidado, centro de custo, diário. É a diferença entre "isto é uma fatura" e "isto é um lançamento 62.2.1 c/ IVA 23% dedutível". É o coração do valor do Kabilio | **L** — exige: modelo de plano de contas (SNC taxonomia), regras/histórico por fornecedor (aprende do contabilista), sugestão IA com confiança, e UI de correção. É um módulo novo inteiro |
| **Fila de revisão humana antes de exportar** | **PARCIAL** | Os alicerces existem (status `NEEDS_REVIEW`, thresholds de confiança 0.85/0.60, modelos `DocumentReview`/`EmailReview`) mas **nenhum caminho de escrita existe**: não há rota de aprovação, a UI de aprovação de drafts é sessionStorage, `DocumentReview` nunca é criado. A fila mostra; não deixa decidir | **M** — APIs de review (aprovar/corrigir tipo/valores) + persistência + AuditLog; a UI já tem os botões desenhados |
| **Export estruturado / integração software PT** (TOConline, Cegid/Primavera, Sage, Moloni) | **NÃO EXISTE** | Zero código. Nem export ZIP organizado (Módulo 6), nem CSV/Excel de lançamentos, nem APIs (Módulo 7). Sem isto o Gabify é um arquivo bonito — o documento entra mas nunca chega à contabilidade | **M** para export ficheiro (ZIP Cliente/Ano/Mês/Tipo + CSV de lançamentos); **L** para integrações API reais (TOConline tem API pública decente; Primavera/Sage é outro campeonato) |
| **Portal do gabinete (multi-dossiê/multi-cliente)** | **PARCIAL** | Multi-tenancy por `officeId` está no schema e nas queries. Mas: onboarding quebrado (ver 3.3 — qualquer signup cai no primeiro Office), sem gestão de utilizadores, sem convites, RBAC não aplicado, sem portal do **cliente final** (Módulo 2). O que existe é single-office de facto | **M** — corrigir onboarding + convites + enforcement de roles. Portal do cliente final é **L** separado |
| **Suporte CIUS-PT / faturação eletrónica estruturada** | **NÃO EXISTE** | XML é tratado como texto genérico e mandado ao Claude (`text-extractor.ts` caso `.xml`). Não há parser UBL/CIUS-PT, não há validação de faturas eletrónicas B2G/B2B. O parse do QR AT e do filename SAF-T são os únicos toques em standards fiscais PT — bons, mas adjacentes | **M** — parser estrutural de UBL 2.1/CIUS-PT é trabalho determinístico bem especificado; encaixa na cascata antes do fallback IA |

**Leitura global:** o Gabify cobre bem a **entrada** (email → documento → tipo + 3 campos) e não cobre nada da **saída** (lançamento contabilístico → revisão → export). O Kabilio é precisamente um produto de saída. Do funil completo do Kabilio, o Gabify tem ~30–35%, concentrado na primeira metade.

---

## 3. SAÚDE DO CÓDIGO

### 3.1 Números reais

```
Código produção (src/):        ~12.900 LOC
  lib: 1.958 | server: 3.533 | queues: 550 | app: 3.053 | components: 3.869

Testes:   11 ficheiros, 179 testes, todos verdes (1.24s)
Typecheck (tsc --noEmit): 0 erros em src/; 6 erros em scripts/ de debug
Lint:     24 erros, 124 warnings (maioria em .claude/worktrees/ abandonadas
          e scripts/; 3 erros reais em src/)
Coverage: NÃO MEDÍVEL — script `test:coverage` existe mas
          @vitest/coverage-v8 não está instalado. A regra do próprio
          repo exige 80%+; não há como verificar.
```

**O que está testado** (e bem, com AAA e mocks corretos): `at-fiscal-qr`, `crypto`, `r2`, `text-extractor`, `mock-data`, `GmailProvider`, `OutlookProvider`, `client-matching`, `email-classification`, 2 rotas API.

**O que NÃO está testado** (violando as regras do próprio repo — workers 80%+, rotas 70%+):
- Os **dois workers** (`email-sync`, `document-parse`) — a lógica mais crítica do sistema, incluindo a cascata de classificação e o `checkAndGenerateDraft`, zero testes
- Os **dois webhooks** (Graph, Gmail) — código de segurança, zero testes
- As **4 rotas OAuth** (initiate/callback ×2) — código de segurança, zero testes
- `qr-reader.ts`, `auth-adapter.ts`, rotas `attachments`/`documents`/`clients` (POST/GET)

Estimativa honesta de cobertura ponderada por risco: os ~40% mais perigosos do código têm 0% de cobertura.

### 3.2 Dívida técnica relevante

1. **`mock-data.ts` como dependência de produção.** Worker e 8 componentes importam labels/tipos de um ficheiro de mocks; `document-table.tsx:92` renderiza `MOCK_CLIENTS` reais num dropdown de produção. Os tipos `MockEmail`/`MockDocument` funcionam como DTOs de facto — o "Mock" no nome é mentira estrutural que vai enganar alguém.
2. **`dashboard-store.tsx` (sessionStorage)** — comentado como "In production this will be replaced by server state". Está em produção. É o loop de aprovação inteiro.
3. **Webhooks órfãos** — `watchChanges()` implementado e testado nos dois providers, nunca invocado. `outlookSubscriptionId`/`gmailWatchExpiry` no schema, nunca preenchidos. O fallback no webhook Graph (`route.ts:56` — "qualquer conta OUTLOOK ativa") é um TODO disfarçado.
4. **`.env.example` desatualizado e errado**: documenta `AZURE_AD_CLIENT_ID`/`AZURE_AD_CLIENT_SECRET`; o código lê `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`. Falta `GMAIL_WEBHOOK_URL`, `EMAIL_POLL_INTERVAL_MS`. Quem configurar pelo example não consegue ligar o Outlook.
5. **Docs desalinhados com o código** (violando a regra sacred #3 do repo): `docs/technical/OVERVIEW.md` diz Next.js 14 (é 16), marca encriptação de tokens e verificação de webhooks como "⏳ TODO" (estão feitas), e a tabela de cobertura lista 2 ficheiros de teste (existem 11).
6. **Lixo no repo**: ficheiro untracked chamado `console.log(j.id` na raiz; worktrees abandonadas em `.claude/worktrees/` a poluir o lint; 4 scripts de debug (`debug-qr*.ts`, `test-pdf-render.ts`) com erros de typecheck.
7. **`parsePtDate` frágil** (`email-classification.ts:473`): constrói `new Date("YYYY-MM-DD")` → UTC midnight; em Europe/Lisbon é aceitável mas é o típico bug latente de fuso.
8. **EmailAttachment de Outlook nunca criados** — ver 3.5. Não é dívida, é bug funcional grave.

### 3.3 Segurança

| Área | Avaliação |
|---|---|
| **Onboarding multi-tenant** | 🔴 **CRÍTICO.** `GabifyAdapter.createUser` (`src/lib/auth-adapter.ts:23`) associa qualquer novo utilizador ao **primeiro Office da BD** (`findFirst`). O signup por magic link está aberto a qualquer email. Combinação: **qualquer pessoa na internet que peça um magic link entra no gabinete existente como ACCOUNTANT**, com acesso total a emails, documentos e clientes desse gabinete. O comentário no código reconhece que é "dev bootstrapping" — mas não há guard de produção. Enquanto isto existir, o produto não pode ter dados reais |
| **RBAC** | 🔴 **AUSENTE.** `UserRole` (OWNER/ACCOUNTANT/VIEWER) existe no schema e na sessão, e **nunca é verificado em rota nenhuma**. Um VIEWER cria/edita/apaga clientes e associa remetentes exatamente como um OWNER. O único uso de `role` no código todo é para escolher a assinatura do draft (`document-parse.worker.ts:313`) |
| **Isolamento por office nas rotas** | 🟢 Bom. Todas as rotas de dados filtram por `session.user.officeId` e devolvem 404 (não 403) em acesso cross-tenant. Padrão correto e consistente |
| **Tokens Graph/Gmail** | 🟢 Bom. AES-256-CBC com IV aleatório (`crypto.ts`), encriptados antes de persistir, refresh com buffer de 5 min, nunca logados. (CBC sem HMAC não é authenticated encryption — GCM seria melhor — mas para tokens em BD própria é risco menor) |
| **Webhook Graph** | 🟡 `clientState` verificado **apenas se** `GRAPH_WEBHOOK_SECRET` estiver definido (`graph/route.ts:43` — `if (expectedClientState && …)`); sem a env var, aceita tudo silenciosamente. Fail-open |
| **Webhook Gmail** | 🟡 JWT verificado **apenas se** o header `Authorization` vier presente (`gmail/route.ts:27` — `if (authHeader)`); um POST sem header salta a verificação inteira. Fail-open. Impacto real limitado (só enfileira syncs), mas o padrão é errado — deve ser fail-closed |
| **Rate limiting** | 🔴 Ausente em todos os endpoints, incluindo webhooks — a regra `security.md` do próprio repo exige-o |
| **OAuth flows** | 🟢 CSRF state em cookie HttpOnly/SameSite, verificado no callback. Correto |
| **R2** | 🟢 Bucket privado, signed URLs 15 min nas rotas, key namespaced por office. Correto |
| **AuditLog** | 🟡 Escrito na classificação e geração de draft (antes da ação externa, como manda a regra). Mas as ações **do utilizador** (aprovar/rejeitar) não geram AuditLog porque não chegam ao servidor. O `entityId: 'pending'` seguido de update (`document-parse.worker.ts:324-353`) tecnicamente edita um AuditLog "imutável" |
| **Secrets** | 🟢 Nenhum hardcoded; tudo via env com validação à entrada |

### 3.4 Pontos frágeis operacionais

- **Polling como único mecanismo de sync** (30s × todas as contas, `email-sync.worker.ts:114-144`) — funciona para 3 gabinetes, não escala e queima quota Graph/Gmail. Webhooks estão a 90% e desligados.
- **Draft race**: dois jobs `document-parse` concorrentes (concurrency 3) para anexos do mesmo email podem ambos passar o check `existingDraft` e criar dois drafts — não há unique constraint em `(inboundEmailId, type)`.
- **`bodyHtml`, `toEmails`, `ccEmails` nunca preenchidos** pelos providers (arrays sempre vazios) — schema promete, sync não entrega.
- **JobLog só no worker de email** — `document-parse` não escreve JobLog, violando a regra do repo ("Always log job start/end to JobLog").

### 3.5 Bug funcional grave: anexos de Outlook

`OutlookProvider.upsertMessage` **nunca cria registos `EmailAttachment`** (só a mensagem; compare com `GmailProvider.upsertMessage`, que extrai e persiste attachment parts em `GmailProvider.ts:444-468`). O `$select` do delta query pede `hasAttachments` mas nada busca `/messages/{id}/attachments`. Como o queueing de parsing parte de `EmailAttachment` (`email-sync.worker.ts:69-75`), **anexos recebidos via Outlook nunca entram no pipeline de documentos**. Num produto cujo pitch é "gabinetes PT usam Outlook" (prioridade #1 declarada no CLAUDE.md), o canal prioritário não processa documentos. Os testes do OutlookProvider não apanham isto porque nenhum teste verifica criação de attachments.

---

## 4. ALINHAMENTO COM A WIRECLAY FOUNDATION

| Padrão Foundation | Veredicto | Localização / evidência |
|---|---|---|
| **Sessão server-side + cookie HttpOnly (não JWT em localStorage)** | **DIVERGENTE (a meio caminho)** | `src/lib/auth.ts:11` — `session: { strategy: 'jwt' }`. O JWT vive num cookie HttpOnly (não em localStorage — isso está bem), mas não é sessão server-side: não é revogável, e o `officeId`/`role` ficam congelados no token por 24h (mudar o role de um user não tem efeito até re-login). Ironia: o modelo `Session` existe no schema (`schema.prisma:162`) e não é usado — bastava `strategy: 'database'` |
| **`organization_id` multi-tenant em todas as tabelas** | **CONFORME com exceções** | `officeId` em Office/User/Client/EmailAccount/AuditLog/JobLog; InboundEmail/Attachment/Document/EmailAction herdam via join e as rotas filtram corretamente. Exceções: `EmailThread` não tem `officeId` nem relação com office (lookup global por `providerThreadId`, `OutlookProvider.ts:302`); `Document.clientId` cruza sem constraint de office. E o bootstrapping (3.3) anula o isolamento na prática |
| **RBAC via `can()` com DENY-precedence** | **AUSENTE** | Não existe função de autorização. Roles definidos e nunca consultados (única leitura: assinatura de draft, `document-parse.worker.ts:313`). Todas as rotas verificam apenas "está autenticado + tem officeId" |
| **404-not-403 em acesso cross-tenant** | **CONFORME** | `src/app/api/attachments/[attachmentId]/route.ts:34`, `documents/[documentId]/route.ts:41`, `clients/[clientId]/route.ts`, `associate-sender/route.ts:43` — todos `findFirst` com scope de office e 404 no miss. Padrão aplicado com consistência |
| **JdbcClient SQL-first** | **DIVERGENTE (por stack)** | Prisma ORM em TypeScript. Não é uma violação corrigível — é outra stack. O uso do Prisma é disciplinado (singleton, `select` explícito, sem N+1 óbvios), mas os list endpoints **não paginam** (`clients/route.ts:72` — `findMany` sem `take`), violando a própria regra do repo (default 50, max 200) |
| **Flyway (migrações versionadas)** | **CONFORME (equivalente)** | Prisma Migrate com 5 migrações nomeadas semanticamente, `migration_lock.toml` presente. Funcionalmente equivalente ao Flyway |
| **Job queue PostgreSQL com `FOR UPDATE SKIP LOCKED`** | **DIVERGENTE** | BullMQ + Redis (`src/lib/redis.ts`). Introduz uma dependência de infraestrutura extra (Redis) que a Foundation evita deliberadamente. Idempotência dos workers é razoável mas há a race do draft (3.4). Migrar para fila em PostgreSQL eliminaria Redis do deploy Railway |
| **Seeds via services** | **AUSENTE** | Não há seeds de espécie alguma. O bootstrap de Office/User é o hack do auth-adapter (3.3) — precisamente o anti-padrão que "seeds via services" existe para evitar |

**Resumo:** 2 CONFORME, 1 equivalente, 3 DIVERGENTE, 2 AUSENTE. As divergências de stack (Prisma vs JdbcClient, BullMQ vs PG queue) são estruturais; as ausências (RBAC, seeds) e a sessão JWT são corrigíveis dentro da stack atual em dias.

---

## 5. VEREDICTO

**Recomendação: (a) evoluir o Gabify in-place — com uma semana de correções críticas obrigatória antes de qualquer feature nova, e adoção seletiva dos padrões da Foundation.** Condicional no fim.

### Porquê não (c) rebuild sobre a Foundation

O argumento para rebuild seria "o que existe é descartável". Não é o caso. Os ativos com valor real deste repo são exatamente os mais caros de reconstruir:

- **Providers Graph/Gmail** (~900 LOC + ~1.200 LOC de testes): delta queries, historyId sync, refresh de tokens, MIME parsing, encriptação. É integração externa cheia de arestas que já foram limadas — a categoria de código onde reescrita custa mais do que parece.
- **Pipeline de classificação** (~1.500 LOC): a cascata QR AT → filename → Vision → PDF nativo → texto é um design genuinamente bom, com o QR fiscal AT como diferenciador de custo/precisão (classificação autoritativa a custo zero de IA). O parser `at-fiscal-qr.ts` já extrai IVA por taxa que o resto do sistema ainda nem usa.
- **Schema Prisma**: modelado com cuidado, já antecipa review flows e auditoria.

A Foundation é outra linguagem/stack (JdbcClient, Flyway ⇒ JVM). Rebuild significa **portar** os dois ativos acima, não reaproveitá-los — reescrever ~4.500 LOC das partes boas para ganhar padrões (RBAC, sessions, PG queue) que custam ~1–2 semanas a implementar em TypeScript. A aritmética não fecha.

### Porquê não (b) migração/reaproveitamento híbrido

Pior dos dois mundos: paga o custo de contexto de duas stacks para um produto pré-mercado com um dev. Faria sentido se houvesse módulos independentes por natureza (não há — tudo orbita o mesmo schema) ou se a equipa já vivesse na Foundation com vários serviços em produção (situação em que a resposta muda — ver condicional).

### Porquê (a) exige honestidade sobre o estado atual

Evoluir in-place **não** significa "está tudo bem". O estado real: o produto hoje é um pipeline de ingestão sólido colado a um dashboard que **finge** o loop de aprovação. Três coisas são disqualificantes para produção e têm de ser feitas antes de qualquer coisa nova:

1. **Fechar o buraco de onboarding** (3.3) — signup aberto + first-office attach = breach multi-tenant garantido. É o item mais grave do repo.
2. **Anexos Outlook** (3.5) — o canal prioritário do produto não processa documentos.
3. **Loop de aprovação real** — APIs de aprovar/rejeitar/enviar com `EmailReview` + `AuditLog` + `sendReply`, substituindo o sessionStorage. Sem isto o pitch do produto é falso.

Depois disso, na ordem: RBAC mínimo (`can()` central, DENY por omissão — importar o padrão da Foundation vale a pena), sessões database em vez de JWT, webhooks ligados (`watchChanges` no connect flow), testes dos workers e webhooks, upload manual (o gap Kabilio mais barato de fechar), e só então o trabalho de fundo do gap analysis: extração rica → classificação contabilística → export.

### A condicional

Esta recomendação assume o Gabify como produto standalone com a equipa atual. Se a intenção estratégica for que **toda** a engenharia da casa convirja na Wireclay Foundation (um só runbook operacional, um só modelo de segurança auditado, partilha de módulos entre produtos), então o cálculo muda: nesse cenário, (c) com porte deliberado dos providers e do pipeline — tratando o Gabify atual como protótipo validado — é defensável, e quanto mais cedo melhor, porque o custo do porte cresce com cada módulo novo (e o gap analysis mostra que ~65% do caminho até ao modelo Kabilio ainda está por construir, seja em que stack for). O que não é defensável é adiar a decisão: cada semana de features novas em cima do sessionStorage e do onboarding quebrado é trabalho que vai ser refeito.

---

## Apêndice — Achados por severidade

| # | Severidade | Achado | Localização |
|---|---|---|---|
| 1 | CRÍTICA | Signup aberto associa qualquer utilizador ao primeiro Office | `src/lib/auth-adapter.ts:23-33` |
| 2 | CRÍTICA | Loop aprovar/rejeitar/enviar é client-side sessionStorage; sem persistência, envio, EmailReview ou AuditLog | `src/lib/dashboard-store.tsx`, `src/components/dashboard/email-detail.tsx:35-51` |
| 3 | ALTA | OutlookProvider nunca cria EmailAttachment → anexos Outlook nunca são processados | `src/server/email-providers/OutlookProvider.ts:291-361` |
| 4 | ALTA | RBAC ausente — roles nunca verificados | todas as rotas em `src/app/api/` |
| 5 | ALTA | Webhooks fail-open (Graph sem env var; Gmail sem header Authorization) | `graph/route.ts:43`, `gmail/route.ts:27` |
| 6 | ALTA | Workers e webhooks sem qualquer teste | `src/queues/`, `src/app/api/webhooks/` |
| 7 | MÉDIA | `watchChanges` nunca invocado — sistema vive de polling 30s | `email-sync.worker.ts:114` |
| 8 | MÉDIA | `.env.example` documenta vars erradas (AZURE_AD_* vs MICROSOFT_*) | `.env.example` |
| 9 | MÉDIA | mock-data.ts como dependência de produção; MOCK_CLIENTS em UI real | `document-table.tsx:92`, `document-parse.worker.ts:7` |
| 10 | MÉDIA | Race condition em geração de draft (sem unique constraint) | `document-parse.worker.ts:241-245` |
| 11 | MÉDIA | `test:coverage` quebrado (@vitest/coverage-v8 não instalado) | `package.json` |
| 12 | MÉDIA | List endpoints sem paginação (viola regra própria) | `clients/route.ts:72` |
| 13 | MÉDIA | Docs técnicos desalinhados (Next 14 vs 16, TODOs resolvidos, coverage stale) | `docs/technical/OVERVIEW.md` |
| 14 | MÉDIA | Rate limiting ausente (regra própria exige) | webhooks + APIs |
| 15 | BAIXA | JWT session 24h congela officeId/role; modelo Session da BD não usado | `src/lib/auth.ts:11` |
| 16 | BAIXA | EmailThread sem officeId (lookup global) | `schema.prisma:262` |
| 17 | BAIXA | document-parse não escreve JobLog (regra própria exige) | `document-parse.worker.ts` |
| 18 | BAIXA | AuditLog "imutável" é atualizado após criação (`entityId: 'pending'`) | `document-parse.worker.ts:319-353` |
| 19 | BAIXA | `toEmails`/`ccEmails`/`bodyHtml` nunca preenchidos | ambos os providers |
| 20 | BAIXA | Lixo: ficheiro `console.log(j.id` na raiz; worktrees abandonadas; scripts de debug com erros de tsc | raiz, `.claude/worktrees/`, `scripts/` |
