import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.js';

// Status vocabulary (single source of truth, mirrored in the frontend).
export const STATUSES = ['idea', 'planning', 'in_progress', 'waiting', 'live', 'paused', 'done'];

// A couple of illustrative projects so the app is not an empty void on first open.
// They are only seeded into a fresh DB — delete or edit them freely.
const SEED = [
  {
    name: 'Deck (this app)',
    status: 'in_progress',
    description: 'The tracker you are looking at right now.',
    bucket: 'current',
    todos: [
      { text: 'Add my real projects from the notebook', horizon: 'now' },
      { text: 'Theme the colours the way I like them', horizon: 'later' },
    ],
    links: [{ label: 'Deploy notes', url: 'https://deck.fullchairagency.com' }],
  },
  {
    name: 'Itaga — Shopify tax fix',
    status: 'waiting',
    description: 'Waiting to enable tax-inclusive pricing in Shopify.',
    bucket: 'current',
    todos: [
      { text: 'Turn on "All prices include tax" in Shopify', horizon: 'now' },
      { text: 'Rotate the exposed client secret', horizon: 'now' },
    ],
    links: [],
  },
  {
    name: 'ARIA v2 — proper UI',
    status: 'idea',
    description: 'A real front-end for ARIA, someday.',
    bucket: 'longterm',
    todos: [{ text: 'Sketch what the dashboard should show', horizon: 'later' }],
    links: [],
  },
];

export function initDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      logo_stored TEXT,
      logo_mime   TEXT,
      sort        INTEGER NOT NULL DEFAULT 0,
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'idea',
      description TEXT NOT NULL DEFAULT '',
      bucket      TEXT NOT NULL DEFAULT 'current'
                    CHECK (bucket IN ('current','longterm')),
      deadline    TEXT,
      client_id   INTEGER,
      notes       TEXT NOT NULL DEFAULT '',
      sort        INTEGER NOT NULL DEFAULT 0,
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      text       TEXT NOT NULL,
      horizon    TEXT NOT NULL DEFAULT 'now'
                   CHECK (horizon IN ('now','later')),
      done       INTEGER NOT NULL DEFAULT 0,
      sort       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(project_id);

    CREATE TABLE IF NOT EXISTS links (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      label      TEXT NOT NULL,
      url        TEXT NOT NULL,
      sort       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_links_project ON links(project_id);

    CREATE TABLE IF NOT EXISTS files (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_name   TEXT NOT NULL,
      mime          TEXT NOT NULL DEFAULT '',
      size          INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      email       TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'member',
      token       TEXT NOT NULL UNIQUE,
      invited_by  INTEGER,
      accepted_at INTEGER,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    );

    -- A project shared with another user (they become a collaborator on it).
    CREATE TABLE IF NOT EXISTS project_shares (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       TEXT NOT NULL DEFAULT 'collaborator',
      created_by INTEGER,
      created_at INTEGER NOT NULL,
      UNIQUE (project_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pshares_user ON project_shares(user_id);
    CREATE INDEX IF NOT EXISTS idx_pshares_project ON project_shares(project_id);

    -- A whole client shared with another user → they see every project under it.
    CREATE TABLE IF NOT EXISTS client_shares (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by INTEGER,
      created_at INTEGER NOT NULL,
      UNIQUE (client_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cshares_user ON client_shares(user_id);
    CREATE INDEX IF NOT EXISTS idx_cshares_client ON client_shares(client_id);

    -- Attributed notes thread on a project (who said what, when).
    CREATE TABLE IF NOT EXISTS project_notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      author_id  INTEGER,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pnotes_project ON project_notes(project_id);

    -- Password vault: admin-added credentials, secret encrypted at rest.
    CREATE TABLE IF NOT EXISTS vault_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      url        TEXT NOT NULL DEFAULT '',
      username   TEXT NOT NULL DEFAULT '',
      secret     TEXT NOT NULL DEFAULT '',
      notes      TEXT NOT NULL DEFAULT '',
      sort       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- A vault item shared with a user (they can view + copy, not edit).
    CREATE TABLE IF NOT EXISTS vault_shares (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id    INTEGER NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by INTEGER,
      created_at INTEGER NOT NULL,
      UNIQUE (item_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_vshares_user ON vault_shares(user_id);
    CREATE INDEX IF NOT EXISTS idx_vshares_item ON vault_shares(item_id);

    -- Per-client roles & responsibilities: a big checklist of what to deliver.
    -- kind 'heading' rows group the 'item' rows beneath them.
    CREATE TABLE IF NOT EXISTS client_responsibilities (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL DEFAULT 'item',
      text       TEXT NOT NULL DEFAULT '',
      done       INTEGER NOT NULL DEFAULT 0,
      sort       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cresp_client ON client_responsibilities(client_id);

    -- Planner: a project or to-do placed on a specific day (the planning board).
    -- kind='project' → ref_id is a projects.id; kind='todo' → ref_id is a todos.id.
    -- Scheduling is personal to the owner who planned it. duration_min is how long
    -- they set aside for it; done marks the planned block complete for that day.
    CREATE TABLE IF NOT EXISTS plan_blocks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind         TEXT NOT NULL DEFAULT 'todo' CHECK (kind IN ('project','todo')),
      ref_id       INTEGER NOT NULL,
      day          TEXT NOT NULL,
      sort         INTEGER NOT NULL DEFAULT 0,
      duration_min INTEGER NOT NULL DEFAULT 60,
      done         INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plan_owner_day ON plan_blocks(owner_id, day);
  `);

  // Migrations for DBs created before these columns existed.
  try { db.exec('ALTER TABLE projects ADD COLUMN deadline TEXT'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE projects ADD COLUMN client_id INTEGER'); } catch { /* already there */ }
  try { db.exec("ALTER TABLE projects ADD COLUMN notes TEXT NOT NULL DEFAULT ''"); } catch { /* already there */ }
  try { db.exec('ALTER TABLE projects ADD COLUMN owner_id INTEGER'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE clients ADD COLUMN owner_id INTEGER'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE todos ADD COLUMN deadline TEXT'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE projects ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE projects ADD COLUMN priority INTEGER'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE todos ADD COLUMN created_by INTEGER'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE todos ADD COLUMN assignee_id INTEGER'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE todos ADD COLUMN recurrence TEXT'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE todos ADD COLUMN last_done_at INTEGER'); } catch { /* already there */ }
  try { db.exec('ALTER TABLE projects ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0'); } catch { /* already there */ }

  seedDefaults(db);
  seedAdminAndBackfill(db);
  // Every existing to-do belongs to its project's owner until reassigned.
  db.prepare(
    'UPDATE todos SET created_by = (SELECT owner_id FROM projects WHERE projects.id = todos.project_id) WHERE created_by IS NULL'
  ).run();
  return db;
}

// Create the first admin (from the old single-user password) and give every
// pre-existing project/client to that admin. Runs once, on the first multi-user boot.
function seedAdminAndBackfill(db) {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  let adminId;
  if (userCount === 0) {
    const email = (process.env.DECK_ADMIN_EMAIL || 'derickrocktherock@gmail.com').toLowerCase();
    const name = process.env.DECK_ADMIN_NAME || 'Deric';
    const pwHash = process.env.DECK_PASSWORD_HASH || hashPassword('dev'); // reuse old password in prod
    const r = db.prepare('INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(email, name, pwHash, 'admin', Date.now());
    adminId = Number(r.lastInsertRowid);
  } else {
    adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get()?.id;
  }
  if (adminId) {
    db.prepare('UPDATE projects SET owner_id = ? WHERE owner_id IS NULL').run(adminId);
    db.prepare('UPDATE clients SET owner_id = ? WHERE owner_id IS NULL').run(adminId);
  }
}

function seedDefaults(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
  if (count > 0) return;
  const now = Date.now();
  const insP = db.prepare(
    'INSERT INTO projects (name, status, description, bucket, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insT = db.prepare(
    'INSERT INTO todos (project_id, text, horizon, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insL = db.prepare(
    'INSERT INTO links (project_id, label, url, sort, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  SEED.forEach((p, pi) => {
    const r = insP.run(p.name, p.status, p.description, p.bucket, pi, now, now);
    const pid = Number(r.lastInsertRowid);
    (p.todos || []).forEach((t, ti) => insT.run(pid, t.text, t.horizon, ti, now, now));
    (p.links || []).forEach((l, li) => insL.run(pid, l.label, l.url, li, now));
  });
}
