# Gabify

Plataforma operacional para gabinetes de contabilidade portuguesa. Camada inteligente de intake e workflow antes do software de contabilidade (Primavera, TOConline, Sage).

**Módulo 1 (actual):** Email Copilot — lê a inbox, classifica por cliente, arquiva anexos, classifica documentos com AI, gera rascunhos para aprovação.

---

## Setup Local

### Pré-requisitos

- Node.js 20+
- PostgreSQL 15+
- Redis 7+

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
# Editar .env.local com as tuas credenciais
```

### 3. Base de dados

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Correr em desenvolvimento

```bash
# Terminal 1 — Next.js
npm run dev

# Terminal 2 — Worker email sync
npm run worker:email

# Terminal 3 — Worker document parse
npm run worker:documents
```

---

## Configurar Microsoft Graph API (Outlook)

1. Vai a [portal.azure.com](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps)
2. **New registration** → Nome: `Gabify`, Tipo: Web
3. **Redirect URI**: `http://localhost:3000/api/auth/callback/azure-ad`
4. **API permissions** → Add:
   - `Mail.Read` (delegated)
   - `Mail.Send` (delegated)
   - `Mail.ReadWrite` (delegated)
5. **Certificates & secrets** → New client secret → copiar para `AZURE_AD_CLIENT_SECRET`
6. Copiar **Application (client) ID** → `AZURE_AD_CLIENT_ID`
7. Copiar **Directory (tenant) ID** → `AZURE_AD_TENANT_ID` (ou usar `common` para multi-tenant)

**Webhook (change notifications):**
- Endpoint: `https://teu-dominio.com/api/webhooks/graph`
- `GRAPH_WEBHOOK_SECRET` é segredo HMAC para validar notificações

---

## Configurar Gmail API

1. Vai a [console.cloud.google.com](https://console.cloud.google.com/)
2. Cria novo projecto ou usa existente
3. **APIs & Services** → Enable:
   - Gmail API
   - Cloud Pub/Sub API
4. **OAuth 2.0 credentials** → Web application
   - Redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Copiar Client ID → `GOOGLE_CLIENT_ID`
   - Copiar Client Secret → `GOOGLE_CLIENT_SECRET`
5. **Pub/Sub** → Create topic: `gabify-gmail`
   - Copiar nome completo → `GMAIL_PUBSUB_TOPIC`
   - Criar subscription com Push endpoint: `https://teu-dominio.com/api/webhooks/gmail`
6. **OAuth consent screen** → Adicionar scopes:
   - `gmail.readonly`, `gmail.send`, `gmail.modify`

---

## Cloudflare R2

1. Vai a [dash.cloudflare.com](https://dash.cloudflare.com/) → R2
2. Criar bucket: `gabify-attachments` (private — sem acesso público)
3. **Manage R2 API tokens** → Create token com `Object Read & Write`
4. Copiar Account ID, Access Key ID, Secret Access Key → `.env.local`

---

## Deploy (Railway)

```bash
# Configurar variáveis no Railway dashboard
# railway.toml define 3 serviços: web, worker:email, worker:documents
railway up
```

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14 App Router + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Base de dados | PostgreSQL + Prisma ORM |
| Jobs | BullMQ + Redis |
| Storage | Cloudflare R2 |
| Auth | Auth.js v5 (magic links) |
| Email | Resend |
| AI | Claude API (Anthropic) |
| Deploy | Railway |
