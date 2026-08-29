# How Deck works

> Plain overview so anyone (incl. future-you) can understand Deck without reading the code.
> Full developer detail lives in `../CLAUDE.md`.

## What it is
A private, single-user **web app** — your personal project tracker. You open a URL in any
browser (desktop or phone); it's password-gated to just you. It is **not** a native/desktop app.

- **Live:** https://deck.fctool.co.za (domain is **fctool.co.za**, not fullchairagency.com)
- **Login:** password only (set on the server; no signup).

## The pieces (and where they run)
```
Your browser  ──HTTPS──►  nginx (on the Hetzner box, 178.104.39.179)
                              │  reverse-proxies to
                              ▼
                          Deck server (Node/Express, PM2 "deck", port 3007)
                              │  reads/writes
                              ▼
                          SQLite file  +  uploaded files   (in /root/deck/data/)
```
- **Frontend** = React (built to static files the server serves). The screens you click.
- **Backend** = a small Express server + a `node:sqlite` database file. Stores everything.
- **Files & client logos** live on the box under `data/uploads/`.
- **Code:** `~/team/projects/deck/` on your Mac (the mirror) → deployed to `/root/deck/` on the box.

## The model (what a "project" holds)
- **Name · Status · Description · Client · Deadline · Bucket** (Current / Long-term)
- **To-dos** — one list, each editable, drag to sort, tick to complete
- **Links** — labelled URLs (resources)
- **Files** — uploaded documents
- **Clients** are their own thing (name + logo); a project points at one.

## How saving works
There is **no Save button** — everything saves the moment you do it: add a to-do (Enter or ＋ Add),
add a link (Add), drop a file (uploads instantly), change status/deadline/name/order (saves on the spot).

## The board (home screen)
- Two columns: **Current** and **Long-term**. Cards show client (logo+name), name, status, deadline pill, counts.
- **Toolbar**: Search · Sort (My order / Deadline / Status / Name) · filter by Client. Sorting/filtering
  is **view-only** — your dragged "My order" is never overwritten.
- On each card you can change status or delete without opening it.
- **＋ New project** builds a whole project (client, deadline, to-dos, links, files) in one popup;
  **Add & next** lets you rattle down a notebook list without leaving the popup.
- **🎤 Speak** dictates a new project card (browser voice; no key needed).

## Deploying a change (the routine)
1. Edit code in `~/team/projects/deck/`, `npm run build:frontend`.
2. Ship changed files to `/root/deck/` (tar → upload → extract).
3. `pm2 restart deck` if the server changed (frontend-only changes just need the new `dist`).
4. Data (`data/deck.db` + `data/uploads/`) persists across restarts — the box is the source of truth.

See `../deploy/DEPLOY.md` for the full first-time deploy (DNS + certbot).
