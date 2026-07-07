# BACKLOG.md — Itens da auditoria fora do slice de correção

Transcrição dos achados **MÉDIO/BAIXO** de [REVIEW_ISSUES.md](REVIEW_ISSUES.md) que **não** foram
tocados no branch `feature/audit-fixes` (por decisão de scope — o slice fechou os CRÍTICOS,
os ALTOS e as paredes de adoção). Para triagem humana. Severidade e localização preservadas;
detalhe completo em REVIEW_ISSUES.md.

| ID | Sev. | Localização | Resumo |
|---|---|---|---|
| M-2 | MÉDIO | `src/app/login/page.tsx`, `src/lib/auth.ts:16-36` | Login promete "link válido 10 minutos"; token Auth.js dura 24h (default). Corrigir com `maxAge: 600` no provider Resend. |
| M-3 | MÉDIO | `GmailProvider.ts` (parseFromHeader/extractTextBody), `OutlookProvider.ts` (stripHtml) | RFC 2047 não descodificado no From; charset ignorado no corpo; entidades HTML PT por descodificar. Usar `mailparser` (já é dependência). |
| M-4 | MÉDIO | `src/server/services/email-classification.ts:24-305` | Código de classificação V1 morto (só usado nos próprios testes) + regressão do atalho SAFT por nome de ficheiro (não portado para o cascade V2). Apagar morto, portar SAFT. |
| M-5 | MÉDIO | `api/documents/[id]/review/route.ts:32-34`, `review-service.ts` | Correção de NIF na revisão não valida dígito de controlo (`isValidNif` existe e é usado no import); `type: z.string()` aceita enum inválido → 500. |
| M-6 | MÉDIO | `export-service.ts` (parcial), `bank-import-service.ts:454` | Matching bancário pós-import ainda síncrono no request HTTP (o export já foi movido para job neste slice). Mover `runMatchingForImport` para job. |
| M-7 | MÉDIO | `export-service.ts:116-123` | Falha de R2 num PDF durante o export omite o ficheiro do ZIP em silêncio; documento fica EXPORTED na mesma. Acumular falhas no batch e não marcar esses docs. |
| M-8 | MÉDIO | `api/webhooks/graph/route.ts:40-53` | `clientState` único global para todas as subscrições; comparação não constant-time; respostas de erro reveladoras (contra a própria regra do repo). |
| M-9 | MÉDIO | `src/server/rate-limit.ts:12` | Rate limiting em memória por instância — multiplica-se com scale-out e faz reset em cada deploy. Migrar para Redis quando houver 2.ª instância. |
| M-10 | MÉDIO | `bank-matching.ts:107-118` | Faturas emitidas nunca pontuam entidade (scoring usa só supplierNif/Name); INVOICE_RECEIPT emitidas fora dos tipos de crédito. Recebimentos ficam com sugestões fracas. |
| M-11 | MÉDIO | `extraction.ts:384-411` | Ramo de colisão P2002 (duplicado autoritativo) salta `runPostExtractionChecks` — sem wrong-client check nem registo de fornecedor nesse doc. |
| M-12 | MÉDIO | `import-service.ts:24-38` | Parser CSV naïf: `split(';')` sem aspas, separador fixo. Campos com `;` interno partem linhas (afeta folhas e extratos). Usar `csv-parse` ou equivalente. |
| M-13 | MÉDIO | `invitation-service.ts:219-241` | `resendInvitation` não escreve AuditLog (o create escreve antes do envio — G5). Adicionar `INVITATION_RESENT`. |
| M-14 | MÉDIO | `review-service.ts` (sncSource na correção) | Correção humana de accountCode mantém `sncSource: 'RULE'` quando a origem era regra — devia passar a `HUMAN`. |
| A-4* | ALTO | `api/webhooks/graph/route.ts:91`, `email-sync.worker.ts:91-97`, `schema.prisma` (EmailThread) | Jobs de sync da mesma conta correm em paralelo (jobId com Date.now(); scheduler sem jobId); EmailThread sem unique (officeId, providerThreadId) → threads duplicadas. A race de tokens foi fechada em F2.6; o dedupe de jobs e o unique ficam. *(ALTO não coberto — fora da ordem explícita do slice.)* |
| A-7* | ALTO | `draft-review-service.ts:64-112, 260-287` | Estado `APPROVED` preso se o processo cair entre a transição e o desfecho do envio — nenhuma transição sai de lá. Job de recuperação `APPROVED` estagnado → `APPROVED_SEND_FAILED`. *(ALTO não coberto pelo slice — ordem explícita do slice não o incluía.)* |
| A-8* | ALTO | `api/webhooks/gmail/route.ts:37-42` | JWT do webhook Gmail valida assinatura+audience mas não issuer/service-account — qualquer projeto GCP consegue forjar notificações. Validar `iss` + claim `email`. *(idem)* |
| A-9* | ALTO | `bank-import-service.ts:386-458` | Claim PENDING→PROCESSED antes do createMany: crash a meio deixa import "concluído" com transações em falta e sem repetição. *(idem)* |
| A-10* | ALTO | `prisma/migrations/*` | AuditLog imutável só por convenção — sem trigger `BEFORE UPDATE OR DELETE`. *(idem)* |
| B-1 | BAIXO | `document-parse.processor.ts:349-363` | Extensão de ficheiro não sanitizada pode conter `/` e entrar na chave R2. Whitelist `[a-z0-9]{1,5}`. |
| B-2 | BAIXO | `src/lib/crypto.ts:60-70` | Formato legacy CBC aceite sem autenticação enquanto existirem tokens antigos. Migração one-shot para v2 + remover ramo. |
| B-3 | BAIXO | `sidebar.tsx` (LogoutButton) | `signOut` com `callbackUrl: '/auth/signin'` inexistente — funciona por redirect em cascata. Trocar para `/login`. |
| B-4 | BAIXO | `extraction.ts:186-199` | Extração XML/UBL assume ordem dos elementos (primeiro `<cbc:Name>` pode ser do comprador). Ancorar em AccountingSupplierParty/CustomerParty. |
| B-5 | BAIXO | `export-service.ts` (zipPath) | Dois docs validados com mesmo nº+NIF geram o mesmo caminho no ZIP (um sobrescreve o outro). Sufixar com id curto em colisão. |
| B-6 | BAIXO | `api/assistant/query/route.ts:18-26` | Histórico do assistente reenviado pelo cliente sem verificação — turns `assistant` forjáveis. Assinar (HMAC) ou guardar server-side. |
| B-7 | BAIXO | `document-parse.processor.ts:263-265` | Threshold do rascunho usa o MÁXIMO das confianças dos anexos — um anexo bom entre ilegíveis autoriza rascunho que confirma tudo. Usar o mínimo ou filtrar a lista. |

## Futuro documentado (sem issue de código)

- **Alertas externos de operação** (email/notificação em JobLog FAILED): a página `/admin/jobs`
  (audit F3.12) dá a visibilidade mínima de leitura; alertar ativamente (Resend ao OWNER no fim
  dos retries, heartbeat) fica para uma fase de operação. Ver REVIEW_ISSUES A-5.
- **UX menores da auditoria** (UX_CONTABILISTA.md): onboarding/primeiros passos no gabinete
  vazio (top 10 #8), feedback de processamento assíncrono pós-upload (#9), markdown no chat do
  assistente e restantes itens de linguagem do top 10 #10 que não foram tocados neste slice
  (o breakdown M/D/E/R e o "Regex simples" das regras bancárias: breakdown corrigido em F1.4;
  o resto pendente).
