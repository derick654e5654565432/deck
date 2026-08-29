# Deck — Deric's personal project tracker

A nice, simple home for the **things Deric is carrying**. Pen-and-paper stays his capture
tool; Wispr Flow stays his meeting recorder. Deck holds the **state** of each thing: where
it is, what's open, what's long-term, its links and its documents. **Multi-user with
sharing** (admin + invited members; Deric + Tara today), desktop-first + mobile-responsive.

Not FC-PMS (team task board) and not Tempo (time tracker). This is Deric's own portfolio view
that he can selectively share for handoffs.

## Multi-user & sharing (added 2026-08-22)
- **Users/roles:** `users` (admin | member), invite-by-token `signup`, admin-only Team panel.
  Everything is scoped by `owner_id`; a member sees only their own stuff until something is
  shared with them.
- **Sharing** (owner-initiated): `project_shares` (share one project) + `client_shares` (share
  a whole client → sharee sees every project under it). Sharee = **collaborator**: can add/tick
  to-dos, post notes, add links/files; **cannot** rename/restage/delete/share (owner-only).
- **Attribution + handoff:** `todos.created_by` + `todos.assignee_id`; assign any to-do to a
  person. **My Tasks** view (`GET /api/tasks`) = assigned-to-me + handed-off-by-me across all
  projects. Attributed **notes thread** (`project_notes`, author + timestamp) alongside the
  owner's freeform **Scratchpad** (`projects.notes`).
- Access resolved server-side in `projectAccess()` (owner | collaborator | none); `access_users`
  in project detail is the valid assignee set. See `plans/2026-08-22-deck-sharing-collaboration.md`
  in DV Ventures for the full design.
- **Home "Shared" group** (Group selector: Buckets | Stage | Shared): gathers every collaborative
  project — shared *with* me (`shared`) OR shared *by* me (`shared_out`, with `shared_with_names`) —
  laid out by stage. Cards badge direction ("🤝 from X" / "🤝 with Y").
- **Always-visible Shared card** on every project detail (`SharedCard`, built from `access_users`):
  "This project is shared with X" (owner, with inline manage) / "Shared with you by Y" (collaborator).

## Recurring projects + tasks (2026-08-23)
- **Recurring project** = `projects.recurring=1`. Kept OFF the normal board (`/api/projects` filters
  `recurring=0`); lives in the **Recurring view** (`/api/recurring` → projects + their todos + due data).
  Toggle on a project detail (owner) or create from the Recurring view.
- **Recurring to-do** = `todos.recurrence` (daily|3x_week|2x_week|weekly|biweekly|monthly) + `last_done_at`.
  Ticking a recurring to-do **logs a completion** (sets `last_done_at=now`, keeps `done=0`) so it stays
  live and becomes **due again** after its cadence period (`RECUR_DAYS`; server `isDue()`, mirrored in
  frontend `recurDue()`). Due-tracking is retrospective — no scheduler.
- **Recurring view** (nav 🔁): "Due now" roll-up across all recurring projects + one card per recurring
  project (its tasks, due pills, assignees, shared-with chips) + a new-recurring-project creator.
- `/api/tasks` surfaces recurring assigned-to-me tasks **only when due**. All recurring projects/tasks
  are shareable + assignable like any other. Assignees must already have access (share first, then assign).

## Password vault (2026-08-23)
- Separate **🔐 Vault** nav section. **Admin adds/edits/deletes** credentials (name, url, username, password,
  notes); each is **shared per-item** with users who then view + copy. No master password — access = normal
  Deck login (product decision); members see only what's shared with them, admin sees all.
- **Secrets encrypted at rest** (`lib/vault-crypto.js`, AES-256-GCM). Key = `VAULT_KEY` in `.env` (64 hex);
  falls back to a key derived from `SESSION_SECRET` if unset. NOT zero-knowledge — server decrypts for
  authorised users (required for "just log in and get it"). Decrypted secret is **reveal-on-demand**
  (`GET /api/vault/:id/reveal`), never in the list response.
- Tables `vault_items` (owner=admin) + `vault_shares`. Endpoints: `GET /api/vault`, `POST/PUT/DELETE /api/vault[/:id]`
  (admin), `/:id/reveal` (owner/shared), `/:id/shares` (admin). Frontend `VaultView.jsx` (Show/Hide + Copy per field).
- **New secret:** `/root/deck/.env` now also holds `VAULT_KEY` (chmod 600). Rotating it makes existing vault
  secrets undecryptable — re-enter them if rotated.

## Client roles & responsibilities (2026-08-24)
- Separate **🧾 Roles** nav section: a **per-client checklist** of everything to deliver (its own thing, NOT
  a project). Pick a client → editable list of `item` rows grouped by `heading` rows, with a done/total
  progress bar. Table `client_responsibilities` (client_id, kind item|heading, text, done, sort).
- **Access = client access:** client owner + anyone the client is shared with (reuses `client_shares`).
  Owner adds/edits/deletes/reorders (▲▼ buttons, no drag); shared users can **tick items done**. Endpoints:
  `GET/POST /api/clients/:id/responsibilities`, `PUT/DELETE /api/responsibilities/:id`, `.../reorder`.
  Frontend `ResponsibilitiesView.jsx`. Cascades on client delete.

## Explicit move buttons (2026-08-24)
- Cards carry **☆ Pin/★ Unpin** + **→ Long-term/→ Current** buttons (owner-only, alongside the still-working
  drag). Pin persists via `PUT /api/projects/:id` (now accepts `priority`). Admin board splits into
  **★ My priority** + **🤝 Shared priority** rows + a **🤝 Shared with the team** section (personal vs shared).

## Stack (clone of the Tempo mould)
Express + `express-session` + `node:sqlite` (`DatabaseSync`) + scrypt password auth + **multer**
(uploads) + static React/Vite build. PM2 on the box, nginx + certbot.

## Data model (`lib/db.js`)
- **clients** — name, logo (uploaded image: `logo_stored` on disk in `data/uploads/`, `logo_mime`), sort
- **projects** — name, status, description, bucket (`current` / `longterm`), **deadline**
  (`YYYY-MM-DD` or null = no deadline), **client_id** (nullable → clients), **notes** (freeform scratchpad), sort (drag order; lower = higher in column)
  - status: `idea → planning → in_progress → waiting → live → paused → done`
    (single source of truth = `STATUSES` in `lib/db.js`, mirrored in `frontend/src/constants.js`)
  - cards are tinted by **status** colour; deadline drives an urgency **pill**
    (red overdue → green plenty), computed in `constants.js` `deadlineInfo()`
- **todos** — project_id, text (inline-editable), done, sort (single drag-sortable list; `horizon` column still exists but is deprecated/ignored — the Now/Later split was removed 2026-08-16)
- **links** — project_id, label, url  (auto-prefixes `https://`, auto-labels from host)
- **files** — project_id, original_name, stored_name (uuid on disk), mime, size
  - stored under `data/uploads/`; cascade-deleted from disk when a project is deleted

## API (all under `/api`, all require auth except me/login)
- `POST /login` · `POST /logout` · `GET /me`
- `GET /projects` (list + counts) · `GET /projects/:id` (full) · `POST /projects` · `PUT /projects/:id` · `DELETE /projects/:id`
- `POST /projects/reorder` — body `{ items: [{id, bucket, sort}] }`, persists drag order + re-bucketing
- `GET /clients` · `POST /clients` (multipart: name + optional `logo` file) · `PUT /clients/:id` (multipart) · `DELETE /clients/:id` (un-tags projects) · `GET /clients/:id/logo` (serves image; cache-busted with `?v=updated_at`)
- `GET /voice/status` → `{ configured }` · `POST /voice/transcribe` — body `{ audio (base64 16kHz WAV), language? }` → `{ text }` (proxies to Wispr Flow with the server-side `WISPR_API_KEY`; browser never sees the key)
- `POST /projects/:id/todos` · `PUT /todos/:id` (text/done) · `DELETE /todos/:id` · `POST /todos/reorder` (`{items:[{id,sort}]}`)
- `POST /projects/:id/links` · `DELETE /links/:id`
- `POST /projects/:id/files` (multipart, field `file`, 25 MB cap) · `GET /files/:id/download` · `DELETE /files/:id`

## Frontend (`frontend/src/`)
- `App.jsx` — auth gate + shell + client-side view switch (home ↔ project detail) + new-project modal
- `Home.jsx` — two columns: **Current** / **Long-term**, project cards with status badge + counts
- `ProjectDetail.jsx` — editable name/status/description/bucket, **Now | Later** to-do columns, Links, Files (drag-to-upload)
- `Login.jsx`, `NewProjectModal.jsx`, `StatusBadge.jsx`, `constants.js`, `styles.css` (calm dark theme)

## Run locally
```bash
cd ~/team/projects/deck
npm install
npm run build:frontend
node server.js            # http://localhost:3007  (dev: any non-empty password logs in)
```
Or live-reload the UI: `cd frontend && npm run dev` (proxies /api to :3007).

## Deploy
See `deploy/DEPLOY.md`. Target `deck.fctool.co.za` (PM2 `deck`, :3007). The one manual
step is the DNS A-record; then certbot. Secrets in `/root/deck/.env` (chmod 600):
`SESSION_SECRET`, `DECK_PASSWORD_HASH`. Never print; rotate on exposure.

## Conventions
- SAST. Timestamps are epoch-ms.
- `data/` (DB + uploads) is gitignored and lives only on the running box — it's the source of truth.
- Seed data (`lib/db.js`) only populates a fresh DB; safe to delete those example projects.
