import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

function firstName(n) { return (n || '').split(' ')[0] || n || '?'; }

// Small helper: copy text, flash a label on the trigger.
function useCopyFlash() {
  const [copied, setCopied] = useState('');
  const flash = (key) => { setCopied(key); setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1400); };
  return [copied, flash];
}

function AddForm({ onAdded }) {
  const blank = { name: '', url: '', username: '', password: '', notes: '' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim() || busy) return;
    setBusy(true);
    try { await api.addVaultItem({ ...f, name: f.name.trim() }); setF(blank); setOpen(false); onAdded(); }
    finally { setBusy(false); }
  }

  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>＋ Add a password</button>;

  return (
    <form className="vault-add" onSubmit={submit}>
      <div className="vault-add-grid">
        <input placeholder="Name (e.g. Funkyfing Shopify)" value={f.name} onChange={set('name')} autoFocus />
        <input placeholder="Website link (https://…)" value={f.url} onChange={set('url')} />
        <input placeholder="Username / email" value={f.username} onChange={set('username')} />
        <input placeholder="Password" value={f.password} onChange={set('password')} />
        <input className="vault-notes-in" placeholder="Notes (optional)" value={f.notes} onChange={set('notes')} />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => { setOpen(false); setF(blank); }}>Cancel</button>
        <button type="submit" className="btn primary" disabled={!f.name.trim() || busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </div>
    </form>
  );
}

function ShareBox({ item, members, reload }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const shares = item.shares || [];
  const sharedIds = new Set(shares.map((s) => s.user_id));
  const candidates = members.filter((m) => m.id !== item.owner_id && !sharedIds.has(m.id));

  async function add() {
    const id = Number(pick);
    if (!id || busy) return;
    setBusy(true);
    try { await api.shareVaultItem(item.id, id); setPick(''); await reload(); } finally { setBusy(false); }
  }
  async function remove(uid) { await api.unshareVaultItem(item.id, uid); await reload(); }

  return (
    <div className="vault-share">
      <button className="btn small" onClick={() => setOpen((o) => !o)} title="Share this password">
        🤝 {shares.length ? shares.map((s) => firstName(s.name)).join(', ') : 'Share'}
      </button>
      {open && (
        <div className="share-panel">
          {shares.length > 0 && (
            <ul className="share-list">
              {shares.map((s) => (
                <li key={s.user_id}><span><strong>{s.name}</strong> <span className="field-opt">· {s.email}</span></span>
                  <button className="todo-del" onClick={() => remove(s.user_id)}>×</button></li>
              ))}
            </ul>
          )}
          {candidates.length > 0 ? (
            <div className="mini-add links">
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Share with…</option>
                {candidates.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
              <button className="btn primary small" onClick={add} disabled={!pick || busy}>Add</button>
            </div>
          ) : <p className="field-opt" style={{ margin: '2px' }}>{members.length <= 1 ? 'Invite someone from Team first.' : 'Shared with everyone.'}</p>}
        </div>
      )}
    </div>
  );
}

function EditForm({ item, onSaved, onCancel }) {
  const [f, setF] = useState({ name: item.name, url: item.url, username: item.username, password: '', notes: item.notes });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim() || busy) return;
    setBusy(true);
    try { await api.updateVaultItem(item.id, f); onSaved(); } finally { setBusy(false); }
  }
  return (
    <form className="vault-add" onSubmit={submit}>
      <div className="vault-add-grid">
        <input placeholder="Name" value={f.name} onChange={set('name')} />
        <input placeholder="Website link" value={f.url} onChange={set('url')} />
        <input placeholder="Username / email" value={f.username} onChange={set('username')} />
        <input placeholder="New password (leave blank to keep)" value={f.password} onChange={set('password')} />
        <input className="vault-notes-in" placeholder="Notes" value={f.notes} onChange={set('notes')} />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary" disabled={!f.name.trim() || busy}>Save</button>
      </div>
    </form>
  );
}

function VaultRow({ item, members, canManage, reload }) {
  const [shown, setShown] = useState('');       // decrypted secret when revealed
  const [editing, setEditing] = useState(false);
  const [copied, flash] = useCopyFlash();

  async function reveal() {
    if (shown) { setShown(''); return; }
    const { secret } = await api.revealVaultItem(item.id);
    setShown(secret || '(empty)');
  }
  async function copyPassword() {
    const { secret } = await api.revealVaultItem(item.id);
    try { await navigator.clipboard.writeText(secret || ''); flash('pw'); } catch { /* ignore */ }
  }
  function copy(text, key) { navigator.clipboard?.writeText(text || '').then(() => flash(key)).catch(() => {}); }
  async function del() {
    if (!window.confirm(`Delete "${item.name}" from the vault?`)) return;
    await api.deleteVaultItem(item.id); await reload();
  }

  if (editing) return <div className="vault-item"><EditForm item={item} onSaved={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} /></div>;

  return (
    <div className="vault-item">
      <div className="vault-item-head">
        <div className="vault-name">
          🔐 <strong>{item.name}</strong>
          {item.url && <a className="vault-url" href={item.url} target="_blank" rel="noreferrer">open ↗</a>}
        </div>
        {canManage && (
          <div className="vault-actions">
            <ShareBox item={item} members={members} reload={reload} />
            <button className="btn small ghost" onClick={() => setEditing(true)}>Edit</button>
            <button className="todo-del" title="Delete" onClick={del}>×</button>
          </div>
        )}
      </div>

      <div className="vault-fields">
        {item.username && (
          <div className="vault-field">
            <span className="vault-label">User</span>
            <span className="vault-value">{item.username}</span>
            <button className="btn tiny" onClick={() => copy(item.username, 'user')}>{copied === 'user' ? 'Copied ✓' : 'Copy'}</button>
          </div>
        )}
        <div className="vault-field">
          <span className="vault-label">Pass</span>
          <span className="vault-value mono">{shown || '••••••••••'}</span>
          <button className="btn tiny" onClick={reveal}>{shown ? 'Hide' : 'Show'}</button>
          <button className="btn tiny" onClick={copyPassword}>{copied === 'pw' ? 'Copied ✓' : 'Copy'}</button>
        </div>
        {item.notes && <div className="vault-note">{item.notes}</div>}
      </div>
    </div>
  );
}

export default function VaultView({ user, members = [] }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const isAdmin = user?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await api.vault()).items || []); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const shown = items.filter((i) => {
    const s = q.trim().toLowerCase();
    return !s || i.name.toLowerCase().includes(s) || (i.username || '').toLowerCase().includes(s) || (i.url || '').toLowerCase().includes(s);
  });

  if (loading) return <div className="loading">Opening the vault…</div>;

  return (
    <div className="vault">
      <div className="vault-head">
        <div>
          <h1 className="recurring-title">🔐 Password vault</h1>
          <p className="column-sub">
            {isAdmin
              ? 'Add credentials and share each with whoever needs it. Passwords are encrypted at rest — people you share with just log in and copy.'
              : 'Passwords shared with you. Log in, copy what you need. Ask Deric to add or share more.'}
          </p>
        </div>
      </div>

      <div className="vault-toolbar">
        <input className="tb-search" placeholder="Search the vault…" value={q} onChange={(e) => setQ(e.target.value)} />
        {isAdmin && <AddForm onAdded={load} />}
      </div>

      {shown.length === 0 && (
        <p className="empty">{isAdmin ? 'No passwords yet — add your first above.' : 'Nothing shared with you yet.'}</p>
      )}

      <div className="vault-list">
        {shown.map((item) => (
          <VaultRow key={item.id} item={item} members={members} canManage={isAdmin && item.can_manage} reload={load} />
        ))}
      </div>
    </div>
  );
}
