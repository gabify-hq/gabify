# SPEC_GABIFY_V2_ADDENDUM.md — Revisão A (iteração adversarial)

**Este documento CORRIGE e SOBREPÕE-SE à spec base (`SPEC_GABIFY_V2.md`) nos pontos abaixo.**
Em caso de conflito: ADDENDUM > SPEC base. O agente lê ambos antes de começar.
Os IDs (A1, A2, …) são referenciados no `ACCEPTANCE_GABIFY_V2.md`.

---

## A1 — [CRÍTICO] Dinheiro NUNCA em float (corrige §3.1 da spec base)

A spec base definiu `totalBase`, `totalVat`, `grandTotal`, etc. sem tipo. Float/`number` para dinheiro é proibido.

- Colunas monetárias no Prisma: `Decimal @db.Decimal(14, 2)`. Taxas de IVA: `Decimal @db.Decimal(5, 2)`. FX rate: `Decimal @db.Decimal(12, 6)`.
- Dentro de JSONB (`vatBreakdown`, `documentLines`): valores monetários como **strings decimais** (`"123.45"`) ou inteiros em cêntimos — escolher UMA convenção, documentá-la em `docs/technical/OVERVIEW.md`, e aplicá-la em todo o lado. Recomendado: cêntimos inteiros em JSONB, `Decimal` em colunas.
- Toda a aritmética (coerência Σbases+ΣIVA−retenção=total, somas de export, resumo IVA) usa `decimal.js` ou aritmética inteira de cêntimos — nunca `+` sobre `parseFloat`.
- Tolerância de coerência definida em cêntimos (2 cêntimos), não em float.

## A2 — [SEC] Anti-lockout e limites do modelo de convites (corrige §0.1)

Gaps do fluxo de convites da spec base:

- **Anti-lockout:** é proibido remover/despromover o último OWNER de um office. `DELETE /api/users/:id` e mudanças de role validam: se o alvo é OWNER e é o único ⇒ 409 com mensagem clara. (Padrão anti-lockout da casa.)
- **Anti-escalada:** um convite nunca pode ter role superior ao de quem convida; como só OWNER convida nesta versão, validar na mesma (defesa em profundidade para quando ACCOUNTANT puder convidar).
- **Revogação:** `DELETE /api/invitations/:id` (OWNER) — convite pendente revogado deixa de ser aceitável.
- **Um user = um office** nesta versão. Convite para email que já tem User noutro office ⇒ 409 (`EMAIL_ALREADY_REGISTERED`), não fusão silenciosa. Multi-office fica fora de scope.
- **Reenvio:** `POST /api/invitations/:id/resend` regenera token (o antigo invalida) e reenvia; rate-limited.
- **Enumeração:** respostas do fluxo de aceitação/magic-link não distinguem "email não existe" de "sem convite" (mensagem única neutra).

## A3 — [SEC] Máquina de estados do draft com guarda de transição (corrige §0.2)

- Transições válidas explícitas: `PENDING_REVIEW → {APPROVED_SENT, APPROVED_SEND_FAILED, REJECTED}`; `APPROVED_SEND_FAILED → {APPROVED_SENT (retry), REJECTED}`. Qualquer outra transição ⇒ 409.
- **Concorrência:** approve e reject simultâneos não podem ambos vencer. Implementar com `UPDATE ... WHERE status = 'PENDING_REVIEW'` (transição condicional na BD) — quem perde a corrida recebe 409 com o estado atual. Não usar read-then-write.
- **Retry de envio falhado:** `POST /api/emails/:emailId/draft/retry-send` — só de `APPROVED_SEND_FAILED`; máximo 3 tentativas registadas; cada tentativa audita.
- **Edição pós-decisão proibida:** `PATCH .../draft` só em `PENDING_REVIEW`; noutro estado ⇒ 409.

## A4 — [SEC] Validação de ficheiros por magic bytes + limites de anexos (corrige §0.3 e §2.1)

- Todo o ficheiro que entra (upload manual, anexo de email, caixa dedicada) é validado por **magic bytes** (`file-type` ou equivalente), não pela extensão nem pelo Content-Type declarado. Mismatch (extensão diz PDF, bytes dizem executável) ⇒ rejeitado e logado.
- Anexos de email: cap de 25MB por anexo e 15 anexos por mensagem processados; excedentes ignorados com log (não crash do sync).
- ZIP: máximo 50 entradas, profundidade 1 (ZIP dentro de ZIP não expande), tamanho descomprimido total ≤100MB (proteção zip-bomb — verificar tamanhos declarados ANTES de extrair; rácio de compressão >100:1 ⇒ rejeitar).
- Antivírus fica fora de scope; registar em RELEASE_NOTES como recomendação de produção (ex.: scanning no R2/CDN).

## A5 — [SEC] Endurecer a caixa de email dedicada (corrige §2.2)

A spec base não tratou spoofing/abuso do endereço de ingestão:

- O `token6` sobe para **token de 10+ chars** (alfabeto sem ambíguos) — o endereço é um segredo de baixo valor mas não pode ser adivinhável por enumeração de slugs.
- Verificação SPF/DKIM/DMARC: usar os resultados que o provider de inbound fornece nos headers/payload; falha dura de DMARC ⇒ quarentena (documento criado com flag `SENDER_UNVERIFIED`, nunca processamento silencioso... nem rejeição silenciosa — vai à fila de revisão).
- **Allowlist opcional por cliente** (`Client.allowedSenderDomains[]`): quando definida, remetentes fora da lista ⇒ quarentena com flag.
- Rate limit por endereço de ingestão (ex.: 100 emails/hora) — proteção contra bombing que consome parsing IA (custo real em €).
- **Decisão de provider para execução autónoma:** implementar `InboundEmailProvider` (interface) + adaptador Resend Inbound + **adaptador de teste** (endpoint dev-only protegido por secret que simula receção). Se a conta Resend não tiver Inbound ativo, o agente NÃO bloqueia: entrega com o adaptador de teste funcional + documentação de ativação, e regista em RELEASE_NOTES. (Remove o risco de bloqueio identificado na revisão.)

## A6 — Controlo de custo e dependências no split multi-fatura (corrige §2.3)

- Cap de páginas para o passo IA de deteção de fronteiras: PDFs >50 páginas não vão à IA — flag `TOO_LARGE_FOR_AUTOSPLIT`, revisão manual. (Um PDF de 500 páginas custaria € reais por tentativa.)
- Deteção determinística por QR primeiro (custo zero) mantém-se sem cap.
- Dependência para gerar PDFs filhos: `pdf-lib` é permitida (biblioteca, não infraestrutura — G0 refere-se a infra como Redis/filas/BDs). Registar a adição no RELEASE_NOTES.
- Cache do resultado de split por hash do ficheiro (`sha256` do binário): re-upload do mesmo PDF não repete chamadas IA.

## A7 — Concorrência na revisão de documentos (corrige §4.1)

Dois contabilistas a rever o mesmo documento em simultâneo não estava tratado:

- `Document` ganha `version Int @default(1)` (optimistic locking). Toda a ação de review envia `expectedVersion`; mismatch ⇒ 409 com o estado atual (a UI recarrega e mostra "documento atualizado por outro utilizador").
- Transições de estado do documento também condicionais na BD (mesmo padrão do A3): `UPDATE ... WHERE status IN (estados de origem válidos)`.
- Bulk review: cada item com a sua verificação; relatório por item distingue `CONFLICT` de `FORBIDDEN` de `OK`.

## A8 — Normalização e constraint de duplicados (corrige §3.5)

- `documentNumber` normalizado antes de persistir/comparar: trim, colapso de espaços internos, uppercase. Guardar o original em `documentNumberRaw` se diferente.
- A unique constraint condicional (só origem QR/XML, campos não nulos) implementa-se como **índice único parcial em SQL puro** dentro da migração Prisma (`CREATE UNIQUE INDEX ... WHERE ...` — Prisma schema não expressa parciais; usar migração custom). Colisão na escrita ⇒ tratar como `DUPLICATE_SUSPECT`, nunca 500.

## A9 — Export: separadores, re-export e reabertura (corrige §6.1–6.2)

- **Formato CSV único e coerente** (a spec base contradizia-se): separador `;`, decimais com **vírgula**, UTF-8 com BOM — é o que o Excel PT abre corretamente com duplo-clique. Documentar no cabeçalho do ficheiro (`# formato: pt-PT; separador ;; decimal ,`). O `.xlsx` usa tipos numéricos nativos (sem ambiguidade).
- **Re-export:** `POST /api/exports` aceita `includeExported: true` para reemitir períodos (o gabinete perde ZIPs). Docs já `EXPORTED` não mudam de estado; o export fica ligado aos mesmos docs (tabela `ExportDocument` N:M para rastreabilidade — que export levou que documento).
- **Reabertura de documento exportado:** fora de scope automatizar retificação, mas é preciso uma válvula: ação `reopen` (OWNER apenas, auditada com motivo obrigatório) devolve `EXPORTED → VALIDATED` para correção antes de re-export. Sem isto, um erro descoberto pós-export é um beco sem saída.

## A10 — Fixtures de teste auto-suficientes (desbloqueia TDD sem ficheiros reais)

O agente não tem faturas reais. As fixtures são sintéticas e geradas no repo:

- `tests/fixtures/generate.ts` — script que gera os PDFs/imagens/XMLs de fixture de forma determinística (pdf-lib para PDFs; payload QR AT como **string decodificada** construída segundo a Portaria 195/2020 — os testes do parser QR alimentam a string, não precisam de decodificar imagem; para o caminho de leitura de QR em imagem, gerar QR real com `qrcode` a partir do payload).
- Conjunto mínimo (referenciado no ACCEPTANCE): `fx-qr-single.pdf` (fatura c/ QR válido, 1 taxa), `fx-qr-multirate.pdf` (QR com I/J/K multi-taxa), `fx-noqr-invoice.pdf` (fatura texto sem QR), `fx-recibo-verde.pdf` (retenção na fonte), `fx-ciuspt.xml` (UBL válido), `fx-xml-random.xml`, `fx-multi-invoice.pdf` (3 faturas com QRs distintos), `fx-ticket.jpg`, `fx-sheet-valid.csv`/`fx-sheet-2bad.csv`, `fx-zipbomb.zip` (rácio alto, pequeno), `fx-fake-pdf.exe.pdf` (magic bytes errados).
- Fixtures comitadas OU geradas em `pretest` — decisão do agente, mas o `npm run test` tem de ser auto-suficiente num clone limpo.

## A11 — Chaves de rate limiting (corrige §1.4)

Definir a chave por classe de endpoint (a spec base não dizia):
- Auth/magic-link e aceitação de convites: por **email alvo + IP** (5/hora por email).
- Uploads e import-sheet: por **userId** (60/hora) e por **officeId** (300/hora).
- Webhooks Graph/Gmail: por **subscriptionId/conta** (não por IP — vêm de IPs da Microsoft/Google).
- Caixa de ingestão: por **ingestAddress** (100/hora, ver A5).
- APIs gerais: por **sessão/userId** (600/hora).
Limites em env vars com estes defaults.

## A12 — Correções pontuais herdadas do AUDIT que a spec base referiu mas não atribuiu a tarefa

- **Achado #18 (AuditLog `entityId: 'pending'` + update):** refatorar `document-parse.worker.ts:319-353` — criar o AuditLog só quando o `entityId` é conhecido, antes da ação externa (G5 já o exige; fica aqui a tarefa explícita na Fase 0.5).
- **Encriptação de tokens:** migrar AES-256-CBC → **AES-256-GCM** (authenticated encryption) em `crypto.ts`, com re-encriptação lazy dos tokens existentes no próximo refresh (ler CBC, gravar GCM; suportar ambos na leitura durante a transição via prefixo de versão no ciphertext). Fase 1.
- **Timezone:** constante única `APP_TZ = 'Europe/Lisbon'` usada em `parsePtDate`, agrupamentos de export por mês e dashboard de período — fecho de mês às 23:59:59 de Lisboa, não UTC.

## A13 — Âmbito da Fase 5 reconfirmado (anti scope-creep)

A revisão confirma a decisão da spec base, com uma clarificação: a sugestão de IVA dedutível/parcial/não dedutível é **sugestão com flag**, nunca decisão. Casos com regras fiscais de dedutibilidade limitada (viaturas, deslocações, refeições — 621x/625x) ⇒ SEMPRE `NEEDS_REVIEW` de IVA na primeira ocorrência por fornecedor; só a regra de fornecedor criada pelo humano automatiza a partir daí. O sistema não faz interpretação fiscal autónoma — é o contabilista que decide, o Gabify lembra-se.

---

## Ordem de leitura para o agente
1. `AUDIT_GABIFY.md`
2. `SPEC_GABIFY_V2.md`
3. **este ADDENDUM** (sobrepõe-se à spec)
4. `ACCEPTANCE_GABIFY_V2.md` (define os testes RED de cada fase — escrever ANTES de implementar)
