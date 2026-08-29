import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { RECURRENCE_META, recurDue } from './constants.js';
import ClientAvatar from './ClientAvatar.jsx';
import ClientPicker from './ClientPicker.jsx';

function firstName(n) { return (n || '').split(' ')[0] || n || '?'; }

function RecurRow({ t, showProject, onOpen, onLog }) {
  const rd = recurDue(t.recurrence, t.last_done_at) || { label: '', color: '#888', due: false };
  return (
    <li className={'recur-row' + (rd.due ? ' due' : ' logged')}>
      <button className="check" title="Mark done for this cycle" onClick={() => onLog(t)}>{rd.due ? '' : '✓'}</button>
      <div className="recur-main">
        <span className="recur-text">{t.text}</span>
        <span className="recur-sub">
          <span className="todo-recur" style={{ '--rc': rd.color }}>🔁 {RECURRENCE_META[t.recurrence]?.short} · {rd.label}</span>
          {t.assignee_name && <span className="mytask-who">→ {firstName(t.assignee_name)}</span>}
          {showProject && <button className="recur-project" onClick={() => onOpen(t.project_id)}>{t.project_name}</button>}
        </span>
      </div>
    </li>
  );
}

export default function RecurringView({ user, clients = [], onOpen, onChanged }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProjects((await api.recurring()).projects || []); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  async function log(t) { await api.updateTodo(t.id, { done: 1 }); await load(); onChanged?.(); }

  async function createRecurring(e) {
    e.preventDefault();
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.createProject({ name: newName.trim(), recurring: true, client_id: newClient, status: 'in_progress' });
      setNewName(''); setNewClient(null);
      await load();
      onChanged?.();
      onOpen(r.id); // jump in to add its recurring tasks
    } finally { setBusy(false); }
  }

  if (loading) return <div className="loading">Loading recurring work…</div>;

  // Flat "due now" roll-up across every recurring project.
  const dueNow = [];
  for (const p of projects) for (const t of (p.todos || [])) if (t.due) dueNow.push({ ...t, project_name: p.name, client_name: p.client_name });

  return (
    <div className="recurring">
      <div className="recurring-head">
        <div>
          <h1 className="recurring-title">🔁 Recurring work</h1>
          <p className="column-sub">Ongoing projects and the tasks that keep needing to happen. Tick one to log it done for this cycle — it comes back when it's due again.</p>
        </div>
      </div>

      <form className="recur-new" onSubmit={createRecurring}>
        <input placeholder="New recurring project (e.g. Meta Ads — Funkyfing)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <ClientPicker clients={clients} value={newClient} onPick={setNewClient} onManage={() => {}} />
        <button type="submit" className="btn primary" disabled={!newName.trim() || busy}>＋ New recurring project</button>
      </form>

      {dueNow.length > 0 && (
        <section className="recur-due-now">
          <div className="column-head"><h2>⏰ Due now</h2><span className="column-count urgent">{dueNow.length}</span></div>
          <p className="column-sub">Recurring tasks past their cadence — these need doing.</p>
          <ul className="recur-list">
            {dueNow.map((t) => <RecurRow key={t.id} t={t} showProject onOpen={onOpen} onLog={log} />)}
          </ul>
        </section>
      )}

      {projects.length === 0 && (
        <p className="empty">No recurring projects yet. Create one above — think "Meta Ads — {'{client}'}", then add tasks like "Create creatives" at 2×/week.</p>
      )}

      <div className="recur-grid">
        {projects.map((p) => {
          const recurTodos = (p.todos || []).filter((t) => t.recurrence);
          const others = (p.shared_with || []).filter(Boolean);
          return (
            <section className="recur-card" key={p.id}>
              <div className="recur-card-head">
                <button className="recur-card-title" onClick={() => onOpen(p.id)}>
                  {p.client_name && <ClientAvatar client={{ id: p.client_id, name: p.client_name, has_logo: !!p.client_has_logo, updated_at: p.client_updated }} size={20} />}
                  <span>{p.name}</span>
                </button>
                <div className="recur-card-meta">
                  {p.due_count > 0 && <span className="chip urgent-chip">{p.due_count} due</span>}
                  {p.shared ? <span className="chip shared-chip" title={`Shared by ${p.owner_name}`}>🤝 from {firstName(p.owner_name)}</span>
                    : others.length > 0 ? <span className="chip shared-chip" title={`Shared with ${others.join(', ')}`}>🤝 with {others.map(firstName).join(', ')}</span> : null}
                </div>
              </div>
              <ul className="recur-list">
                {recurTodos.map((t) => <RecurRow key={t.id} t={t} onOpen={onOpen} onLog={log} />)}
                {recurTodos.length === 0 && <li className="empty">No recurring tasks yet — open the project to add some.</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
