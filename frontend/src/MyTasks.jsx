import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { deadlineInfo } from './constants.js';

function firstName(n) { return (n || '').split(' ')[0] || n || '?'; }

function TaskRow({ t, who, whoLabel, onOpen, onDone }) {
  const dl = deadlineInfo(t.deadline);
  return (
    <li className="mytask-row">
      <button className="check" title="Mark done" onClick={() => onDone(t)} aria-label="done" />
      <button className="mytask-text" onClick={() => onOpen(t.project_id)}>
        <span className="mytask-title">{t.text}</span>
        <span className="mytask-sub">
          {t.client_name && <span className="chip">{t.client_name}</span>}
          <span className="mytask-project">{t.project_name}</span>
          {who && <span className="mytask-who">{whoLabel} {firstName(who)}</span>}
        </span>
      </button>
      {dl && <span className="pill" style={{ '--dl': dl.color }}><span className="pill-dot" />{dl.label}</span>}
    </li>
  );
}

export default function MyTasks({ user, onOpen, onChanged }) {
  const [data, setData] = useState({ assignedToMe: [], handedOff: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.tasks()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  async function done(t) {
    await api.updateTodo(t.id, { done: 1 });
    await load();
    onChanged?.();
  }

  const { assignedToMe, handedOff } = data;

  if (loading) return <div className="loading">Loading your tasks…</div>;

  return (
    <div className="mytasks">
      <section className="mytasks-col">
        <div className="column-head">
          <h2>📥 Assigned to me</h2>
          <span className="column-count">{assignedToMe.length}</span>
        </div>
        <p className="column-sub">Everything anyone has handed to you, across every shared project.</p>
        <ul className="mytask-list">
          {assignedToMe.map((t) => (
            <TaskRow key={t.id} t={t} who={t.created_by_name} whoLabel="from" onOpen={onOpen} onDone={done} />
          ))}
          {assignedToMe.length === 0 && <li className="empty">Nothing on your plate right now. 🎉</li>}
        </ul>
      </section>

      <section className="mytasks-col">
        <div className="column-head">
          <h2>📤 Handed off by me</h2>
          <span className="column-count">{handedOff.length}</span>
        </div>
        <p className="column-sub">Open tasks you've assigned to someone else — what you're waiting on.</p>
        <ul className="mytask-list">
          {handedOff.map((t) => (
            <TaskRow key={t.id} t={t} who={t.assignee_name} whoLabel="→" onOpen={onOpen} onDone={done} />
          ))}
          {handedOff.length === 0 && <li className="empty">You haven't handed anything off yet.</li>}
        </ul>
      </section>
    </div>
  );
}
