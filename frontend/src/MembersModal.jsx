import { useEffect, useState } from 'react';
import { api } from './api.js';

function inviteLink(token) {
  return `${window.location.origin}/?invite=${token}`;
}

export default function MembersModal({ onClose }) {
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);

  async function load() {
    const r = await api.users();
    setUsers(r.users);
    setInvites(r.invites);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function invite(e) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const r = await api.createInvite(email.trim(), role);
      setEmail('');
      await load();
      copy(r.token);
    } catch (err) { setError(err.message || 'could not create invite'); }
    finally { setBusy(false); }
  }

  function copy(token) {
    const link = inviteLink(token);
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800);
    }).catch(() => {});
  }

  async function revoke(id) {
    await api.deleteInvite(id);
    await load();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal clients-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Team members</h2>
        <p className="voice-sub" style={{ textAlign: 'left', margin: '0 0 14px' }}>
          Invite someone by email — they get a link to set their own password. Their projects stay private until you share a project or a whole client with them.
        </p>

        <form className="mini-add links" onSubmit={invite}>
          <input placeholder="name@fullchair…" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ flex: '0 0 auto' }}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn primary small" type="submit" disabled={busy || !email.trim()}>Invite</button>
        </form>
        {error && <p className="login-error">{error}</p>}

        {invites.length > 0 && (
          <>
            <p className="section-label">Pending invites</p>
            <div className="client-list">
              {invites.map((iv) => (
                <div key={iv.id} className="client-row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{iv.email}</strong> <span className="field-opt">· {iv.role}</span>
                  </span>
                  <button className="btn small" onClick={() => copy(iv.token)}>{copied === iv.token ? 'Copied ✓' : 'Copy link'}</button>
                  <button className="todo-del" title="Revoke" onClick={() => revoke(iv.id)}>×</button>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="section-label">Members</p>
        <div className="client-list">
          {users.map((u) => (
            <div key={u.id} className="client-row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{u.name || u.email}</strong> <span className="field-opt">· {u.email}</span>
              </span>
              <span className="badge" style={{ '--dot': u.role === 'admin' ? '#8b95ff' : '#9aa6bd' }}>
                <span className="badge-dot" />{u.role}
              </span>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
