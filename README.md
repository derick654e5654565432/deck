# Deck

Personal project tracker — a simple home for the things Deric is carrying. Single-user, desktop-first + mobile-responsive. Not a team board (that's FC-PMS) and not a time tracker (that's Tempo); Deck holds the **state** of each project.

- **Model:** a project = name · status · description · bucket (`current` / `longterm`), with to-dos (each `now`/`later`), links, and uploaded files.
- **Status vocab:** `idea → planning → in_progress → waiting → live → paused → done`.
- **Stack:** Express + `node:sqlite` (`DatabaseSync`) + `express-session` + scrypt auth + multer uploads, static React/Vite frontend. PM2.
- **Live:** https://deck.fctool.co.za (nginx → :3007, Node 24).

## Run locally
```bash
npm install
cp .env.example .env          # set SESSION_SECRET + DECK_PASSWORD_HASH
node scripts/hash-password.mjs 'your-password'   # → paste hash into .env
cd frontend && npm install && npm run build && cd ..
node server.js
```

Deploy notes: see [`deploy/DEPLOY.md`](deploy/DEPLOY.md). Docs: [`docs/`](docs/).
