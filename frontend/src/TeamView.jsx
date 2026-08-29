import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon } from './Icon.jsx';

function initials(name, email) {
  const n = (name || email || '?').trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

export default function TeamView({ user, members, onReload }) {
  const isAdmin = user?.role === 'admin';
  const [users, setUsers] = useState(members || []);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);
  const [err, setErr] = useState('');

  async function load() {
    if (isAdmin) {
      try { const r = await api.users(); setUsers(r.users || []); setInvites(r.invites || []); }
      catch { setUsers(members || []); }
    } else {
      const r = await api.members().catch(() => ({ members: members || [] }));
      setUsers(r.members || []);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function invite(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setErr('');
    try { await api.createInvite({ email: email.trim(), role }); setEmail(''); await load(); }
    catch (e2) { setErr(e2.message || 'Could not create invite'); }
    finally { setBusy(false); }
  }
  async function revoke(id) {
    await api.deleteInvite(id).catch(() => {});
    await load();
  }
  function copyLink(token) {
    const url = `${window.location.origin}/?invite=${token}`;
    navigator.clipboard?.writeText(url);
    setCopied(token); setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div>
      <div className="page-head">
        <h1>Team<span className="subdate">{users.length} {users.length === 1 ? 'member' : 'members'}</span></h1>
      </div>

      <div className="team-grid">
        {users.map((m) => (
          <div className="team-card" key={m.id}>
            <div className="team-avatar">{initials(m.name, m.email)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="team-name">{m.name || m.email}</div>
              <div className="team-email">{m.email}</div>
            </div>
            <span className={'role-pill' + (m.role === 'admin' ? ' admin' : '')}>{m.role === 'admin' ? 'Admin' : 'Member'}</span>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="fcard" style={{ marginTop: 20, maxWidth: 640 }}>
          <div className="card-head"><span className="card-label"><Icon name="people" size={14} /> Invite a teammate</span></div>
          <form className="invite-form" onSubmit={invite}>
            <input className="inp" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="inp" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create invite'}</button>
          </form>
          {err && <div className="form-err">{err}</div>}

          {invites.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="card-hint" style={{ marginBottom: 6 }}>Pending invites</div>
              {invites.map((iv) => (
                <div className="att-row" key={iv.id}>
                  <div className="att-main">
                    <div className="att-title">{iv.email}</div>
                    <div className="att-sub">{iv.role} · invite link</div>
                  </div>
                  <button className="btn ghost small" onClick={() => copyLink(iv.token)}>{copied === iv.token ? 'Copied ✓' : 'Copy link'}</button>
                  <button className="btn ghost small" onClick={() => revoke(iv.id)}>Revoke</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
