import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import ClientAvatar from './ClientAvatar.jsx';

function firstName(n) { return (n || '').split(' ')[0] || n || '?'; }

function ClientShare({ client, members }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() { try { setShares((await api.clientShares(client.id)).shares || []); } catch { /* not owner */ } }
  useEffect(() => { if (open) load(); }, [open]);

  const sharedIds = new Set(shares.map((s) => s.user_id));
  const candidates = members.filter((m) => !sharedIds.has(m.id));

  async function add() {
    const id = Number(pick);
    if (!id || busy) return;
    setBusy(true);
    try { await api.shareClient(client.id, id); setPick(''); await load(); }
    finally { setBusy(false); }
  }
  async function remove(userId) { await api.unshareClient(client.id, userId); await load(); }

  return (
    <div className="client-share">
      <button className="btn small" onClick={() => setOpen((o) => !o)} title="Share this client (and all its projects)">
        🤝 {shares.length ? shares.length : ''}
      </button>
      {open && (
        <div className="share-panel client-share-panel">
          {shares.length > 0 && (
            <ul className="share-list">
              {shares.map((s) => (
                <li key={s.user_id}><span>{firstName(s.name)}</span><button className="todo-del" onClick={() => remove(s.user_id)}>×</button></li>
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
          ) : <p className="field-opt" style={{ margin: '2px' }}>Everyone has access.</p>}
        </div>
      )}
    </div>
  );
}

function ClientRow({ client, members, onChanged }) {
  const [name, setName] = useState(client.name);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function saveName() {
    if (name.trim() && name.trim() !== client.name) {
      const fd = new FormData();
      fd.append('name', name.trim());
      await api.saveClient(fd, client.id);
      onChanged();
    }
  }

  async function changeLogo(file) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      await api.saveClient(fd, client.id);
      onChanged();
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(`Remove client "${client.name}"? Projects keep existing, they just lose this client tag.`)) return;
    await api.deleteClient(client.id);
    onChanged();
  }

  if (client.shared) {
    return (
      <div className="client-row">
        <ClientAvatar client={client} size={38} />
        <span className="client-name-input readonly">{client.name}</span>
        <span className="chip shared-chip" title={`Shared by ${client.owner_name || 'someone'}`}>🤝 {client.owner_name ? firstName(client.owner_name) : 'shared'}</span>
      </div>
    );
  }

  return (
    <div className="client-row">
      <button className="client-logo-btn" title="Change logo" onClick={() => fileRef.current?.click()} disabled={busy}>
        <ClientAvatar client={client} size={38} />
        <span className="logo-edit">✎</span>
      </button>
      <input
        className="client-name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
      />
      <ClientShare client={client} members={members} />
      <button className="todo-del" title="Remove" onClick={remove}>×</button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { changeLogo(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

export default function ClientsManager({ clients, members = [], onChanged, onClose }) {
  const [name, setName] = useState('');
  const [logo, setLogo] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const addFileRef = useRef(null);

  function pickLogo(file) {
    setLogo(file || null);
    setPreview(file ? URL.createObjectURL(file) : '');
  }

  async function add(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      if (logo) fd.append('logo', logo);
      await api.saveClient(fd);
      setName(''); setLogo(null); setPreview('');
      onChanged();
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal clients-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Clients</h2>
        <p className="voice-sub" style={{ textAlign: 'left', margin: '0 0 14px' }}>
          Add the clients you work with. Give each a logo and a name, then tag any project to a client.
          Hit 🤝 on a client to share it — whoever you share it with sees every project filed under it.
        </p>

        <form className="client-add" onSubmit={add}>
          <button type="button" className="client-logo-btn add" title="Add logo" onClick={() => addFileRef.current?.click()}>
            {preview ? <img className="client-avatar" style={{ width: 38, height: 38 }} src={preview} alt="" />
              : <span className="logo-placeholder">＋</span>}
          </button>
          <input
            className="client-name-input"
            placeholder="Client name (e.g. Funkyfing)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            {busy ? 'Adding…' : 'Add'}
          </button>
          <input ref={addFileRef} type="file" accept="image/*" hidden onChange={(e) => { pickLogo(e.target.files[0]); e.target.value = ''; }} />
        </form>

        <div className="client-list">
          {clients.length === 0 && <p className="empty">No clients yet — add your first one above.</p>}
          {clients.map((c) => <ClientRow key={c.id} client={c} members={members} onChanged={onChanged} />)}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
