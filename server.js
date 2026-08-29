import express from 'express';
import session from 'express-session';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDb, STATUSES } from './lib/db.js';
import { hashPassword, verifyPassword } from './lib/auth.js';
import { encryptSecret, decryptSecret } from './lib/vault-crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3007;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret';
const WISPR_API_KEY = process.env.WISPR_API_KEY || '';
const PROD = process.env.NODE_ENV === 'production';

const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const db = initDb(path.join(dataDir, 'deck.db'));
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '35mb' })); // voice audio is base64 WAV (up to ~33 MB)
app.use(session({
  name: 'deck.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 24 * 30 },
}));

// ---- auth ----------------------------------------------------------------
function requireAuth(req, res, next) {
  const uid = req.session?.userId;
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  const user = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(uid);
  if (!user) { req.session.destroy(() => {}); return res.status(401).json({ error: 'unauthorized' }); }
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

app.post('/api/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'wrong email or password' });
  }
  req.session.userId = user.id;
  res.json({ ok: true, user: publicUser(user) });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/me', (req, res) => {
  const uid = req.session?.userId;
  const user = uid ? db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(uid) : null;
  res.json({ authed: !!user, user: user || null });
});

// ---- invites / signup / members ------------------------------------------
app.get('/api/invite/:token', (req, res) => {
  const inv = db.prepare('SELECT email, role, accepted_at, expires_at FROM invites WHERE token = ?').get(req.params.token);
  if (!inv || inv.accepted_at || inv.expires_at < Date.now()) return res.status(404).json({ error: 'invalid or expired invite' });
  res.json({ email: inv.email, role: inv.role });
});

app.post('/api/signup', (req, res) => {
  const { token, name, password } = req.body || {};
  const inv = db.prepare('SELECT * FROM invites WHERE token = ?').get(String(token || ''));
  if (!inv || inv.accepted_at || inv.expires_at < Date.now()) return res.status(400).json({ error: 'invalid or expired invite' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(inv.email)) return res.status(409).json({ error: 'account already exists' });
  const now = Date.now();
  const r = db.prepare('INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(inv.email, String(name).trim(), hashPassword(password), inv.role, now);
  db.prepare('UPDATE invites SET accepted_at = ? WHERE id = ?').run(now, inv.id);
  req.session.userId = Number(r.lastInsertRowid);
  res.json({ ok: true, user: { id: Number(r.lastInsertRowid), email: inv.email, name: String(name).trim(), role: inv.role } });
});

app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at').all();
  const invites = db.prepare('SELECT id, email, role, token, created_at, expires_at FROM invites WHERE accepted_at IS NULL ORDER BY created_at DESC').all();
  res.json({ users, invites });
});

app.post('/api/invites', requireAuth, requireAdmin, (req, res) => {
  let { email, role = 'member' } = req.body || {};
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'valid email required' });
  if (!['member', 'admin'].includes(role)) role = 'member';
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'a user with that email already exists' });
  db.prepare('DELETE FROM invites WHERE email = ? AND accepted_at IS NULL').run(email);
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO invites (email, role, token, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(email, role, token, req.user.id, now, now + 1000 * 60 * 60 * 24 * 14);
  res.json({ token });
});

app.delete('/api/invites/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM invites WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- access helpers ------------------------------------------------------
// A project is reachable to a user as its OWNER, or as a COLLABORATOR (shared
// with them directly, or via a client that was shared with them). Owners can
// restructure/delete/share; collaborators can add & work to-dos/notes/links/files.
function projectAccess(projectId, uid) {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(projectId));
  if (!p) return { level: null, project: null };
  if (p.owner_id === uid) return { level: 'owner', project: p };
  if (db.prepare('SELECT 1 FROM project_shares WHERE project_id = ? AND user_id = ?').get(p.id, uid)) return { level: 'collaborator', project: p };
  if (p.client_id && db.prepare('SELECT 1 FROM client_shares WHERE client_id = ? AND user_id = ?').get(p.client_id, uid)) return { level: 'collaborator', project: p };
  return { level: null, project: p };
}
const ownedProject = (id, uid) => { const a = projectAccess(id, uid); return a.level === 'owner' ? a.project : null; };
const canCollaborate = (id, uid) => { const a = projectAccess(id, uid); return (a.level === 'owner' || a.level === 'collaborator') ? a.project : null; };
const collabTodo = (id, uid) => { const t = db.prepare('SELECT * FROM todos WHERE id = ?').get(Number(id)); return t && canCollaborate(t.project_id, uid) ? t : null; };
const collabLink = (id, uid) => { const l = db.prepare('SELECT * FROM links WHERE id = ?').get(Number(id)); return l && canCollaborate(l.project_id, uid) ? l : null; };
const collabFile = (id, uid) => { const f = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id)); return f && canCollaborate(f.project_id, uid) ? f : null; };
const ownsClient = (id, uid) => db.prepare('SELECT * FROM clients WHERE id = ? AND owner_id = ?').get(Number(id), uid);
// A client is viewable if you own it, it was shared with you, or you can reach
// one of its projects (so a shared project can still render its client badge).
function clientViewable(clientId, uid) {
  const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(clientId));
  if (!c) return null;
  if (c.owner_id === uid) return c;
  if (db.prepare('SELECT 1 FROM client_shares WHERE client_id = ? AND user_id = ?').get(c.id, uid)) return c;
  for (const p of db.prepare('SELECT id FROM projects WHERE client_id = ?').all(c.id)) {
    if (projectAccess(p.id, uid).level) return c;
  }
  return null;
}
// Validate a to-do assignee: null, or a real user who can reach the project.
function normaliseAssignee(v, projectId) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!n) return null;
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(n)) return null;
  return projectAccess(projectId, n).level ? n : null;
}

// ---- recurrence ----------------------------------------------------------
// A recurring to-do carries a cadence; "done" logs a completion (last_done_at)
// and the task stays live, becoming due again once a period has elapsed.
const RECUR_DAYS = { daily: 1, '3x_week': 2, '2x_week': 3, weekly: 7, biweekly: 14, monthly: 30 };
const RECURRENCES = Object.keys(RECUR_DAYS);
function normaliseRecurrence(v) {
  if (v == null || v === '' || v === 'none') return null;
  return RECURRENCES.includes(String(v)) ? String(v) : null;
}
function isDue(recurrence, lastDoneAt, now = Date.now()) {
  if (!recurrence) return true;
  if (!lastDoneAt) return true;
  return (now - lastDoneAt) >= RECUR_DAYS[recurrence] * 86400000;
}

// Deep-copy a project (or template) into a new one. Resets to-do done state +
// deadlines so an instance starts fresh. Copies to-dos, links, description, client, notes.
function cloneProjectRow(srcId, ownerId, { asTemplate = false, name, status, bucket } = {}) {
  const src = db.prepare('SELECT * FROM projects WHERE id = ? AND owner_id = ?').get(srcId, ownerId);
  if (!src) return null;
  const now = Date.now();
  const minSort = db.prepare('SELECT COALESCE(MIN(sort), 0) AS m FROM projects WHERE owner_id = ? AND is_template = ?').get(ownerId, asTemplate ? 1 : 0).m;
  const r = db.prepare(
    'INSERT INTO projects (name, status, description, bucket, deadline, client_id, notes, owner_id, is_template, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name ?? src.name, status ?? src.status, src.description, bucket ?? src.bucket, null, src.client_id, src.notes, ownerId, asTemplate ? 1 : 0, minSort - 1, now, now);
  const newId = Number(r.lastInsertRowid);
  const insT = db.prepare('INSERT INTO todos (project_id, text, horizon, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  db.prepare('SELECT text FROM todos WHERE project_id = ? ORDER BY sort, id').all(srcId)
    .forEach((t, i) => insT.run(newId, t.text, 'now', i, now, now));
  const insL = db.prepare('INSERT INTO links (project_id, label, url, sort, created_at) VALUES (?, ?, ?, ?, ?)');
  db.prepare('SELECT label, url FROM links WHERE project_id = ? ORDER BY sort, id').all(srcId)
    .forEach((l, i) => insL.run(newId, l.label, l.url, i, now));
  return newId;
}

// ---- projects ------------------------------------------------------------
function normaliseDeadline(v) {
  if (v == null || v === '') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null;
}
function normaliseClientId(v, uid) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!n) return null;
  return ownsClient(n, uid) ? n : null;
}

app.get('/api/projects', requireAuth, (req, res) => {
  const uid = req.user.id;
  const rows = db.prepare(
    `SELECT p.*,
       c.name AS client_name,
       (c.logo_stored IS NOT NULL) AS client_has_logo,
       c.updated_at AS client_updated,
       u.name AS owner_name,
       (p.owner_id != ?) AS shared,
       (p.owner_id = ? AND (
          p.id IN (SELECT project_id FROM project_shares)
          OR p.client_id IN (SELECT client_id FROM client_shares)
       )) AS shared_out,
       (SELECT GROUP_CONCAT(u2.name, ', ') FROM project_shares ps JOIN users u2 ON u2.id = ps.user_id WHERE ps.project_id = p.id) AS shared_with_names,
       (SELECT COUNT(*) FROM todos t WHERE t.project_id = p.id AND t.done = 0) AS open_count,
       (SELECT COUNT(*) FROM todos t WHERE t.project_id = p.id) AS todo_count,
       (SELECT COUNT(*) FROM files f WHERE f.project_id = p.id) AS file_count,
       (SELECT COUNT(*) FROM links l WHERE l.project_id = p.id) AS link_count
     FROM projects p
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN users u ON u.id = p.owner_id
     WHERE p.archived = 0 AND p.is_template = 0 AND p.recurring = 0 AND (
       p.owner_id = ?
       OR p.id IN (SELECT project_id FROM project_shares WHERE user_id = ?)
       OR p.client_id IN (SELECT client_id FROM client_shares WHERE user_id = ?)
     )
     ORDER BY p.sort, p.id`
  ).all(uid, uid, uid, uid, uid);
  res.json({ projects: rows });
});

app.get('/api/projects/:id', requireAuth, (req, res) => {
  const { level, project } = projectAccess(req.params.id, req.user.id);
  if (!level || project.archived) return res.status(404).json({ error: 'not found' });
  const id = project.id;
  if (project.client_id) {
    const c = db.prepare('SELECT name, (logo_stored IS NOT NULL) AS has_logo, updated_at FROM clients WHERE id = ?').get(project.client_id);
    project.client_name = c?.name || null;
    project.client_has_logo = c ? !!c.has_logo : 0;
    project.client_updated = c?.updated_at || null;
  } else {
    project.client_name = null; project.client_has_logo = 0; project.client_updated = null;
  }
  const owner = db.prepare('SELECT name, email FROM users WHERE id = ?').get(project.owner_id);
  project.owner_name = owner?.name || '';
  project.is_owner = level === 'owner';
  project.can_edit = level === 'owner';
  project.shared = project.owner_id !== req.user.id ? 1 : 0;
  project.todos = db.prepare(
    `SELECT t.*, ua.name AS assignee_name, uc.name AS author_name
     FROM todos t
     LEFT JOIN users ua ON ua.id = t.assignee_id
     LEFT JOIN users uc ON uc.id = t.created_by
     WHERE t.project_id = ? ORDER BY t.sort, t.id`
  ).all(id);
  project.links = db.prepare('SELECT * FROM links WHERE project_id = ? ORDER BY sort, id').all(id);
  project.files = db.prepare('SELECT id, original_name, mime, size, created_at FROM files WHERE project_id = ? ORDER BY id DESC').all(id);
  project.notes_thread = db.prepare(
    `SELECT n.id, n.body, n.created_at, n.author_id, u.name AS author_name
     FROM project_notes n LEFT JOIN users u ON u.id = n.author_id
     WHERE n.project_id = ? ORDER BY n.created_at, n.id`
  ).all(id);
  if (level === 'owner') {
    project.shares = db.prepare(
      `SELECT ps.user_id, u.name, u.email FROM project_shares ps JOIN users u ON u.id = ps.user_id WHERE ps.project_id = ? ORDER BY u.name`
    ).all(id);
  }
  // Everyone who can reach this project (owner + direct shares + client shares) —
  // the valid set of to-do assignees, sent to all collaborators.
  project.access_users = db.prepare(
    `SELECT u.id, u.name, u.email FROM users u WHERE u.id = ?
       OR u.id IN (SELECT user_id FROM project_shares WHERE project_id = ?)
       OR u.id IN (SELECT user_id FROM client_shares WHERE client_id = ?)
     ORDER BY u.name`
  ).all(project.owner_id, id, project.client_id || 0);
  res.json({ project });
});

app.post('/api/projects', requireAuth, (req, res) => {
  let { name, status = 'idea', description = '', bucket = 'current', deadline, client_id, recurring } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  if (!STATUSES.includes(status)) status = 'idea';
  if (!['current', 'longterm'].includes(bucket)) bucket = 'current';
  const rec = recurring ? 1 : 0;
  const now = Date.now();
  const minSort = db.prepare('SELECT COALESCE(MIN(sort), 0) AS m FROM projects WHERE owner_id = ?').get(req.user.id).m;
  const r = db.prepare(
    'INSERT INTO projects (name, status, description, bucket, deadline, client_id, recurring, owner_id, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(String(name).trim(), status, String(description || ''), bucket, normaliseDeadline(deadline), normaliseClientId(client_id, req.user.id), rec, req.user.id, minSort - 1, now, now);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/projects/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const cur = ownedProject(id, req.user.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  let { name = cur.name, status = cur.status, description = cur.description, bucket = cur.bucket, sort = cur.sort } = req.body || {};
  if (!STATUSES.includes(status)) status = cur.status;
  if (!['current', 'longterm'].includes(bucket)) bucket = cur.bucket;
  const deadline = req.body.deadline === undefined ? cur.deadline : normaliseDeadline(req.body.deadline);
  const client_id = req.body.client_id === undefined ? cur.client_id : normaliseClientId(req.body.client_id, req.user.id);
  const notes = req.body.notes === undefined ? cur.notes : String(req.body.notes || '');
  const recurring = req.body.recurring === undefined ? cur.recurring : (req.body.recurring ? 1 : 0);
  const priority = req.body.priority === undefined ? cur.priority : (req.body.priority ? 1 : null);
  db.prepare(
    'UPDATE projects SET name = ?, status = ?, description = ?, bucket = ?, deadline = ?, client_id = ?, notes = ?, recurring = ?, priority = ?, sort = ?, updated_at = ? WHERE id = ?'
  ).run(String(name).trim() || cur.name, status, String(description || ''), bucket, deadline, client_id, notes, recurring, priority, sort, Date.now(), id);
  res.json({ ok: true });
});

app.post('/api/projects/reorder', requireAuth, (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const upd = db.prepare('UPDATE projects SET bucket = ?, sort = ?, priority = ?, updated_at = ? WHERE id = ? AND owner_id = ?');
  const now = Date.now();
  db.exec('BEGIN');
  try {
    for (const it of items) {
      const bucket = ['current', 'longterm'].includes(it.bucket) ? it.bucket : 'current';
      const priority = it.priority == null ? null : 1;
      upd.run(bucket, Number(it.sort) || 0, priority, now, Number(it.id), req.user.id);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(400).json({ error: e.message }); }
  res.json({ ok: true });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!ownedProject(id, req.user.id)) return res.status(404).json({ error: 'not found' });
  const files = db.prepare('SELECT stored_name FROM files WHERE project_id = ?').all(id);
  for (const f of files) { try { fs.unlinkSync(path.join(uploadDir, f.stored_name)); } catch {} }
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- templates (repeatable projects) -------------------------------------
app.get('/api/templates', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT p.id, p.name, p.description, p.client_id,
       c.name AS client_name, (c.logo_stored IS NOT NULL) AS client_has_logo, c.updated_at AS client_updated,
       (SELECT COUNT(*) FROM todos t WHERE t.project_id = p.id) AS todo_count
     FROM projects p LEFT JOIN clients c ON c.id = p.client_id
     WHERE p.owner_id = ? AND p.is_template = 1 AND p.archived = 0
     ORDER BY p.name`
  ).all(req.user.id);
  res.json({ templates: rows });
});

app.post('/api/templates', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const now = Date.now();
  const r = db.prepare(
    'INSERT INTO projects (name, status, description, bucket, owner_id, is_template, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name, 'idea', '', 'current', req.user.id, 1, 0, now, now);
  res.json({ id: Number(r.lastInsertRowid) });
});

// Spawn a fresh project from a template.
app.post('/api/templates/:id/use', requireAuth, (req, res) => {
  const src = db.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ? AND is_template = 1').get(Number(req.params.id), req.user.id);
  if (!src) return res.status(404).json({ error: 'template not found' });
  const name = req.body?.name && String(req.body.name).trim();
  const newId = cloneProjectRow(src.id, req.user.id, { asTemplate: false, status: 'in_progress', bucket: 'current', name });
  res.json({ id: newId });
});

// Turn an existing project into a reusable template.
app.post('/api/projects/:id/save-as-template', requireAuth, (req, res) => {
  const src = db.prepare('SELECT id FROM projects WHERE id = ? AND owner_id = ? AND is_template = 0').get(Number(req.params.id), req.user.id);
  if (!src) return res.status(404).json({ error: 'project not found' });
  const newId = cloneProjectRow(src.id, req.user.id, { asTemplate: true });
  res.json({ id: newId });
});

// ---- todos ---------------------------------------------------------------
app.post('/api/projects/:id/todos', requireAuth, (req, res) => {
  const projectId = Number(req.params.id);
  if (!canCollaborate(projectId, req.user.id)) return res.status(404).json({ error: 'project not found' });
  let { text, deadline, assignee_id, recurrence } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'text required' });
  const now = Date.now();
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM todos WHERE project_id = ?').get(projectId).m;
  const r = db.prepare('INSERT INTO todos (project_id, text, horizon, deadline, assignee_id, recurrence, created_by, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(projectId, String(text).trim(), 'now', normaliseDeadline(deadline), normaliseAssignee(assignee_id, projectId), normaliseRecurrence(recurrence), req.user.id, maxSort + 1, now, now);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/todos/:id', requireAuth, (req, res) => {
  const cur = collabTodo(Number(req.params.id), req.user.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const text = req.body.text === undefined ? cur.text : req.body.text;
  const deadline = req.body.deadline === undefined ? cur.deadline : normaliseDeadline(req.body.deadline);
  const assignee_id = req.body.assignee_id === undefined ? cur.assignee_id : normaliseAssignee(req.body.assignee_id, cur.project_id);
  const recurrence = req.body.recurrence === undefined ? cur.recurrence : normaliseRecurrence(req.body.recurrence);
  let done = req.body.done === undefined ? cur.done : (req.body.done ? 1 : 0);
  let last_done_at = cur.last_done_at;
  // Completing a recurring to-do logs it (last_done_at = now) but keeps it live.
  if (recurrence && req.body.done) { last_done_at = Date.now(); done = 0; }
  db.prepare('UPDATE todos SET text = ?, done = ?, deadline = ?, assignee_id = ?, recurrence = ?, last_done_at = ?, updated_at = ? WHERE id = ?')
    .run(String(text).trim() || cur.text, done, deadline, assignee_id, recurrence, last_done_at, Date.now(), cur.id);
  res.json({ ok: true });
});

app.delete('/api/todos/:id', requireAuth, (req, res) => {
  const cur = collabTodo(Number(req.params.id), req.user.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM todos WHERE id = ?').run(cur.id);
  res.json({ ok: true });
});

app.post('/api/todos/reorder', requireAuth, (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const upd = db.prepare('UPDATE todos SET sort = ?, updated_at = ? WHERE id = ?');
  const now = Date.now();
  db.exec('BEGIN');
  try {
    for (const it of items) {
      if (collabTodo(Number(it.id), req.user.id)) upd.run(Number(it.sort) || 0, now, Number(it.id));
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(400).json({ error: e.message }); }
  res.json({ ok: true });
});

// ---- notes thread (attributed) -------------------------------------------
app.post('/api/projects/:id/notes', requireAuth, (req, res) => {
  const projectId = Number(req.params.id);
  if (!canCollaborate(projectId, req.user.id)) return res.status(404).json({ error: 'project not found' });
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'note is empty' });
  const r = db.prepare('INSERT INTO project_notes (project_id, author_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(projectId, req.user.id, body, Date.now());
  res.json({ id: Number(r.lastInsertRowid) });
});

app.delete('/api/notes/:id', requireAuth, (req, res) => {
  const note = db.prepare('SELECT * FROM project_notes WHERE id = ?').get(Number(req.params.id));
  if (!note) return res.status(404).json({ error: 'not found' });
  const isAuthor = note.author_id === req.user.id;
  const isOwner = !!ownedProject(note.project_id, req.user.id);
  if (!isAuthor && !isOwner) return res.status(403).json({ error: 'only the author or project owner can delete a note' });
  db.prepare('DELETE FROM project_notes WHERE id = ?').run(note.id);
  res.json({ ok: true });
});

// ---- links ---------------------------------------------------------------
app.post('/api/projects/:id/links', requireAuth, (req, res) => {
  const projectId = Number(req.params.id);
  if (!canCollaborate(projectId, req.user.id)) return res.status(404).json({ error: 'project not found' });
  let { label, url } = req.body || {};
  url = String(url || '').trim();
  if (!url) return res.status(400).json({ error: 'url required' });
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  label = String(label || '').trim() || url.replace(/^https?:\/\//i, '').split('/')[0];
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM links WHERE project_id = ?').get(projectId).m;
  const r = db.prepare('INSERT INTO links (project_id, label, url, sort, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(projectId, label, url, maxSort + 1, Date.now());
  res.json({ id: Number(r.lastInsertRowid) });
});

app.delete('/api/links/:id', requireAuth, (req, res) => {
  const cur = collabLink(Number(req.params.id), req.user.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM links WHERE id = ?').run(cur.id);
  res.json({ ok: true });
});

// ---- files ---------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 12);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.post('/api/projects/:id/files', requireAuth, upload.single('file'), (req, res) => {
  const projectId = Number(req.params.id);
  if (!canCollaborate(projectId, req.user.id)) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
    return res.status(404).json({ error: 'project not found' });
  }
  if (!req.file) return res.status(400).json({ error: 'no file' });
  let original = req.file.originalname || 'file';
  try { original = Buffer.from(original, 'latin1').toString('utf8'); } catch {}
  const r = db.prepare('INSERT INTO files (project_id, original_name, stored_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(projectId, original, req.file.filename, req.file.mimetype || '', req.file.size || 0, Date.now());
  res.json({ id: Number(r.lastInsertRowid), original_name: original, size: req.file.size, mime: req.file.mimetype });
});

app.get('/api/files/:id/download', requireAuth, (req, res) => {
  const f = collabFile(Number(req.params.id), req.user.id);
  if (!f) return res.status(404).json({ error: 'not found' });
  const abs = path.join(uploadDir, f.stored_name);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'file missing on disk' });
  res.download(abs, f.original_name);
});

app.delete('/api/files/:id', requireAuth, (req, res) => {
  const f = collabFile(Number(req.params.id), req.user.id);
  if (!f) return res.status(404).json({ error: 'not found' });
  try { fs.unlinkSync(path.join(uploadDir, f.stored_name)); } catch {}
  db.prepare('DELETE FROM files WHERE id = ?').run(f.id);
  res.json({ ok: true });
});

// ---- clients (per-owner) -------------------------------------------------
app.get('/api/clients', requireAuth, (req, res) => {
  const uid = req.user.id;
  const rows = db.prepare(
    `SELECT c.id, c.name, (c.logo_stored IS NOT NULL) AS has_logo, c.updated_at,
       (c.owner_id != ?) AS shared, u.name AS owner_name
     FROM clients c LEFT JOIN users u ON u.id = c.owner_id
     WHERE c.archived = 0 AND (
       c.owner_id = ? OR c.id IN (SELECT client_id FROM client_shares WHERE user_id = ?)
     )
     ORDER BY c.sort, c.name`
  ).all(uid, uid, uid);
  res.json({ clients: rows.map((c) => ({ id: c.id, name: c.name, has_logo: !!c.has_logo, updated_at: c.updated_at, shared: !!c.shared, owner_name: c.owner_name })) });
});

app.post('/api/clients', requireAuth, upload.single('logo'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
    return res.status(400).json({ error: 'name required' });
  }
  const now = Date.now();
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM clients WHERE owner_id = ?').get(req.user.id).m;
  const r = db.prepare(
    'INSERT INTO clients (name, logo_stored, logo_mime, owner_id, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, req.file ? req.file.filename : null, req.file ? (req.file.mimetype || '') : null, req.user.id, maxSort + 1, now, now);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/clients/:id', requireAuth, upload.single('logo'), (req, res) => {
  const id = Number(req.params.id);
  const cur = ownsClient(id, req.user.id);
  if (!cur) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
    return res.status(404).json({ error: 'not found' });
  }
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : cur.name;
  let logoStored = cur.logo_stored;
  let logoMime = cur.logo_mime;
  if (req.file) {
    if (cur.logo_stored) { try { fs.unlinkSync(path.join(uploadDir, cur.logo_stored)); } catch {} }
    logoStored = req.file.filename;
    logoMime = req.file.mimetype || '';
  }
  db.prepare('UPDATE clients SET name = ?, logo_stored = ?, logo_mime = ?, updated_at = ? WHERE id = ?')
    .run(name || cur.name, logoStored, logoMime, Date.now(), id);
  res.json({ ok: true });
});

app.delete('/api/clients/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const cur = ownsClient(id, req.user.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  if (cur.logo_stored) { try { fs.unlinkSync(path.join(uploadDir, cur.logo_stored)); } catch {} }
  db.prepare('UPDATE projects SET client_id = NULL WHERE client_id = ?').run(id);
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.get('/api/clients/:id/logo', requireAuth, (req, res) => {
  const c = clientViewable(Number(req.params.id), req.user.id);
  if (!c || !c.logo_stored) return res.status(404).end();
  const abs = path.join(uploadDir, c.logo_stored);
  if (!fs.existsSync(abs)) return res.status(404).end();
  if (c.logo_mime) res.type(c.logo_mime);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(abs);
});

// ---- members + sharing ---------------------------------------------------
// Everyone can see the roster (name/email) so they can pick who to share with.
app.get('/api/members', requireAuth, (req, res) => {
  const members = db.prepare('SELECT id, name, email, role FROM users ORDER BY name, email').all();
  res.json({ members });
});

// Project shares (owner of the project only).
app.get('/api/projects/:id/shares', requireAuth, (req, res) => {
  if (!ownedProject(req.params.id, req.user.id)) return res.status(403).json({ error: 'only the owner can manage sharing' });
  const shares = db.prepare(
    'SELECT ps.user_id, u.name, u.email FROM project_shares ps JOIN users u ON u.id = ps.user_id WHERE ps.project_id = ? ORDER BY u.name'
  ).all(Number(req.params.id));
  res.json({ shares });
});

app.post('/api/projects/:id/shares', requireAuth, (req, res) => {
  const project = ownedProject(req.params.id, req.user.id);
  if (!project) return res.status(403).json({ error: 'only the owner can share this project' });
  const userId = Number(req.body?.user_id);
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) return res.status(400).json({ error: 'unknown user' });
  if (userId === project.owner_id) return res.status(400).json({ error: 'that is the owner' });
  db.prepare('INSERT OR IGNORE INTO project_shares (project_id, user_id, role, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(project.id, userId, 'collaborator', req.user.id, Date.now());
  res.json({ ok: true });
});

app.delete('/api/projects/:id/shares/:userId', requireAuth, (req, res) => {
  if (!ownedProject(req.params.id, req.user.id)) return res.status(403).json({ error: 'only the owner can manage sharing' });
  db.prepare('DELETE FROM project_shares WHERE project_id = ? AND user_id = ?').run(Number(req.params.id), Number(req.params.userId));
  res.json({ ok: true });
});

// Client shares (owner of the client only) → shares every project under it.
app.get('/api/clients/:id/shares', requireAuth, (req, res) => {
  if (!ownsClient(req.params.id, req.user.id)) return res.status(403).json({ error: 'only the owner can manage sharing' });
  const shares = db.prepare(
    'SELECT cs.user_id, u.name, u.email FROM client_shares cs JOIN users u ON u.id = cs.user_id WHERE cs.client_id = ? ORDER BY u.name'
  ).all(Number(req.params.id));
  res.json({ shares });
});

app.post('/api/clients/:id/shares', requireAuth, (req, res) => {
  const client = ownsClient(req.params.id, req.user.id);
  if (!client) return res.status(403).json({ error: 'only the owner can share this client' });
  const userId = Number(req.body?.user_id);
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) return res.status(400).json({ error: 'unknown user' });
  if (userId === client.owner_id) return res.status(400).json({ error: 'that is the owner' });
  db.prepare('INSERT OR IGNORE INTO client_shares (client_id, user_id, created_by, created_at) VALUES (?, ?, ?, ?)')
    .run(client.id, userId, req.user.id, Date.now());
  res.json({ ok: true });
});

app.delete('/api/clients/:id/shares/:userId', requireAuth, (req, res) => {
  if (!ownsClient(req.params.id, req.user.id)) return res.status(403).json({ error: 'only the owner can manage sharing' });
  db.prepare('DELETE FROM client_shares WHERE client_id = ? AND user_id = ?').run(Number(req.params.id), Number(req.params.userId));
  res.json({ ok: true });
});

// ---- my tasks (cross-project managerial view) ----------------------------
app.get('/api/tasks', requireAuth, (req, res) => {
  const uid = req.user.id;
  const now = Date.now();
  // Recurring tasks only surface here when they're actually due again.
  const dueOnly = (rows) => rows.filter((t) => (t.recurrence ? isDue(t.recurrence, t.last_done_at, now) : true));
  const assignedToMe = dueOnly(db.prepare(
    `SELECT t.id, t.text, t.done, t.deadline, t.project_id, t.recurrence, t.last_done_at,
       p.name AS project_name, p.status AS project_status, p.recurring AS project_recurring,
       c.name AS client_name, uc.name AS created_by_name
     FROM todos t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN users uc ON uc.id = t.created_by
     WHERE t.assignee_id = ? AND t.done = 0 AND p.archived = 0 AND p.is_template = 0
     ORDER BY (t.deadline IS NULL), t.deadline, p.name`
  ).all(uid));
  const handedOff = dueOnly(db.prepare(
    `SELECT t.id, t.text, t.done, t.deadline, t.project_id, t.recurrence, t.last_done_at,
       p.name AS project_name, p.status AS project_status, p.recurring AS project_recurring,
       c.name AS client_name, ua.name AS assignee_name
     FROM todos t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN users ua ON ua.id = t.assignee_id
     WHERE t.created_by = ? AND t.assignee_id IS NOT NULL AND t.assignee_id != ?
       AND t.done = 0 AND p.archived = 0 AND p.is_template = 0
     ORDER BY (t.deadline IS NULL), t.deadline, p.name`
  ).all(uid, uid));
  res.json({ assignedToMe, handedOff });
});

// ---- recurring projects + tasks ------------------------------------------
app.get('/api/recurring', requireAuth, (req, res) => {
  const uid = req.user.id;
  const now = Date.now();
  const projects = db.prepare(
    `SELECT p.*, c.name AS client_name, (c.logo_stored IS NOT NULL) AS client_has_logo,
       c.updated_at AS client_updated, u.name AS owner_name, (p.owner_id != ?) AS shared
     FROM projects p
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN users u ON u.id = p.owner_id
     WHERE p.archived = 0 AND p.is_template = 0 AND p.recurring = 1 AND (
       p.owner_id = ?
       OR p.id IN (SELECT project_id FROM project_shares WHERE user_id = ?)
       OR p.client_id IN (SELECT client_id FROM client_shares WHERE user_id = ?)
     )
     ORDER BY c.name, p.name`
  ).all(uid, uid, uid, uid);
  const todoStmt = db.prepare(
    `SELECT t.*, ua.name AS assignee_name, uc.name AS author_name
     FROM todos t
     LEFT JOIN users ua ON ua.id = t.assignee_id
     LEFT JOIN users uc ON uc.id = t.created_by
     WHERE t.project_id = ? ORDER BY (t.recurrence IS NULL), t.sort, t.id`
  );
  for (const p of projects) {
    p.todos = todoStmt.all(p.id).map((t) => ({ ...t, due: t.recurrence ? isDue(t.recurrence, t.last_done_at, now) : null }));
    p.due_count = p.todos.filter((t) => t.due === true).length;
    p.recurring_count = p.todos.filter((t) => t.recurrence).length;
    p.shared_with = db.prepare('SELECT u.name FROM project_shares ps JOIN users u ON u.id = ps.user_id WHERE ps.project_id = ?').all(p.id).map((r) => r.name);
  }
  res.json({ projects });
});

// ---- password vault ------------------------------------------------------
// Admin adds credentials; each can be shared with users who then view + copy.
// Access = normal Deck login (no master password); secrets are encrypted at rest.
const canSeeVaultItem = (item, user) =>
  user.role === 'admin' || item.owner_id === user.id ||
  !!db.prepare('SELECT 1 FROM vault_shares WHERE item_id = ? AND user_id = ?').get(item.id, user.id);

function vaultItemPublic(item, user) {
  return {
    id: item.id, name: item.name, url: item.url, username: item.username,
    notes: item.notes, has_secret: !!item.secret, owner_id: item.owner_id,
    can_manage: user.role === 'admin',
    shares: user.role === 'admin'
      ? db.prepare('SELECT vs.user_id, u.name, u.email FROM vault_shares vs JOIN users u ON u.id = vs.user_id WHERE vs.item_id = ? ORDER BY u.name').all(item.id)
      : undefined,
  };
}

app.get('/api/vault', requireAuth, (req, res) => {
  const uid = req.user.id;
  const items = req.user.role === 'admin'
    ? db.prepare('SELECT * FROM vault_items ORDER BY name COLLATE NOCASE').all()
    : db.prepare('SELECT vi.* FROM vault_items vi JOIN vault_shares vs ON vs.item_id = vi.id WHERE vs.user_id = ? ORDER BY vi.name COLLATE NOCASE').all(uid);
  res.json({ items: items.map((i) => vaultItemPublic(i, req.user)) });
});

app.post('/api/vault', requireAuth, requireAdmin, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const { url = '', username = '', password = '', notes = '' } = req.body || {};
  const now = Date.now();
  const r = db.prepare(
    'INSERT INTO vault_items (owner_id, name, url, username, secret, notes, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, name, String(url || ''), String(username || ''), encryptSecret(password), String(notes || ''), 0, now, now);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/vault/:id', requireAuth, requireAdmin, (req, res) => {
  const cur = db.prepare('SELECT * FROM vault_items WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'not found' });
  const name = req.body.name === undefined ? cur.name : String(req.body.name).trim() || cur.name;
  const url = req.body.url === undefined ? cur.url : String(req.body.url || '');
  const username = req.body.username === undefined ? cur.username : String(req.body.username || '');
  const notes = req.body.notes === undefined ? cur.notes : String(req.body.notes || '');
  // Only re-encrypt when a new password is actually supplied (non-empty).
  const secret = req.body.password ? encryptSecret(req.body.password) : cur.secret;
  db.prepare('UPDATE vault_items SET name = ?, url = ?, username = ?, secret = ?, notes = ?, updated_at = ? WHERE id = ?')
    .run(name, url, username, secret, notes, Date.now(), cur.id);
  res.json({ ok: true });
});

app.delete('/api/vault/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM vault_items WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Reveal the decrypted secret on demand (owner/admin or shared user).
app.get('/api/vault/:id/reveal', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM vault_items WHERE id = ?').get(Number(req.params.id));
  if (!item || !canSeeVaultItem(item, req.user)) return res.status(404).json({ error: 'not found' });
  res.json({ secret: decryptSecret(item.secret) });
});

app.post('/api/vault/:id/shares', requireAuth, requireAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM vault_items WHERE id = ?').get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'not found' });
  const userId = Number(req.body?.user_id);
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) return res.status(400).json({ error: 'unknown user' });
  if (userId === item.owner_id) return res.status(400).json({ error: 'that is the owner' });
  db.prepare('INSERT OR IGNORE INTO vault_shares (item_id, user_id, created_by, created_at) VALUES (?, ?, ?, ?)')
    .run(item.id, userId, req.user.id, Date.now());
  res.json({ ok: true });
});

app.delete('/api/vault/:id/shares/:userId', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM vault_shares WHERE item_id = ? AND user_id = ?').run(Number(req.params.id), Number(req.params.userId));
  res.json({ ok: true });
});

// ---- client roles & responsibilities -------------------------------------
// A per-client checklist of what we deliver. Viewable by the client owner and
// anyone the client is shared with; the owner edits structure, shared users can
// tick items done (collaborative "what we need to do" doc).
function clientAccessible(clientId, uid) {
  const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(clientId));
  if (!c) return null;
  if (c.owner_id === uid) return c;
  if (db.prepare('SELECT 1 FROM client_shares WHERE client_id = ? AND user_id = ?').get(c.id, uid)) return c;
  return null;
}

app.get('/api/clients/:id/responsibilities', requireAuth, (req, res) => {
  const c = clientAccessible(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const items = db.prepare('SELECT * FROM client_responsibilities WHERE client_id = ? ORDER BY sort, id').all(c.id);
  res.json({ items, can_manage: c.owner_id === req.user.id });
});

app.post('/api/clients/:id/responsibilities', requireAuth, (req, res) => {
  const c = ownsClient(req.params.id, req.user.id);
  if (!c) return res.status(403).json({ error: 'only the client owner can edit this' });
  let { text = '', kind = 'item' } = req.body || {};
  kind = kind === 'heading' ? 'heading' : 'item';
  if (!String(text).trim()) return res.status(400).json({ error: 'text required' });
  const now = Date.now();
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM client_responsibilities WHERE client_id = ?').get(c.id).m;
  const r = db.prepare('INSERT INTO client_responsibilities (client_id, kind, text, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(c.id, kind, String(text).trim(), maxSort + 1, now, now);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/responsibilities/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM client_responsibilities WHERE id = ?').get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'not found' });
  const client = clientAccessible(item.client_id, req.user.id);
  if (!client) return res.status(404).json({ error: 'not found' });
  const isOwner = client.owner_id === req.user.id;
  // Anyone with access can tick done; only the owner edits the text.
  const done = req.body.done === undefined ? item.done : (req.body.done ? 1 : 0);
  const text = (isOwner && req.body.text !== undefined) ? String(req.body.text).trim() : item.text;
  db.prepare('UPDATE client_responsibilities SET text = ?, done = ?, updated_at = ? WHERE id = ?')
    .run(text || item.text, done, Date.now(), item.id);
  res.json({ ok: true });
});

app.delete('/api/responsibilities/:id', requireAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM client_responsibilities WHERE id = ?').get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'not found' });
  if (!ownsClient(item.client_id, req.user.id)) return res.status(403).json({ error: 'owner only' });
  db.prepare('DELETE FROM client_responsibilities WHERE id = ?').run(item.id);
  res.json({ ok: true });
});

app.post('/api/clients/:id/responsibilities/reorder', requireAuth, (req, res) => {
  const c = ownsClient(req.params.id, req.user.id);
  if (!c) return res.status(403).json({ error: 'owner only' });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const upd = db.prepare('UPDATE client_responsibilities SET sort = ? WHERE id = ? AND client_id = ?');
  db.exec('BEGIN');
  try { for (const it of items) upd.run(Number(it.sort) || 0, Number(it.id), c.id); db.exec('COMMIT'); }
  catch (e) { db.exec('ROLLBACK'); return res.status(400).json({ error: e.message }); }
  res.json({ ok: true });
});

// ---- voice (Wispr Flow transcription) ------------------------------------
app.get('/api/voice/status', requireAuth, (req, res) => res.json({ configured: !!WISPR_API_KEY }));

app.post('/api/voice/transcribe', requireAuth, async (req, res) => {
  if (!WISPR_API_KEY) return res.status(501).json({ error: 'Voice is not configured yet — add WISPR_API_KEY to the server .env.' });
  const { audio, language } = req.body || {};
  if (!audio) return res.status(400).json({ error: 'no audio' });
  try {
    const r = await fetch('https://platform-api.wisprflow.ai/api/v1/dash/api', {
      method: 'POST',
      headers: { Authorization: `Bearer ${WISPR_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio, language: Array.isArray(language) && language.length ? language : ['en'], context: { app: { type: 'notes' } } }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: data.error || data.message || `Wispr API error ${r.status}` });
    res.json({ text: String(data.text || '').trim() });
  } catch (e) { res.status(502).json({ error: e.message || 'transcription failed' }); }
});

// Multer / body errors -> clean JSON.
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file too large (max 25 MB)' });
  if (err) return res.status(400).json({ error: err.message || 'bad request' });
  next();
});

// ---- static frontend -----------------------------------------------------
const distDir = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  console.log(`Deck listening on :${PORT}  (prod=${PROD}, users=${n})`);
});
