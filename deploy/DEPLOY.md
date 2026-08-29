# Deploy — Deck

Target: **`deck.fctool.co.za`** on the Hetzner box (nginx -> :3007, PM2 `deck`,
Let's Encrypt TLS). Same pattern as Tempo / FC-PMS / Full Chair Studio. Runs under Node 24
(`/opt/nodejs`). Port **3007** (3006 = Tempo).

## 0. DNS  ← the one manual step
Add an A record `deck.fctool.co.za -> 178.104.39.179` before requesting a cert.

## 1. Build the frontend (locally)
```bash
cd ~/team/projects/deck
npm install
npm run build:frontend      # produces frontend/dist
```

## 2. Ship the code
Upload the project to `/root/deck/` (exclude node_modules, .env, data). Then on the box:
```bash
cd /root/deck
/opt/nodejs/bin/npm install --omit=dev
```
`frontend/dist` is shipped prebuilt, so no frontend build is needed on the box.

## 3. Secrets — /root/deck/.env (chmod 600)
```
PORT=3007
NODE_ENV=production
SESSION_SECRET=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
DECK_PASSWORD_HASH=<node scripts/hash-password.mjs 'the-password'>
```
```bash
chmod 600 /root/deck/.env
```

## 4. PM2
```bash
cd /root/deck
/opt/nodejs/bin/pm2 start server.js --name deck --interpreter /opt/nodejs/bin/node
/opt/nodejs/bin/pm2 save
```
Health check: `curl -s localhost:3007/api/me` -> `{"authed":false}`.

## 5. nginx reverse proxy
`/etc/nginx/sites-available/deck.fctool.co.za`:
```nginx
server {
  server_name deck.fctool.co.za;
  client_max_body_size 30M;   # file uploads (server cap is 25 MB)
  location / {
    proxy_pass http://127.0.0.1:3007;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
```bash
ln -s /etc/nginx/sites-available/deck.fctool.co.za /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d deck.fctool.co.za
```
`trust proxy` is on and the session cookie is `secure` in production, so TLS is required for
login to stick.

## 6. Verify
- `https://deck.fctool.co.za` loads the login.
- Log in, create a project, add a to-do, upload a file, download it back.

## Updating later
Rebuild frontend locally, re-upload `frontend/dist` + changed server files, `pm2 restart deck`.
Data (SQLite at `data/deck.db`) and uploads (`data/uploads/`) persist across restarts — back
them up with the box's backup tooling. Sessions live in memory, so a restart = one re-login.
