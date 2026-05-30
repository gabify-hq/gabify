# Gabify — Product Context

## What is Gabify

Gabify is an operational platform for Portuguese accounting firms.
It is an **intelligent intake and workflow layer** that sits BEFORE accounting software (Primavera, TOConline, Sage).

It does **not replace** accounting software — it organises the operational chaos that happens before that.

## Problem it solves

Portuguese accounting firms operate in constant chaos:
- Client emails unanswered or misclassified
- Documents (invoices, receipts, bank statements) buried in email folders
- Accountants spending 30-40% of their time on manual intake work
- Clients who don't know what was received, processed, or is missing
- No traceability of who did what and when

## Value proposition

Gabify automatically processes operational chaos using AI — but always with the accountant in the decision loop.
The accountant approves with 1 click. AI never acts alone in the external world.

---

## Planned modules

### ✅ Module 0 — Foundation (complete)
Infrastructure: Prisma schema, clients (R2, Anthropic, Resend), EmailProvider abstraction, BullMQ workers.

### 🔨 Module 1 — Email Copilot (Phase 1 complete, Phase 2 in progress)
**Agent that processes the accountant's inbox.**

Flow:
1. Reads inbox via Microsoft Graph API (Outlook) or Gmail API
2. Classifies email by client — matching by known email or domain
3. Extracts and archives attachments to Cloudflare R2
4. Classifies documents by **content** using Claude AI (never by filename)
5. Generates reply draft for accountant approval
6. Accountant approves / edits / rejects with 1 click
7. Only after approval: email is sent, document is archived

Email providers (priority order):
- Microsoft Graph API (priority — most common in PT firms, Outlook)
- Gmail API
- IMAP (stub/fallback only)

Interface `EmailProvider`: `syncInbox()`, `getAttachment()`, `sendReply()`, `watchChanges()`

**Phase 2 (current):** Accountant dashboard UI with mock data — inbox list, pending approvals, client status.

### 📋 Module 2 — Client Portal (future)
Self-service portal for the accounting firm's clients.
- Client uploads documents via drag & drop (no email)
- Magic link only — clients never create a password
- Monthly checklist of required documents
- Accountant sees everything organised by client and fiscal period
- Notifications when documents are missing
- Shareable invite link for onboarding

### 📄 Module 3 — AI Document Parser (future)
Deep document classification and extraction.
- PDF OCR + Claude content analysis — never by filename
- Extraction: NIF, amounts, dates, document type
- Cross-reference with client records
- Confidence scoring with manual review fallback

### 📊 Module 4 — Dashboard & Deadline Tracker (future)
Status of each client and Portuguese fiscal obligations.
- Client status: complete / incomplete / missing documents
- Portuguese fiscal calendar: IVA, IRS, IRC, SS, IMI, etc.
- Automatic alerts for accountant and client
- Obligation status: pending / submitted / confirmed
- AT (Autoridade Tributária) integration

### 🔔 Module 5 — Automated Reminders (future)
Proactive communication with clients.
- Email reminders now (via Resend)
- WhatsApp integration later
- Configurable reminder schedules by document type and fiscal period
- Escalation logic when clients don't respond

### 📦 Module 6 — Organised Export (future)
Structured document export.
- ZIP export organised as: `Client/Year/Month/DocumentType`
- Filterable by client, period, document type
- Audit trail included in export

### 🔗 Module 7 — Accounting Software Integration (future)
Direct send to Portuguese accounting software — no manual re-entry.

Targets:
- **TOConline** — via REST API (public documentation available)
- **Primavera BSS** — via API or supported import file formats
- **Sage** — via API or structured export

Capabilities:
- Send classified documents directly to accounting software
- Map Gabify document types to each system's accepted types
- Log every send in AuditLog with confirmation receipt
- Fallback to organised ZIP export when API unavailable

> **Architecture note:** Even though this module is built after Email Copilot and Dashboard are functional, the architecture must accommodate it from the start — schema fields and types should be prepared.

---

## Core principles

### 1. AI as copilot, never pilot
Every action that affects the outside world (sending email, notifying client, filing document) **requires explicit accountant approval**. No exceptions.

### 2. Full traceability
Everything AI does is logged in `AuditLog` with timestamp, model used, and who approved.
AuditLog is immutable — never deleted, never edited.

### 3. Private documents by default
Attachments in Cloudflare R2 never have public access.
Always signed URLs with maximum 1-hour expiry.

### 4. Zero-friction onboarding
- CSV import for existing clients
- Automatic client detection by sender email/domain
- Shareable invite link for client onboarding
- Clients never create a password — magic links always

### 5. Content-based classification
Documents are **always** classified by extracted text content, never by filename.
A file called `doc_final_v3.pdf` is meaningless — the content tells the truth.

### 6. Portuguese of Portugal (PT-PT)
UI, AI-generated emails, error messages — all in PT-PT, not PT-BR.
Dates in DD/MM/YYYY. Currency in €X,XX. Timezone Europe/Lisbon.

### 7. Designed for accountants, not startups
Dense, functional interface. Tables over cards. No visual excess.
The user spends 8h/day in this — speed and clarity before aesthetics.

---

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 14 App Router + TypeScript | strict mode |
| UI | Tailwind CSS + shadcn/ui | base components |
| Database | PostgreSQL + Prisma ORM | migrations only |
| Jobs | BullMQ + Redis | email sync, doc parse |
| Storage | Cloudflare R2 | signed URLs, private |
| Auth | Auth.js v5 | magic links, no passwords |
| Email | Resend | magic links + notifications |
| AI | Claude API (Anthropic) | classification + drafts |
| Deploy | Railway | web + workers separate |

---

## User personas

### Accountant (primary user)
- 35-55 years old, Portugal
- Uses Primavera or TOConline daily
- Receives 50-200 emails/day from clients
- Main pain: manual intake, lost documents, clients who don't send what's needed
- Wants: less time on admin, more time on value-adding work
- Conservative — uses Outlook, not Gmail

### Firm owner (secondary user)
- Wants visibility on what the team is processing
- Wants metrics: response time, documents processed, active clients
- Wants new accountants to onboard quickly

### Firm client (tertiary user — Module 2+)
- Business owner or individual
- Wants to know what's pending, what was received
- Wants clear communication without email back-and-forth
- Will never create a password — uses magic links

---

## Portuguese market context

- **Dominant accounting software**: Primavera BSS (market leader), TOConline (cloud), Sage
- **Tax authority**: Portal das Finanças (AT — Autoridade Tributária)
- **Social security**: Segurança Social Direta
- **Recurring fiscal obligations**: IVA (monthly/quarterly), IRS (annual), IRC (annual), SS (monthly), IMI (annual)
- **NIF** (Número de Identificação Fiscal): 9 digits — key field in all documents
- **Dates**: DD/MM/YYYY format, Europe/Lisbon timezone
- **Regulation**: GDPR applies, financial data is sensitive data
- **Communication preference**: email (Outlook dominant), moving to digital but conservative
