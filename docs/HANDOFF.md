# Deck — HANDOFF (read this first)

> Continue-here doc for the next conversation. Last updated 2026-08-19 (SAST).
> Full roadmap: `ROADMAP.md` · how it works: `how-deck-works.md` · dev ref: `../CLAUDE.md`.

## What it is
Deck = personal project tracker, now **multi-user** for Full Chair. Each member has their own
private Deck. Live at **https://deck.fctool.co.za**. Deric = admin
(`derickrocktherock@gmail.com`, password `Derickrock123!` — rotate-worthy, shared in chat).

## Access / deploy (the routine I use every change)
- **Box:** Hetzner `178.104.39.179` via `ssh-server` MCP (server name `hetzner`).
- **Runs:** PM2 process `deck`, port 3007, Node 24 (`/opt/nodejs`), `--env-file=/root/deck/.env`.
  nginx → TLS (certbot). Code at `/root/deck/`; local mirror `~/team/projects/deck/`.
- **Deploy a change:**
  1. `cd ~/team/projects/deck && npm run build:frontend`
  2. `tar czf /tmp/x.tgz server.js lib frontend/dist` (include only what changed; `lib` if db/auth changed)
  3. upload via `mcp__ssh-server__ssh_upload` → `/root/deck-x.tgz`
  4. on box: `cd /root/deck && tar xzf /root/deck-x.tgz -C /root/deck && rm …`; if server/db changed
     `/usr/bin/pm2 restart deck --update-env`; frontend-only = no restart needed.
  5. verify asset hash: `curl -s https://deck.fctool.co.za/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'`
- **Before any DB/auth migration:** back up first —
  `cp /root/deck/data/deck.db data/deck.db.bak-<what>-$(date +%Y%m%d-%H%M%S)`.
- **Secrets:** `/root/deck/.env` (chmod 600): `SESSION_SECRET`, `DECK_PASSWORD_HASH`,
  `DECK_ADMIN_EMAIL`, `WISPR_API_KEY` (empty — voice uses browser engine).
- Migrations are additive `ALTER … ADD COLUMN` wrapped in try/catch in `lib/db.js` (safe on every boot).
- **User must hard-refresh** (Cmd-Shift-R) after a frontend deploy — hashed asset caches.

## Shipped features (all live)
- Projects: name, status, description, client, **project deadline**, **per-to-do deadlines**,
  notes, bucket (Current/Long-term).
- To-dos: ONE inline-editable, drag-sortable list (Now/Later removed); check/delete; per-todo due date.
- Links, file uploads. Clients (name + logo, per-owner); assign per project; logo/initials on cards.
- Voice capture 🎤 (browser Web Speech API → new project card; Wispr REST path built but dormant).
- New-project popup: client (+ inline new client), deadline, to-dos, links, files; **Add & next** batch entry.
- Toolbar: search · Sort (My order/Deadline/Status/Name) · Client filter · **Group: Buckets / Stage** · Reset (all view-only, remembered in localStorage).
- **★ Priority lane** (top): drag any card in to pin; reorder; drag out to a column to unpin.
- **⚠ Needs attention** strip: overdue + due-today, compact cards + inline reschedule.
- **⏳ Waiting** strip: `status=waiting` projects, same attention-card style (amber). **Drag any
  card onto this strip to park it** (sets `status=waiting`); the strip appears as a drop target
  whenever a drag is in progress (empty-state hint included). **Waiting now beats Needs Attention** —
  a parked card that's also overdue shows in Waiting, not the overdue strip, so it stops nagging.
- **Stage view** (Group→Stage): sections per status; **drag a card onto a stage to restage it** (or click its badge).
- Cards: click status badge to change stage, 🗑 delete — without opening. Dragging is ALWAYS on
  (grips show regardless of sort/filter); while dragging the board shows manual order.
- **Multi-user:** invite-only accounts (admin **Team** panel → invite by email → copy link →
  they set their own password), per-user isolation on every route, per-project `owner_id`.
- **Templates** (⧉): reusable project + to-do checklist; **Use** clones a fresh copy; **Save as template** on any project.
- Design: starry-nebula bg + ~1cm grid; status-coloured glow cards; Deck favicon.
- Board order top→bottom: **Priority → Needs attention → Waiting → Current/Long-term (or Stage groups)**.

## Gotchas / lessons (important)
- **Board drag is POINTER-based, not HTML5 (rewritten 2026-08-19).** Native HTML5 `draggable`
  proved too flaky (cards wouldn't pick up at all — `user-select:none` blocks it on WebKit, child
  images steal the drag, browser differences). It's gone. Drag is now driven by pointer events in
  `Home.jsx` (`onPointerDown/Move/Up` in the drag hook): a card fires `onPointerDown`; past a 6px
  threshold it becomes a drag (`draggingId` set, `body.dragging-active`); `document.elementFromPoint`
  finds the target — `[data-card-id]`/`[data-lane-zone]` in buckets view (live reorder), `[data-stage]`
  in stage view (drop → `setStatus`); under-threshold release = a click that opens the project.
  Contract to preserve when adding drop zones: **cards need `data-card-id` + `data-lane`; lane
  containers need `data-lane-zone`; stage sections need `data-stage`.** No `draggable` attribute anywhere.
- **Drag + React unmount:** moving a card between containers (priority↔column, attention→priority,
  stage restage) unmounts the source element mid-drag, so its `onDragEnd` may not fire → card stuck
  transparent + not saved. FIX pattern (already applied): the destination container has
  `onDragOver preventDefault` + `onDrop={() => dnd.onDragEnd()}` to persist + clear `draggingId`.
  Keep this in mind for any new drop zone.
- View transforms (sort/filter/priority/attention/waiting/stage) are all **non-destructive** — they
  never rewrite stored order; only explicit drags persist (`sort`, `bucket`, `priority`) or status.
- `is_template=1` projects are hidden from the board + all strips.

## Key files
- Backend: `server.js` (routes + owner scoping), `lib/db.js` (schema + migrations + admin seed),
  `lib/auth.js` (scrypt hash/verify).
- Frontend `frontend/src/`: `App.jsx` (shell, auth, modals), `Home.jsx` (board: toolbar, priority,
  attention, waiting, stage grouping, all DnD), `ProjectDetail.jsx`, `Login.jsx`, `InviteSignup.jsx`,
  `MembersModal.jsx`, `TemplatesModal.jsx`, `ClientsManager/Picker`, `VoiceCapture.jsx`, `constants.js`, `styles.css`.

## What's next (not built — pick up here)
1. **Time tracker** — Phase 1 (in-app per-project start/stop timer) planned; decisions locked
   (mostly-browser, idle-only, timer-first). Then a Chrome extension for idle auto-pause. Open Qs:
   shortcut key, show time on cards.
2. **Project sharing (multi-user Phase 2)** — `project_shares`, share dialog (view/edit),
   "shared with me", access checks extend `ownedProject`. (Phase 3 = activity feed.)
3. **Template auto-scheduling** (recur on a cadence) — deferred; on-demand is enough for now.
4. Nice-to-haves: touch-drag on mobile, "hide Done", rotate the login password + secrets.
