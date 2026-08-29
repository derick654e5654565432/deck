import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { STATUS_META, STATUS_ORDER, deadlineInfo, recurDue } from './constants.js';
import { Icon } from './Icon.jsx';

const CLIENT_COLORS = ['#e8622c', '#6f8dff', '#3fca7f', '#a678f0', '#f0c649', '#e07bb4', '#4cc3c0'];
const clientColor = (id) => CLIENT_COLORS[(Number(id) || 0) % CLIENT_COLORS.length];

function fmtClock(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
function fmtHm(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
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
  // in-session focus timer
  const [focusTask, setFocusTask] = useState(null); // {id,name,client_id,client_name}
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [byClient, setByClient] = useState({}); // key -> seconds tracked this session
  const [pickOpen, setPickOpen] = useState(false);
  const tick = useRef(null);

  useEffect(() => {
    api.recurring().then((r) => setRecurring(r.projects || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (running) {
      tick.current = setInterval(() => {
        setElapsed((e) => e + 1);
        setByClient((m) => {
          const key = focusTask?.client_id ? 'c' + focusTask.client_id : 'none';
          return { ...m, [key]: (m[key] || 0) + 1 };
        });
      }, 1000);
      return () => clearInterval(tick.current);
    }
  }, [running, focusTask]);

  const now = new Date();
  const dateLabel = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  // ---- derive today's schedule + needs-attention from real data ----
  const dueToday = useMemo(
    () => projects.filter((p) => { const d = deadlineInfo(p.deadline); return d && d.level === 'today'; }),
    [projects]
  );
  const overdue = useMemo(
    () => projects.filter((p) => { const d = deadlineInfo(p.deadline); return d && d.level === 'overdue'; }),
    [projects]
  );
  const dueSoon = useMemo(
    () => projects.filter((p) => { const d = deadlineInfo(p.deadline); return d && d.level === 'soon'; }),
    [projects]
  );
  const inProgress = useMemo(() => projects.filter((p) => p.status === 'in_progress'), [projects]);

  // recurring items that are due now (flattened from recurring projects' todos)
  const recDue = useMemo(() => {
    const out = [];
    for (const p of recurring) {
      for (const t of p.todos || []) {
        const d = recurDue(t.recurrence, t.last_done_at);
        if (d?.due) out.push({ project: p, todo: t, info: d });
      }
    }
    return out;
  }, [recurring]);

  // schedule blocks: due-today, then in-progress, then recurring-due — time-boxed from 9:00
  const blocks = useMemo(() => {
    const seen = new Set();
    const items = [];
    for (const p of [...dueToday, ...inProgress]) {
      if (seen.has(p.id)) continue; seen.add(p.id);
      items.push({ id: 'p' + p.id, pid: p.id, title: p.name, client_id: p.client_id, sub: p.client_name || 'No client', kind: 'project' });
    }
    for (const r of recDue) {
      items.push({ id: 'r' + r.todo.id, pid: r.project.id, title: r.todo.text, client_id: r.project.client_id, sub: (r.project.client_name || r.project.name) + ' · recurring', kind: 'recurring' });
    }
    // assign start hours 9,10.5,12,13.5,... (1.5h blocks), cap at 6
    return items.slice(0, 6).map((it, i) => {
      const startMin = 9 * 60 + i * 90;
      const h = Math.floor(startMin / 60), m = startMin % 60;
      return { ...it, start: `${h}:${String(m).padStart(2, '0')}`, dur: '1h 30m' };
    });
  }, [dueToday, inProgress, recDue]);

  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

  // ---- pipeline counts ----
  const counts = useMemo(() => {
    const c = {};
    for (const s of STATUS_ORDER) c[s] = 0;
    for (const p of projects) if (c[p.status] != null) c[p.status]++;
    return c;
  }, [projects]);
  const maxCount = Math.max(1, ...Object.values(counts));

  // ---- time this week (session-tracked) ----
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

  function startBlock(b) {
    setFocusTask({ id: b.id, name: b.title, client_id: b.client_id, client_name: b.sub, pid: b.pid });
    setElapsed(0);
    setRunning(true);
  }
  function toggleFocus() {
    if (!focusTask && blocks.length) { startBlock(blocks[0]); return; }
    setRunning((r) => !r);
  }

  const attention = [
    ...overdue.map((p) => ({ id: 'o' + p.id, pid: p.id, color: 'var(--danger)', title: `${p.name} — overdue`, sub: p.client_name || 'No client', tag: 'Overdue', tagCls: 'danger' })),
    ...dueToday.map((p) => ({ id: 't' + p.id, pid: p.id, color: 'var(--warn)', title: `${p.name} — due today`, sub: p.client_name || 'No client', tag: 'Due today', tagCls: 'warn' })),
    ...dueSoon.map((p) => ({ id: 's' + p.id, pid: p.id, color: 'var(--yellow)', title: `${p.name} — due soon`, sub: p.client_name || 'No client', tag: 'Due soon', tagCls: 'plain' })),
    ...recDue.slice(0, 4).map((r) => ({ id: 'ra' + r.todo.id, pid: r.project.id, color: 'var(--accent)', title: r.todo.text, sub: r.project.client_name || r.project.name, tag: 'Recurring', tagCls: 'rec' })),
  ].slice(0, 6);

  return (
    <div>
      <div className="page-head">
        <h1>{greeting()}, {(user?.name || 'there').split(' ')[0]}<span className="subdate">{dateLabel}</span></h1>
        {blocks.length > 0 && <span className="head-pill">{blocks.length} {blocks.length === 1 ? 'task' : 'tasks'} scheduled today</span>}
      </div>

      <div className="dash-grid">
        {/* TODAY'S SCHEDULE */}
        <div className="fcard pad-lg">
          <div className="card-head">
            <span className="card-label"><Icon name="calendar" size={14} /> Today's schedule</span>
            <span className="card-hint">press play on a block to start its timer</span>
          </div>
          {blocks.length === 0 ? (
            <div className="sched-empty">Nothing scheduled today. Set a deadline for today or add a recurring task and it lands here.</div>
          ) : (
            <div className="sched">
              {hours.map((h, i) => {
                const b = blocks[i];
                return (
                  <div className="sched-row" key={h}>
                    <div className="sched-hour">{h}:00</div>
                    <div className="sched-lane">
                      {b && (
                        <div className={'sched-block' + (focusTask?.id === b.id ? (b.kind === 'recurring' ? ' accent' : ' accent') : '')}
                          onClick={() => onOpen(b.pid)}>
                          <button className={'sched-play' + (running && focusTask?.id === b.id ? ' running' : '')}
                            onClick={(e) => { e.stopPropagation(); if (focusTask?.id === b.id) toggleFocus(); else startBlock(b); }}
                            title="Start timer">
                            <Icon name={running && focusTask?.id === b.id ? 'pause' : 'play'} size={12} />
                          </button>
                          <div style={{ minWidth: 0 }}>
                            <div className="sched-title">{b.title}</div>
                            <div className="sched-sub">{b.sub} · {b.dur}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="dash-col">
          {/* FOCUS NOW */}
          <div className="fcard">
            <div className="card-head"><span className="card-label">Focus now</span></div>
            <div style={{ position: 'relative' }}>
              <button className="focus-select" onClick={() => setPickOpen((o) => !o)}>
                <span>{focusTask ? focusTask.name : 'Pick something to focus on'}</span>
                <span className="chev"><Icon name="chevron" size={16} /></span>
              </button>
              {pickOpen && (
                <div className="focus-menu">
                  {blocks.length === 0 && <div className="focus-menu-empty">No tasks today</div>}
                  {blocks.map((b) => (
                    <button key={b.id} className="focus-menu-item" onClick={() => { startBlock(b); setPickOpen(false); }}>
                      {b.title}<span>{b.sub}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="focus-sub">{focusTask ? focusTask.client_name : 'Your live timer — nothing running yet'}</div>
            <div className="focus-timer">
              <button className="focus-btn" onClick={toggleFocus} title={running ? 'Pause' : 'Start'}>
                <Icon name={running ? 'pause' : 'play'} size={20} />
              </button>
              <div>
                <div className="focus-time">{fmtClock(elapsed)}</div>
                <div className="focus-est">{running ? 'tracking now' : focusTask ? 'paused' : 'press play to start'}</div>
              </div>
            </div>
            <div className="focus-prog-head"><span>Today</span><span>{fmtHm(totalSecs)} / 6h 00m</span></div>
            <div className="bar"><span style={{ width: Math.min(100, (totalSecs / dayTargetSecs) * 100) + '%' }} /></div>
          </div>

          {/* NEEDS ATTENTION */}
          <div className="fcard">
            <div className="card-head"><span className="card-label"><Icon name="alert" size={14} /> Needs attention</span></div>
            {attention.length === 0 ? (
              <div className="sched-empty" style={{ padding: '18px 4px' }}>All clear — nothing overdue or due soon.</div>
            ) : attention.map((a) => (
              <div className="att-row" key={a.id} onClick={() => onOpen(a.pid)} style={{ cursor: 'pointer' }}>
                <span className="att-dot" style={{ background: a.color }} />
                <div className="att-main">
                  <div className="att-title">{a.title}</div>
                  <div className="att-sub">{a.sub}</div>
                </div>
                <span className={'tag ' + a.tagCls}>{a.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ROW 3 */}
      <div className="dash-row3">
        {/* RECURRING */}
        <div className="fcard">
          <div className="card-head">
            <span className="card-label">Recurring</span>
            <span className="card-hint">comes back on a cadence</span>
          </div>
          {recurring.length === 0 ? (
            <div className="sched-empty" style={{ padding: '18px 4px' }}>No recurring work yet.</div>
          ) : recurring.slice(0, 5).map((p) => {
            const t = (p.todos || [])[0];
            const d = t ? recurDue(t.recurrence, t.last_done_at) : null;
            return (
              <div className="rec-row" key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: 'pointer' }}>
                <span className="rec-ico"><Icon name="repeat" size={15} /></span>
                <div className="att-main">
                  <div className="att-title">{p.name}</div>
                  <div className="att-sub">{p.client_name || 'Internal'}{t ? '' : ''}</div>
                </div>
                {d?.due && <span className="due-now">Due now</span>}
                {t && <span className="tag plain">{cadence(t.recurrence)}</span>}
              </div>
            );
          })}
        </div>

        {/* TIME THIS WEEK */}
        <div className="fcard">
          <div className="card-head"><span className="card-label"><Icon name="clock" size={14} /> Time tracked</span></div>
          {timeRows.length === 0 ? (
            <div className="sched-empty" style={{ padding: '18px 4px' }}>Start a timer from Today's schedule and time logs here per client.</div>
          ) : timeRows.map((r) => (
            <div className="tw-row" key={r.key}>
              <span className="tw-name">{r.name}</span>
              <span className="tw-hours">{fmtHm(r.secs)}</span>
              <span className="tw-bar"><span style={{ width: (r.secs / maxSecs) * 100 + '%', background: clientColor(r.cid) }} /></span>
            </div>
          ))}
        </div>

        {/* PIPELINE */}
        <div className="fcard">
          <div className="card-head">
            <span className="card-label">Pipeline</span>
            <button className="card-hint linkish" onClick={() => onGo('pipeline')}>view →</button>
          </div>
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
