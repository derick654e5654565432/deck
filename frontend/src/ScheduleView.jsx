import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { deadlineInfo, recurDue } from './constants.js';
import { Icon } from './Icon.jsx';
import ClientAvatar from './ClientAvatar.jsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ScheduleView({ projects, clients, onOpen }) {
  const [recurring, setRecurring] = useState([]);
  useEffect(() => { api.recurring().then((r) => setRecurring(r.projects || [])).catch(() => {}); }, []);

  const now = new Date();
  const dateLabel = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const clientById = useMemo(() => Object.fromEntries((clients || []).map((c) => [c.id, c])), [clients]);

  const groups = useMemo(() => {
    const g = { overdue: [], today: [], tomorrow: [], week: [], later: [] };
    for (const p of projects) {
      const d = deadlineInfo(p.deadline);
      if (!d) continue;
      const bucket = d.level === 'overdue' ? 'overdue' : d.days === 0 ? 'today' : d.days === 1 ? 'tomorrow' : d.days <= 7 ? 'week' : 'later';
      g[bucket].push({ kind: 'project', id: p.id, name: p.name, client_id: p.client_id, client_name: p.client_name, when: d.label, color: d.color, days: d.days });
    }
    for (const p of recurring) {
      for (const t of p.todos || []) {
        const d = recurDue(t.recurrence, t.last_done_at);
        if (d?.due) g.today.push({ kind: 'recurring', id: p.id, name: t.text, client_id: p.client_id, client_name: p.client_name || p.name, when: d.label, color: 'var(--accent)', days: 0 });
      }
    }
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.days - b.days);
    return g;
  }, [projects, recurring]);

  const sections = [
    { key: 'overdue', label: 'Overdue', accent: 'var(--danger)' },
    { key: 'today', label: 'Today', accent: 'var(--accent)' },
    { key: 'tomorrow', label: 'Tomorrow', accent: 'var(--warn)' },
    { key: 'week', label: 'This week', accent: 'var(--yellow)' },
    { key: 'later', label: 'Later', accent: 'var(--text-faint)' },
  ].filter((s) => groups[s.key].length);

  const total = Object.values(groups).reduce((a, x) => a + x.length, 0);

  return (
    <div>
      <div className="page-head">
        <h1>Schedule<span className="subdate">{dateLabel}</span></h1>
        {total > 0 && <span className="head-pill">{total} dated {total === 1 ? 'item' : 'items'}</span>}
      </div>

      {sections.length === 0 ? (
        <div className="fcard"><div className="sched-empty">Nothing has a deadline yet. Add a deadline to a project and it shows up here.</div></div>
      ) : (
        <div className="sched-cols">
          {sections.map((s) => (
            <div className="fcard" key={s.key}>
              <div className="card-head">
                <span className="card-label" style={{ color: s.accent }}>{s.label}</span>
                <span className="card-hint">{groups[s.key].length}</span>
              </div>
              {groups[s.key].map((it) => (
                <div className="agenda-row" key={it.kind + it.id + it.name} onClick={() => onOpen(it.id)}>
                  <span className="agenda-bar" style={{ background: it.color }} />
                  {it.client_id && clientById[it.client_id] ? <ClientAvatar client={clientById[it.client_id]} size={26} /> : <span className="agenda-dot" />}
                  <div className="att-main">
                    <div className="att-title">{it.name}</div>
                    <div className="att-sub">{it.client_name || 'No client'} · {it.when}</div>
                  </div>
                  {it.kind === 'recurring' && <span className="rec-ico"><Icon name="repeat" size={14} /></span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
