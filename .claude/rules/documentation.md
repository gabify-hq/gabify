---
description: Documentation rules — both docs must be updated whenever relevant features are implemented or changed
---

# Documentation Rules

## Three documents, always in sync with the code

### docs/HOW_IT_WORKS.md
**Audience:** clients, non-technical stakeholders, potential customers.
**Language:** plain English — no code, no jargon, no implementation details.
**Content:** what Gabify does, how each feature works from the user's perspective, what's coming.
**Structure:** single file, grows with sections per feature.

### docs/technical/OVERVIEW.md
**Audience:** developers — cross-cutting concerns only.
**Content:** service topology, stack table, schema map, security model, testing conventions, environment variables, deployment.
**Rule:** never put module-specific detail here. Keep it at the architecture level.

### docs/technical/<module-name>.md
**Audience:** developers working on that specific module.
**Content:** data flow diagram, provider details, job queue specs, API endpoints, schema models used, known TODOs.
**One file per module:** `email-copilot.md`, `client-portal.md`, `document-parser.md`, etc.
**Create the file** when the module is started. Never leave it empty.

---

## When to update

Update **both** documents whenever you:
- Implement a new feature or module
- Change how an existing feature works (not just internal refactors)
- Add a new API endpoint or webhook
- Change the database schema significantly
- Change the security model
- Resolve a known TODO (remove it from TECHNICAL.md)
- Add new environment variables

**You do NOT need to update docs for:**
- Bug fixes that don't change user-visible behaviour
- Internal refactors that don't change behaviour
- Test additions
- Dependency upgrades

---

## HOW_IT_WORKS update rules

- Write as if explaining to an accountant with no technical background
- Never mention: database, API, queue, Redis, Prisma, BullMQ, tokens
- Use "Gabify detects", "Gabify classifies", "Gabify generates" — not "the worker processes"
- Every new user-facing feature gets its own subsection
- Keep the "Coming soon" section current — add modules as they are defined, remove when shipped

## TECHNICAL.md update rules

- Architecture diagram (ASCII) must reflect current service topology
- Stack table must include new dependencies
- Every new job queue gets a flow description
- Every new security control gets a row in the security table
- Every resolved TODO must be removed from the "Known TODOs" table
- Every new TODO must be added to the "Known TODOs" table
- Test coverage table must be updated when new test files are added
