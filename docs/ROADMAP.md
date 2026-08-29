# Deck — Roadmap & build tracker

> Living doc. What Deck is, what's shipped, and what we want to build next.
> Live at **https://deck.fctool.co.za** · code `~/team/projects/deck/` → `/root/deck/`.
> Last updated 2026-08-16 (SAST).

Deck = Deric's personal project tracker. Each project = name · status · description ·
client · deadline · a single to-do list · links · files. Single-user, desktop-first,
mobile-responsive. Built on the Tempo mould (Express + node:sqlite + React/Vite + PM2 + nginx).

---

## ✅ Shipped

| Feature | Notes |
| --- | --- |
| Projects: name, status, description, bucket | Status vocab `idea → planning → in_progress → waiting → live → paused → done`; Home = two columns **Current** / **Long-term** |
| Status-coloured cards + deadline urgency pill | Card tint = status; deadline pill 🔴 overdue → 🟢 plenty; blank = no deadline |
| Drag to reorder + drag between columns | Manual order persists (this is "My order") |
| Card controls | Click status badge to change it; 🗑 delete — both without opening the project |
| Clients | Add/edit/delete with logo upload; assign per project; logo+name on cards; initials fallback |
| Voice capture 🎤 | Speak → new project card. **Browser Web Speech API** (no key). Wispr REST path built but dormant (needs a Wispr API key) |
| Single to-do list | One list (Now/Later removed); inline-edit text; drag ⠿ to sort; check/delete |
| Notes | Freeform scratchpad textarea per project; auto-saves on blur |
| Tab favicon | Deck logo (gradient ▚ mark) instead of the default globe |
| Templates (repeatable projects) | Save a project + its to-do checklist as a reusable template (`is_template` flag); ⧉ Templates modal to Create/Use/Edit/Delete; **Use** clones into a fresh board project (status in_progress, to-dos copied, deadlines reset); **Save as template** on any project. Templates hidden from the board + attention strip. Auto-scheduling NOT built (asked as follow-up). |
| Stage grouping | Toolbar **Group: Buckets / Stage**; Stage view = sections per status; **drag a card onto a stage to restage it** (or click badge). Non-destructive view. |
| Waiting strip | `status=waiting` projects surface in their own amber attention-style strip (below overdue), pulled out of columns/stages |
| Drag always-on | Grips + drag work regardless of sort/filter; while dragging the board shows manual order; drop persistence via destination `onDrop` (fixes cross-section unmount) |
| Priority lane | ★ Priority lane at the very top (above attention); drag projects in to pin (sets `priority` flag), reorder within, drag out to unpin; pulled out of columns + attention. Precedence: Priority → Attention → columns |
| Needs-attention strip | Overdue + due-today projects surface as compact horizontal cards below the toolbar (pulled out of Current, view-only), each with an inline Reschedule date picker |
| Per-to-do deadlines | Each to-do has its own due date (red when overdue/today); separate from the project-level deadline |
| Visual design | Starry-nebula background (indigo/blue/teal/magenta) + ~1cm grid + twinkling star field; cards use status-coloured **glow** (not muddy fill); depth via top-lit gradients + resting shadows |
| New Project popup | Client (+ inline "＋ New client"), deadline, to-dos, links, files all in one popup |
| Batch entry | **Add & next** (or Enter) saves and clears for the next; keeps client/status/bucket; "✓ N added" counter |
| Toolbar | Search, Sort (My order / Deadline / Status / Name), filter by Client, Reset. **View-only — never touches saved drag order.** Drag on only in My-order + no filters |

Secrets in `/root/deck/.env` (chmod 600): `SESSION_SECRET`, `DECK_PASSWORD_HASH`, `WISPR_API_KEY` (unset).

---

## 🔜 Next up — Time tracking (planned 2026-08-16, not built)

**Goal:** see how long projects *actually* take. Decisions locked: work is **mostly in the
browser**, auto-pause should be **idle-only** (not distraction-policing), and we build the
**timer in Deck first, Chrome extension after**.

### Phase 1 — Timer inside Deck (build first)
- Per-project **start/stop**; one timer at a time (starting a new project stops the last).
- Pinned **"▶ Tracking: <project> 00:12:34 [Stop]"** bar in the top bar, ticking.
- Project **Time panel**: Start/Stop, total tracked ("4h 20m across 3 sessions"), session log.
- **Editable / deletable sessions** (you'll forget to stop it — keep the numbers honest).
- **Runaway guard**: timer running 3h+ → gentle "still on this?" nudge.
- Tracked time shown on cards (open decision below).
- Data: one `time_sessions` table (project_id, start_ts, end_ts) + endpoints start/stop/active/edit.
- **Known limit:** real idle auto-pause needs the extension (the Deck tab is asleep while you
  work elsewhere). Phase 1 = manual start/stop + runaway guard. In-tab hotkey only works when
  Deck is the focused tab.

### Phase 2 — Chrome extension (after Phase 1 proven)
- Popup: pick project + start/stop; **near-global hotkey**.
- **`chrome.idle`** → after X min idle, **auto-pause** + gentle desktop notification
  ("Paused — you went idle on <project>"). Resume when active.
- Talks to Deck's API. **Idle-only** (no distraction-site lists) per Deric's call.

### Open decisions for Phase 1 (answer when we start)
- Shortcut key: a specific in-tab key (e.g. `T` = start/stop open project), or skip and save hotkeys for the extension?
- Card display: show tracked time on every card, or keep cards clean and show time only inside the project?

---

## 🏗️ Multi-user / team — Phase 1 SHIPPED 2026-08-16
Full spec → **`docs/multiuser-plan.md`**. Decisions locked: invite-only accounts · private by
default, share per project · auto activity feed · complementary to FC-PMS (internal task tracking).
- **✅ Phase 1 — Accounts (live):** users + invites tables; per-user login (email + password,
  replaced the shared password); `owner_id` on projects/clients with per-user isolation enforced
  on every route; invite-only signup via link; admin **Team** panel (invite by email → copy link).
  Deric seeded as admin (`derickrocktherock@gmail.com`, same password); his 18 projects + 7 clients
  migrated to him. DB backed up pre-migration (`data/deck.db.bak-premultiuser-*`).
- **⏳ Phase 2 — Sharing:** `project_shares`, share dialog (view/edit), "shared with me", access checks.
- **⏳ Phase 3 — Activity feed:** activity logging + feed page + unread badge.

> Login now requires **email + password** (was password-only). New members: Team → invite → send link.

## 💡 Backlog / ideas (not committed)
- Distraction-site nudges in the extension (deferred — Deric chose idle-only for now).
- Native macOS agent for true system-wide focus tracking (probably overkill).
- Optional: a Deck timer session feeds **Tempo** (keep the two apps distinct otherwise).
- Touch-drag reordering on mobile (current drag is desktop-mouse only).
- Toolbar extras: "hide Done" toggle, "overdue only" quick filter.
- Voice: upgrade the 🎤 button to the **Wispr transcription API** (needs a Wispr API key) for nicer cleanup.
- Rotate the login password + `WISPR_API_KEY` posture (secrets shared in chat during setup).

---

## How to revisit
- This roadmap: `~/team/projects/deck/docs/ROADMAP.md`
- How it works: `~/team/projects/deck/docs/how-deck-works.md`
- Developer reference: `~/team/projects/deck/CLAUDE.md`
- Original plan: `~/Documents/Claude/DV Ventures/plans/2026-08-15-deck.md`
- This planning conversation: archived via `/archive` → `outputs/conversation-archive/`
