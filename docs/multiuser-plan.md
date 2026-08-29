# Deck → multi-user (team) — implementation plan

> Turns Deck from single-user into a team platform for Full Chair: accounts, shared
> projects, and a stay-in-the-loop activity feed. **Not built yet — awaiting Deric's sign-off
> on the 3 decisions below.** Drafted 2026-08-16.

## ⚠️ Decisions assumed (CONFIRM before building)
These are the recommended defaults; change any and the plan flexes.
1. **Signup** = **invite-only via link** — Deric adds an email → invitee gets a link to set
   their own password. Self-serve but gated. (Alt: admin-creates each / open signup.)
2. **Sharing** = **private by default + share per project** — your projects are yours; you
   invite specific people to specific projects (view or edit). (Alt: everyone sees all / a
   shared-vs-private toggle.)
3. **Stay in the loop** = **auto activity feed** — a feed of "Una added a to-do to X",
   "Sam set status to Waiting", auto-logged across projects you can see. (Alt: manual posted
   updates / both.)

## Big picture
Every project gets an **owner** and a **share list**. Login moves from one shared password to
**per-user accounts**. The API must enforce access on **every** project + child endpoint.
This is the largest change to date — it touches almost every route.

## Purpose (confirmed 2026-08-16)
Deck-for-team is an **internal** tool: every Full Chair member gets their **own private Deck**
to track their own tasks and what they need to do. Sharing a project lets a colleague follow
"where it is and what's happening." It is NOT client-facing.

## Relationship to FC-PMS (confirmed complementary)
- **FC-PMS** = client-facing: reverts/approvals + multi-step tracking *with the client*, on work
  outside Full Chair.
- **Deck (team)** = internal: staff tracking their *own* work, with optional per-project sharing
  to keep colleagues in the loop.
They don't overlap. Reuse FC-PMS's auth pattern (bcrypt, express-session, roles).

## Schema changes (`lib/db.js`)
- **users** — id, email (unique), name, password_hash, role (`admin` | `member`), created_at
- **invites** — id, email, role, token (unique), invited_by, accepted_at, created_at, expires_at
- **projects** — add `owner_id` (→ users)
- **clients** — add `owner_id` (clients are per-owner, or shared — see open Q)
- **project_shares** — id, project_id, user_id, role (`view` | `edit`), created_at
- **activity** — id, project_id, actor_id, verb, detail (JSON/text), created_at
- **activity_reads** — user_id, last_seen_at  (for the unread count)
- Migration: seed **Deric as the first admin** (email `derickrocktherock@gmail.com`, keep his
  current password hash), set `owner_id` = Deric on all existing projects/clients.

## Auth rewrite (`server.js`)
- `POST /api/login` = email + password (bcrypt/scrypt), per-user session (`req.session.userId`).
- `POST /api/signup` = accept invite token → set name + password → creates the user.
- `GET /api/me` returns the logged-in user (id, name, role).
- `requireAuth` loads the user; add `canView(projectId,user)` / `canEdit(...)` helpers
  (owner OR share row) enforced on every project, todo, link, file, note, timer route.
- Admin-only: `GET/POST /api/users`, `POST /api/invites` (generate link), `DELETE /api/users/:id`.

## Sharing
- Projects are **private to their owner** unless a `project_shares` row grants access.
- `GET /api/projects` returns **owned + shared-with-me** (with an "owner" + "shared" marker).
- Share dialog on a project: add a user by name/email, pick **view** or **edit**, revoke.
- Child writes (todos/links/files/notes/status/order) require **edit**; reads require **view**.

## Activity feed (stay in the loop)
- Log an `activity` row on meaningful changes (create project, status change, add/complete todo,
  add link/file, share, rename). Actor = current user.
- **Feed page** (top-bar entry, e.g. a bell with an unread count): shows events across projects
  you can see, newest first, grouped by project/day. This is the "stay in the loop, not buried
  in the project" surface. Optional later: email/WhatsApp digest.

## UI work
- **Login + Signup** screens (signup only reachable via invite link).
- **Members** panel (admin): list users, invite by email (copy link), set role, remove.
- **Share** control on each project (owner/edit): who has access + view/edit.
- **Cards**: small owner avatar + a "shared" hint; a "Shared with me" filter in the toolbar.
- **Activity feed** page + unread badge in the top bar.

## Phasing (build order)
- **Phase 1 — Accounts:** users table, invite flow, per-user login/signup, `owner_id` migration,
  Members panel. (Deck still shows only your own projects — no behavioural change for you yet.)
- **Phase 2 — Sharing:** `project_shares`, access enforcement on all routes, share dialog,
  owned + shared-with-me, "Shared with me" filter.
- **Phase 3 — Activity feed:** activity logging, feed page, unread badge.

## Security must-dos
- **No open signup** (invite-gated). Rate-limit login. bcrypt/scrypt hashes.
- Enforce access **server-side** on every route — never trust the client to hide a project.
- File download + client-logo routes must also check project/owner access.
- Keep secrets server-side; rotate the current shared password once accounts exist.

## Rollout care (it's a live app)
- Build + test locally end-to-end first; deploy in one window; verify Deric can still log in
  **before** announcing to the team. Back up `data/deck.db` before the auth migration.
