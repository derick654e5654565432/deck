import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { STATUS_META, STATUS_ORDER, recurDue } from './constants.js';
import { Icon } from './Icon.jsx';
import CalendarBoard from './CalendarBoard.jsx';
import AttentionBrowser from './AttentionBrowser.jsx';

const CLIENT_COLORS = ['#e8622c', '#6f8dff', '#3fca7f', '#a678f0', '#f0c649', '#e07bb4', '#4cc3c0'];
const clientColor = (id) => CLIENT_COLORS[(Number(id) || 0) % CLIENT_COLORS.length];

function fmtClock(s) {
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fmtHm(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (!h && !m) return '0m';
  return `${h ? h + 'h ' : ''}${m ? m + 'm' : ''}`.trim();
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Dashboard({ projects, clients, user, onOpen, onNew, onGo }) {
  const [recurring, setRecurring] = useState([]);
  const [focusTask, setFocusTask] = useState(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [byClient, setByClient] = useState({});
  const tick = useRef(null);

  useEffect(() => { api.recurring().then((r) => setRecurring(r.projects || [])).catch(() => {}); }, []);

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setElapsed((e) => e + 1);
      setByClient((m) => { const key = focusTask?.client_id ? 'c' + focusTask.client_id : 'none'; return { ...m, [key]: (m[key] || 0) + 1 }; });
    }, 1000);
    return () => clearInterval(tick.current);
  }, [running, focusTask]);

  const now = new Date();
  const dateLabel = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  const recDue = useMemo(() => {
    const out = [];
    for (const p of recurring) for (const t of p.todos || []) { const d = recurDue(t.recurrence, t.last_done_at); if (d?.due) out.push({ project: p, todo: t, info: d }); }
    return out;
  }, [recurring]);

  const counts = useMemo(() => {
    const c = {}; for (const s of STATUS_ORDER) c[s] = 0;
    for (const p of projects) if (c[p.status] != null) c[p.status]++;
    return c;
  }, [projects]);
  const maxCount = Math.max(1, ...Object.values(counts));

  const timeRows = useMemo(() => {
    const rows = Object.entries(byClient).map(([key, secs]) => {
      const cid = key === 'none' ? null : Number(key.slice(1));
      const cl = clients.find((c) => c.id === cid);
      return { key, name: cl ? cl.name : 'No client', secs, cid };
    });
    return rows.sort((a, b) => b.secs - a.secs);
  }, [byClient, clients]);
  const maxSecs = Math.max(1, ...timeRows.map((r) => r.secs));
  const totalSecs = timeRows.reduce((a, r) => a + r.secs, 0);
  const dayTargetSecs = 6 * 3600;

  function focusBlock(b) {
    if (focusTask?.id === b.id) { setRunning((r) => !r); return; }
    setFocusTask({ id: b.id, name: b.title, client_id: b.client_id, client_name: b.client_name || b.project_name });
    setElapsed(0); setRunning(true);
  }
  function toggleFocus() { if (focusTask) setRunning((r) => !r); }

  return (
    <div>
      <div className="page-head">
        <h1>{greeting()}, {(user?.name || 'there').split(' ')[0]}<span className="subdate">{dateLabel}</span></h1>
      </div>

      <div className="dash-grid cal-grid-wrap">
        {/* CALENDAR (was Today's schedule) */}
        <div className="fcard pad-lg">
          <div className="card-head">
            <span className="card-label"><Icon name="calendar" size={14} /> Calendar</span>
            <span className="card-hint">drag a project onto a time · click a slot to add</span>
          </div>
          <CalendarBoard
            projects={projects}
            clients={clients}
            onOpen={onOpen}
            onFocus={focusBlock}
            focusId={focusTask?.id}
            running={running}
          />
        </div>

        {/* RIGHT COLUMN */}
        <div className="dash-col">
          {/* FOCUS NOW */}
          <div className="fcard">
            <div className="card-head"><span className="card-label">Focus now</span></div>
            <div className="focus-sub">{focusTask ? focusTask.client_name || 'No client' : 'Press ▶ on a calendar event to start its timer'}</div>
            <div className="focus-timer">
              <button className="focus-btn" onClick={toggleFocus} disabled={!focusTask} title={running ? 'Pause' : 'Start'}>
                <Icon name={running ? 'pause' : 'play'} size={20} />
              </button>
              <div style={{ minWidth: 0 }}>
                <div className="focus-time">{fmtClock(elapsed)}</div>
                <div className="focus-est">{focusTask ? focusTask.name : 'nothing running'}</div>
              </div>
            </div>
            <div className="focus-prog-head"><span>Today</span><span>{fmtHm(totalSecs)} / 6h 00m</span></div>
            <div className="bar"><span style={{ width: Math.min(100, (totalSecs / dayTargetSecs) * 100) + '%' }} /></div>
          </div>

          {/* NEEDS ATTENTION → browser */}
          <AttentionBrowser projects={projects} recDue={recDue} clients={clients} onOpen={onOpen} />
        </div>
      </div>

      {/* ROW 3 — unchanged */}
      <div className="dash-row3">
        <div className="fcard">
          <div className="card-head"><span className="card-label">Recurring</span><span className="card-hint">comes back on a cadence</span></div>
          {recurring.length === 0 ? (
            <div className="sched-empty" style={{ padding: '18px 4px' }}>No recurring work yet.</div>
          ) : recurring.slice(0, 5).map((p) => {
            const t = (p.todos || [])[0];
            const d = t ? recurDue(t.recurrence, t.last_done_at) : null;
            return (
              <div className="rec-row" key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: 'pointer' }}>
                <span className="rec-ico"><Icon name="repeat" size={15} /></span>
                <div className="att-main"><div className="att-title">{p.name}</div><div className="att-sub">{p.client_name || 'Internal'}</div></div>
                {d?.due && <span className="due-now">Due now</span>}
                {t && <span className="tag plain">{cadence(t.recurrence)}</span>}
              </div>
            );
          })}
        </div>

        <div className="fcard">
          <div className="card-head"><span className="card-label"><Icon name="clock" size={14} /> Time tracked</span></div>
          {timeRows.length === 0 ? (
            <div className="sched-empty" style={{ padding: '18px 4px' }}>Start a timer from a calendar event and time logs here per client.</div>
          ) : timeRows.map((r) => (
            <div className="tw-row" key={r.key}>
              <span className="tw-name">{r.name}</span>
              <span className="tw-hours">{fmtHm(r.secs)}</span>
              <span className="tw-bar"><span style={{ width: (r.secs / maxSecs) * 100 + '%', background: clientColor(r.cid) }} /></span>
            </div>
          ))}
        </div>

        <div className="fcard">
          <div className="card-head"><span className="card-label">Pipeline</span><button className="card-hint linkish" onClick={() => onGo('pipeline')}>view →</button></div>
          {STATUS_ORDER.map((s) => (
            <div className="pipe-row" key={s}>
              <span className="pipe-name">{STATUS_META[s].label}</span>
              <span className="pipe-track"><span style={{ width: (counts[s] / maxCount) * 100 + '%', background: STATUS_META[s].color }} /></span>
              {counts[s] ? <span className="pipe-count">{counts[s]}</span> : <span className="pipe-empty">·</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function cadence(r) {
  return { daily: 'Daily', '3x_week': '3×/wk', '2x_week': '2×/wk', weekly: 'Weekly', biweekly: '2-weekly', monthly: 'Monthly' }[r] || r;
}
