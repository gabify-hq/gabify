# Client Portal (Portal do Cliente Final) — v1

External-facing surface where each office's end-clients (the companies whose
documents Gabify processes) log in to upload documents and check the state of
their own. Nothing else. **Highest-sensitivity module of the product — external
users inside the system. Whenever convenience and isolation conflict, isolation
wins.**

## Role model (P1)

- `UserRole.CLIENT` + `User.clientId` (required iff role=CLIENT — CHECK
  constraint `User_client_role_check`; mirrored on `Invitation`).
- `can()` matrix: CLIENT holds ONLY `portal:document:read` and
  `portal:document:upload`. Zero internal actions. Internal roles hold zero
  portal actions (symmetric isolation). Granting internal `document:read/upload`
  to CLIENT would have opened `/api/documents`, `/api/documents/import` and
  `/api/attachments` (internal DTOs) — hence dedicated actions.
- Invitations: `POST /api/invitations` with `role: 'CLIENT'` requires a
  `clientId` of the caller's own office (422 without, 404 cross-tenant).
  Action is `clientInvitation:manage` (OWNER + ACCOUNTANT); internal
  invitations remain OWNER-only (`invitation:manage`). Acceptance copies
  role+clientId exclusively from the invitation row (anti-escalation, defence
  in depth over A2). `PATCH /api/users/[id]` refuses role changes of/to CLIENT
  (409/422) — revoke + re-invite is the only path.
- Rate limits (external users): API 30/min (`RATE_LIMIT_CLIENT_API_PER_MIN`),
  upload 10/min (`RATE_LIMIT_CLIENT_UPLOAD_PER_MIN`) — applied in `guard()` and
  the portal upload route.

## Portal API with masking (P2)

| Endpoint | Action | Notes |
|---|---|---|
| `GET /api/portal/documents` | `portal:document:read` | Paginated (cursor 50/200), `q` filename search. clientId comes ONLY from the session. |
| `POST /api/portal/documents/upload` | `portal:document:upload` | Same pipeline as manual upload (magic bytes A4, zip-bomb, 25MB/10 files) via `intakeUploadedFiles`; body `clientId` ignored; source `PORTAL_UPLOAD`; AuditLog `PORTAL_DOCUMENT_UPLOADED` per document with the CLIENT user. |
| `GET /api/portal/documents/[id]/download` | `portal:document:read` | Signed URL TTL **5 min** (never the internal 15). Own clientId only — anything else 404. |

**DTO** (`src/server/services/portal-service.ts`, built field-by-field — never
spread): `{ id, filename, submittedAt, origin, status }`.

**Public status map** (mandatory masking; PT labels rendered in the UI):

| Internal | Public code | UI label |
|---|---|---|
| any pre-validation status/flag (A_REVER, PRE_VALIDATED, DUPLICATE_SUSPECT, WRONG_CLIENT_SUSPECT, PENDING_CLASSIFICATION, …) | `PROCESSING` | Em processamento |
| VALIDATED, EXPORTED | `PROCESSED` | Processado |
| review-rejected (soft-deleted) | `RETURNED` | Devolvido |

Internal statuses, AI confidence, duplicate flags, SNC accounts and rules NEVER
leave the boundary — a strict shape test (exact keys) guards against future
leaks by spread. SPLIT parents are excluded from the listing (internal
artifact; child invoices appear individually).

## UI (P3)

- `/portal` layout of its own (never the dashboard shell): nav = Documentos,
  Carregar, Sair. Mobile-first (bottom nav bar), pt-PT.
- `/portal` — list with public statuses, filename search, cursor pagination.
- `/portal/upload` — drag&drop + camera, multiple files, per-file feedback
  (reuses `UploadDocuments` with `endpoint`/`showClientSelector` props).
- Role split (double barrier, both consuming `src/lib/area-redirect.ts`):
  dashboard layout redirects CLIENT → `/portal`; portal layout redirects
  internal roles → `/inbox`; root `/` lands by role. The edge proxy stays an
  optimistic cookie check (database sessions — §1.2), so the real barriers are
  the two layouts.
- Office side: client page section "Acessos do portal"
  (`PortalAccessManager`) — invite, see states, revoke invitation, revoke
  active access. OWNER + ACCOUNTANT.
  - `GET /api/clients/[clientId]/portal-access` — users + invitations of that client.
  - `DELETE /api/clients/[clientId]/portal-access/[userId]` — soft-deletes the
    CLIENT user, deletes their Session rows (immediate revocation) and writes
    AuditLog `PORTAL_ACCESS_REVOKED`. Internal users / other clients' users → 404.

## Out of scope (v1)

Notifications to the end-client, document comments, one CLIENT user across
multiple clients, automatic chasing, bulk download, any aggregated financial
visibility.

## Known TODOs

| TODO | Notes |
|---|---|
| Portal invitation email copy is the generic invite text | Works (link + expiry); a portal-specific wording would be friendlier. |
| Rate limiting is in-memory per instance | Same A11 trade-off as the rest of the app; acceptable for single-instance deploys. |
