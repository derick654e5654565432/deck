import { useState } from 'react';
import { api } from './api.js';

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.login(email.trim(), password);
      onSuccess(r.user);
    } catch {
      setError('That email or password did not match. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <div className="brand-mark">▚</div>
          <h1>Deck</h1>
          <p className="tagline">Everything you're carrying, in one place.</p>
        </div>
        <form onSubmit={submit}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? 'Opening…' : 'Open Deck'}
          </button>
        </form>
        <p className="login-foot">Full Chair members only. Ask Deric for an invite.</p>
      </div>
    </div>
  );
}
