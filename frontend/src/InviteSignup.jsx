import { useEffect, useState } from 'react';
import { api } from './api.js';

// Reached via an invite link (?invite=<token>). Lets the invitee set their name
// + password and creates their account.
export default function InviteSignup({ token, onSuccess, onCancel }) {
  const [status, setStatus] = useState('checking'); // checking | ok | invalid
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.invite(token)
      .then((r) => { setEmail(r.email); setStatus('ok'); })
      .catch(() => setStatus('invalid'));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || password.length < 6 || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.signup(token, name.trim(), password);
      onSuccess(r.user);
    } catch (err) {
      setError(err.message || 'Could not create your account.');
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <div className="brand-mark">▚</div>
          <h1>Join Deck</h1>
          <p className="tagline">Set up your Full Chair account.</p>
        </div>

        {status === 'checking' && <p className="voice-sub" style={{ textAlign: 'center' }}>Checking your invite…</p>}

        {status === 'invalid' && (
          <>
            <p className="login-error" style={{ textAlign: 'center' }}>This invite link is invalid or has expired. Ask Deric for a new one.</p>
            <button className="btn ghost" style={{ width: '100%' }} onClick={onCancel}>Back to login</button>
          </>
        )}

        {status === 'ok' && (
          <form onSubmit={submit}>
            <input value={email} disabled readOnly />
            <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <input type="password" placeholder="Choose a password (min 6)" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="login-error">{error}</p>}
            <button type="submit" disabled={busy || !name.trim() || password.length < 6}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
