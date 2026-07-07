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

Only after you approve does anything get sent. Every decision is recorded permanently — who decided, what was decided, and when. If a reply fails to send (for example, your email provider is briefly unavailable), Gabify shows the failure clearly and lets you retry with one click. Your decision is never lost, even if you close the browser.

A draft can only be decided once: two colleagues cannot accidentally approve and reject the same draft at the same time — the first decision wins and the second person sees the updated state.

---

## Joining Gabify — invitations only

Nobody can create an account in your firm's Gabify by themselves. Access works like this:

1. The firm's owner invites a colleague by email, choosing their permission level (owner, accountant, or read-only).
2. The colleague receives an invitation link, valid for 72 hours.
3. They sign in with their email — no password, just a secure link sent to their inbox.

Invitations can be revoked or re-sent at any time. If someone who was never invited tries to sign in, nothing happens — and they can't tell whether the email address exists in Gabify or not. The firm always keeps at least one owner: the last owner can never be removed or downgraded by accident.

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

## Getting documents into Gabify

Besides email, there are three more ways documents arrive:

- **Manual upload** — drag files onto the Documents page (or tap "Fotografar" on your phone to photograph a paper receipt). Gabify checks every file is really what it claims to be before accepting it.
- **A dedicated email address per client** — each client can get their own private Gabify address (e.g. `padaria-x7k2m9@...`). Anything sent there lands directly in that client's file, no guessing needed. Suspicious senders are quarantined for your review, never processed silently.
- **Spreadsheet import** — upload a CSV/Excel of entries; Gabify proposes how the columns map, you confirm, and only then are the rows imported. Rows with invalid NIFs or totals that don't add up are reported line by line.

## What Gabify reads from each document

For Portuguese invoices with the official AT QR code, Gabify reads the fiscal data directly from the QR — supplier and buyer NIFs, document number, ATCUD, date, VAT broken down by rate, withholding and totals. That data is authoritative: no AI involved, no cost, no guessing. For everything else, AI extracts the same fields and Gabify double-checks the arithmetic (bases + VAT − withholding must equal the total) — anything that doesn't add up goes to your review queue.

A PDF containing several invoices is automatically split into individual documents. Duplicates and documents addressed to a different client are flagged, never silently accepted.

## The review queue and export

Documents that Gabify is confident about arrive **pre-validated** — one click (or one bulk click) validates them. Everything uncertain waits for you. You can teach Gabify per-supplier rules ("invoices from this supplier always go to account 6221, validate automatically") — rules are only ever created by you, and a flagged document never skips the queue, rule or no rule.

When a period is done, export it: a ZIP organised as Client/Year/Month/Type with every PDF, plus a `lancamentos.csv` that opens correctly in Portuguese Excel and an Excel file with proper numeric cells — ready to enter your accounting software. Exported documents are locked; only the firm owner can reopen one, with a mandatory reason, and everything is logged.

## Bank reconciliation

Upload a bank statement (the CSV or Excel your homebanking exports) and Gabify reads the movements — it recognises the usual Portuguese column names automatically, shows you what it understood, and only imports after you confirm. Importing the same statement twice never duplicates movements.

For each movement, Gabify looks at the validated documents of that client and suggests matches, with a transparent score: does the amount match, is the date close to the due date, is the supplier's NIF or name in the bank description, is the invoice number mentioned. Strong matches come pre-selected — you accept with one tap. A payment can be matched against several invoices at once, as long as the amounts add up. Gabify **never reconciles anything on its own**: every match is confirmed by you, every action is logged, and everything can be undone.

Recurring noise — bank fees, standing charges — can be silenced with simple rules ("if the description contains COMISSÃO, ignore it"), so your reconciliation queue only shows what actually needs your attention.

## The client portal

Your clients can now have their own login — a minimal portal, made for the phone, where they do exactly two things: **upload documents** (drag & drop on the computer, photograph a receipt on the phone) and **see the state of what they sent**. Nothing else.

What the client sees is deliberately simple. Each document shows one of three states: **Em processamento** (you're working on it), **Processado** (validated or exported), or **Devolvido** (you rejected it and they should resend). They never see your internal review states, confidence scores, duplicate flags, or anything about your accounting — that stays inside the firm.

You control access from the client's page: invite by email (the client signs in with a link, no password), see who has access, and revoke it at any moment — revocation is immediate. A portal user only ever sees the documents of their own company, and everything they upload lands in your normal intake pipeline, flagged with who sent it.

## Sending purchases to TOConline (early access — not yet field-tested)

If a client's company uses TOConline, Gabify can send their validated purchase
invoices there directly — no re-typing, no manual export. On the client's page
you connect their TOConline account (four values the client obtains from
TOConline in a couple of minutes; the screen explains exactly where), pick the
validated invoices, and press send. Gabify finds or creates the supplier by
their tax number, creates the purchase document with one line per VAT rate —
amounts exact to the cent — and records the TOConline document reference back
on the invoice. An invoice that was already sent is never sent twice, even if
you press the button again.

**Safety first:** this integration is new and has not yet been exercised
against a real TOConline account, so every connection starts in **test mode**.
In test mode nothing leaves Gabify — instead, you get a preview of exactly
what would be sent, to check line by line. Only the firm's owner can switch a
client to real sending, and Gabify asks for explicit confirmation before doing
so. Every send is logged.

**Importing issued invoices (early access too):** the same connection can also
work the other way — Gabify periodically imports the invoices the client
issues in TOConline, so their sales paperwork appears in your review queue
automatically, already exact to the cent (the numbers come straight from
TOConline, no AI guessing involved). Each invoice is imported exactly once,
with its PDF attached, and anything Gabify itself sent to TOConline is never
re-imported. You control the two directions independently on the client's
"Ligações" panel — import on, sending off, or any combination — and a
"Sincronizar agora" button fetches new invoices on demand. In test mode,
imports show you a preview of what would be created instead of creating it.

## Coming soon

### Deadline Tracker
Gabify tracks Portuguese fiscal deadlines (IVA, IRS, IRC, Social Security, IMI) and alerts you — and your clients — before anything is due.

### Automated Reminders
Automatic reminders to clients who haven't sent their monthly documents, by email now and WhatsApp later.

### More Accounting Software
TOConline purchase sending is here (early access). Primavera, Sage and sales documents are next — same idea: no re-entry, no manual export.

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

---

## Ask Gabify (assistant)

You can now ask Gabify questions about your own firm's data, in plain Portuguese — for example "EDP invoices above 100€ in May", "23% VAT total per supplier this quarter", "are there duplicate invoices?" or "unreconciled bank movements".

- Gabify answers by looking at your documents and bank movements, and shows the matching table under the answer, with a link to open those items in the review queue, documents or bank screens.
- Any table in an answer can be downloaded as a CSV file that opens correctly in Excel.
- The assistant is read-only by design: it can never create, change, send or delete anything — it only consults. Every question is recorded in the activity log.
- It only sees the data of your own firm. Nothing from any other firm is ever visible.
- The conversation is not stored: when you leave the page, the chat starts fresh.

---

## Importing issued invoices from billing software

If a client issues invoices in **Moloni** or **InvoiceXpress**, Gabify can import those issued invoices automatically, so you do not have to ask the client for them.

- On the client page, under **Ligações**, connect the client's Moloni or InvoiceXpress account with the credentials shown there (stored securely, never displayed again).
- Once connected and switched on, Gabify checks for new issued invoices about every half hour, and you can also press **Sincronizar agora** at any time.
- Imported invoices arrive already organised, with the amounts and VAT exactly as issued — Gabify does not re-read or guess anything, because the data comes straight from certified billing software. They appear alongside the client's other documents, ready for review.
- These are the client's **issued** invoices (what they sold). Nothing is ever sent back to Moloni or InvoiceXpress — the connection only reads.
- Each connection shows its status, the last sync time, how many documents were imported, and any error, plus a clear notice that the connection has **not yet been tested against the real service**.

> Coming soon: importing from other billing platforms (Jasmin, Vendus, Primavera) using the same one-way, read-only approach.

## What changed after the first full audit (July 2026)

Gabify went through a complete engineering and usability audit, and the biggest findings
were fixed straight away:

- **Invitation links now work end to end.** Clicking the link in an invitation email opens
  a proper page that recognises the invite, explains everything in Portuguese (including
  expired or already-used invitations), and sends the sign-in link — no passwords, ever.
- **Every document shows up, whatever the way in.** Files uploaded by hand, sent by clients
  through the portal, imported from spreadsheets or pulled from billing software now appear
  in the Documents page and in each client's history, with a small label saying how each
  one arrived.
- **Exporting has a proper screen.** Pick the clients and the months, press Export, and
  Gabify builds the ZIP in the background — the history below shows progress and gives you
  the download button when it is ready.
- **Gabify works on the phone.** The menu collapses into a drawer on small screens, so
  reviewing documents or accepting bank matches at a client's office actually works.
- **Rejecting a document asks first — and can be undone.** One accidental click no longer
  makes a document disappear for good.
- **Bank movements without a suggestion can be matched by hand.** Search the client's
  validated documents by number or supplier and link them; Gabify still checks that the
  amounts add up.
- **Duplicate questions now have answer buttons.** When Gabify asks "Duplicado?", you can
  archive the duplicate or say the documents are distinct.
- **The export files are safer.** Supplier names with unusual characters no longer break
  the CSV, and invoices with Azores/Madeira VAT rates keep their amounts in the file.
- **The office owner can see what ran overnight.** A new screen lists every background
  task (email syncs, document processing, exports) and shows failures in red.
