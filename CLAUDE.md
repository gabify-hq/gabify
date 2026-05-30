# CLAUDE.md — Gabify

> Visão completa do produto, todos os módulos e contexto de mercado: ver **CONTEXT.md**

## O que é o Gabify

Plataforma operacional para gabinetes de contabilidade portuguesa.
Camada inteligente de intake e workflow **antes** do software de contabilidade (Primavera, TOConline, Sage).
Não substitui o software de contabilidade — organiza o caos operacional antes disso.

## Módulos (roadmap)

| Módulo | Estado | Descrição |
|---|---|---|
| 0 — Fundação | ✅ | Schema, clientes, EmailProvider, workers |
| 1 — Email Copilot | 🔨 em construção | Inbox → classificação → drafts → aprovação |
| 2 — Client Portal | 📋 futuro | Upload self-service por clientes |
| 3 — Document Vault | 📋 futuro | Repositório estruturado, pesquisa por conteúdo |
| 4 — Deadline Tracker | 📋 futuro | Prazos fiscais PT, alertas, estado obrigações |
| 5 — Communication Hub | 📋 futuro | Canal centralizado cliente ↔ gabinete |

**Scope actual: Módulo 1 — Email Copilot.**

---

## Princípio central: AI como copiloto, nunca piloto

Toda a ação que afeta o exterior (enviar email, notificar cliente, arquivar documento) **requer aprovação explícita do contabilista**.

- Drafts gerados, nunca enviados automaticamente
- Tudo registado em `AuditLog` com timestamp + quem aprovou
- Contabilista tem sempre 1-click approve / edit / reject
- AuditLog é imutável — nunca apagado, nunca editado

---

## Stack

- **Next.js 14** App Router + TypeScript (strict mode)
- **PostgreSQL** + Prisma ORM (migrations only, never `db push` em prod)
- **BullMQ** + Redis (email sync + document parse workers)
- **Cloudflare R2** (attachments — signed URLs, nunca público)
- **Auth.js v5** magic links (sem passwords)
- **Resend** (outbound email)
- **Claude API** (classificação de documentos + geração de drafts)
- **Deploy**: Railway (web + 2 workers separados)

---

## Email Providers (ordem de prioridade)

1. **Microsoft Graph API** — delta queries para sync incremental (prioritário — mais comum em PT)
2. **Gmail API** — Pub/Sub push notifications
3. **IMAP** — polling fallback, stub apenas

Sempre codificar contra a interface `EmailProvider`. Nunca chamar código específico de provider em lógica de negócio.

---

## Comandos essenciais

```bash
npm run dev                                      # Next.js dev server
npm run worker:email                             # BullMQ email sync worker
npm run worker:documents                         # BullMQ document parse worker
npx prisma migrate dev --name <semantic-name>    # criar migration
npx prisma generate                              # regenerar client após schema change
npx prisma studio                                # GUI da base de dados
npx tsc --noEmit                                 # type check
npm run lint                                     # lint
```

---

## Estrutura do projecto

```
prisma/
  schema.prisma          — schema completo
  config.ts              — Prisma 7 config (pg adapter)

src/
  types/index.ts         — enums e tipos globais
  lib/
    prisma.ts            — singleton Prisma client
    r2.ts                — R2 upload + signed URLs
    anthropic.ts         — Claude API client
    resend.ts            — Resend client
    redis.ts             — BullMQ connection config
    auth.ts              — Auth.js v5 magic links
  server/
    email-providers/
      EmailProvider.ts   — interface (syncInbox, getAttachment, sendReply, watchChanges)
      OutlookProvider.ts — Microsoft Graph (delta queries)
      GmailProvider.ts   — Gmail API (Pub/Sub)
      ImapProvider.ts    — IMAP stub
      index.ts           — createEmailProvider factory
    services/
      client-matching.ts         — email → cliente por domain/email
      email-classification.ts    — Claude API: classify docs + drafts PT
  queues/
    email-sync.worker.ts         — sync inbox + match clientes + queue attachments
    document-parse.worker.ts     — R2 upload + text extract + AI classify + AuditLog
  app/
    api/webhooks/graph/route.ts  — Microsoft Graph change notifications
    api/webhooks/gmail/route.ts  — Gmail Pub/Sub push
    api/auth/[...nextauth]/      — Auth.js handlers
    dashboard/                   — TODO: overview
    inbox/                       — TODO: email copilot UI
    clients/                     — TODO: gestão clientes
    settings/                    — TODO: email account connections
  components/                    — UI components (shadcn/ui base)
```

---

## Regras críticas

### Segurança
- R2: **sempre signed URLs**, nunca URL pública. Expiração máx 1h documentos, 15min previews
- OAuth tokens: encrypted antes de guardar na DB, nunca em logs
- Webhooks: verificar assinatura (Graph HMAC, Gmail JWT) antes de processar
- AuditLog: entrada criada **antes** de qualquer ação exterior, não depois

### Prisma
- `prisma migrate dev --name <semantic-name>` — sempre com nome descritivo
- **Nunca** `prisma db push` fora de dev scratch
- Após mudança de schema: `prisma generate` antes de escrever código de serviço

### EmailProvider interface
```typescript
interface EmailProvider {
  syncInbox(): Promise<SyncResult>
  getAttachment(messageId: string, attachmentId: string): Promise<Buffer>
  sendReply(messageId: string, draft: EmailDraft): Promise<void>
  watchChanges(webhookUrl: string): Promise<WatchResult>
}
```
Nunca bypassar este interface. Lógica de negócio deve ser agnóstica ao provider.

### TypeScript
- Strict mode sempre activo
- Sem `any` — usar `unknown` e narrowing
- Todas as rotas API validam body com Zod antes de tocar na DB

### BullMQ Workers
- Workers devem ser idempotentes (seguros para retry)
- Sempre logar início/fim do job em `JobLog`
- Falhas: exponential backoff, máx 3 retries

### Contexto PT
- UI e emails gerados em **Português de Portugal** (PT-PT, não PT-BR)
- Datas: DD/MM/YYYY
- NIF: 9 dígitos — extrair de documentos sempre que presente
- Fuso horário: Europe/Lisbon
