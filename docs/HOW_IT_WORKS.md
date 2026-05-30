# How Gabify Works

Gabify is an intelligent operations layer for Portuguese accounting firms. It sits between your email inbox and your accounting software — organising the chaos so you can focus on the work that matters.

---

## The problem Gabify solves

Every day, accounting firms receive dozens of emails from clients: invoices, bank statements, payslips, tax documents. Someone has to read each one, figure out which client it belongs to, download the attachments, classify the documents, and reply. That's hours of manual work every day — before any actual accounting happens.

Gabify automates that intake process. You stay in control. The AI does the sorting.

---

## Core principle: you always approve

Gabify's AI never sends an email, files a document, or takes any external action on its own. Every AI suggestion waits for your explicit approval.

- The AI drafts a reply → you approve, edit, or reject it
- The AI classifies a document → you confirm or correct it
- Nothing reaches the outside world without your say-so

Every action is logged with a timestamp and your name. Full audit trail, always.

---

## Module 1 — Email Copilot

### What it does

The Email Copilot connects to your inbox (Outlook or Gmail) and processes incoming emails automatically in the background.

### Step by step

**1. Email arrives**
A client sends an email to your firm's inbox. Gabify detects it within seconds via a direct connection to Microsoft Outlook or Gmail.

**2. Client identification**
Gabify checks who sent the email and matches it to a client in your system — by their exact email address, or by their company's email domain. If a match is found, the email is linked to that client automatically.

**3. Attachments are secured**
Any attached files (PDFs, Word documents, images) are downloaded and stored securely in private cloud storage. Files are never publicly accessible — every time you need to view one, a temporary secure link is generated that expires after one hour.

**4. Documents are classified**
Gabify reads the content of each document (not just the filename — a file called `doc_final_v3.pdf` tells you nothing). Using AI, it identifies what type of document it is:

- Supplier invoice
- Client invoice
- Receipt
- Bank statement
- Payslip
- Tax document
- AT communication (Autoridade Tributária)
- Social security document
- Contract
- Balance sheet
- Income statement

If the AI is confident (85%+), it classifies automatically. If it's uncertain, it flags the document for your review.

**5. Reply draft is generated**
For emails that need a response, Gabify generates a draft reply in natural Portuguese. The draft sounds like it was written by you — not by a machine. It follows the context of the original email and uses professional but natural language.

**6. You review and act**
In the Gabify dashboard, you see:
- Incoming emails, organised by client
- Documents that have been classified and archived
- Draft replies waiting for your approval

For each draft, you can:
- **Approve** — sends the reply as-is
- **Edit** — modify the text, then send with your changes
- **Reject** — discard the draft, handle manually

Only after you approve does anything get sent. Every decision is recorded with a timestamp.

---

## The dashboard

Gabify's dashboard has three main sections:

### Inbox
The inbox shows all emails received by your firm, ordered by date. Unread emails are highlighted. Emails with pending AI drafts are clearly marked so you can prioritise them. Clicking any email opens the detail view — the original email on the left, the AI draft on the right.

### Clients
The clients view shows the documentation status for each client for the current period. Clients are grouped into three categories:

- **Complete** — all expected documents received
- **Incomplete** — some documents received, others still missing
- **Missing** — no documents received yet

Each client card shows a progress bar, the list of missing documents, and the period. Clicking a client opens their full profile with email history and all archived documents.

### Documents
The documents view shows every file that Gabify has received and classified. You can filter by client, document type, and period. Each row shows the filename, document type, extracted amount, AI confidence score, and current status.

Documents marked **"Rever"** (Review) are ones where the AI was less confident — these need your confirmation before being treated as final.

---

## Coming soon

### Client Portal
Clients get a personal link (no password needed) where they can upload documents directly — no more attachments by email.

### Deadline Tracker
Gabify tracks Portuguese fiscal deadlines (IVA, IRS, IRC, Social Security, IMI) and alerts you — and your clients — before anything is due.

### Automated Reminders
Automatic reminders to clients who haven't sent their monthly documents, by email now and WhatsApp later.

### Accounting Software Integration
Send classified documents directly to TOConline, Primavera, or Sage — no re-entry, no manual export.

---

## Your data

- Documents are stored in private cloud storage (Cloudflare R2) and are never publicly accessible
- Every AI action is logged with a timestamp and the name of the person who approved it
- OAuth credentials for connecting your email are encrypted and never stored in plain text
- Gabify complies with GDPR

---

## Supported email providers

| Provider | Connection method | Status |
|---|---|---|
| Microsoft Outlook / Microsoft 365 | Microsoft Graph API | Supported |
| Gmail / Google Workspace | Gmail API | Supported |
| Other (IMAP) | Standard IMAP protocol | Coming soon |
