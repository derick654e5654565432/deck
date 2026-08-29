import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { api } from './api.js';
import { STATUS_META, STATUS_ORDER, deadlineInfo } from './constants.js';
import { Icon } from './Icon.jsx';
import ClientAvatar from './ClientAvatar.jsx';

// ---- date helpers (local, not UTC) ----
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
function fmtClock(s) { return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; }
const DUR_STEPS = [15, 30, 45, 60, 90, 120, 180, 240];

export default function Planner({ projects, clients, user, onOpen, onNew }) {
  const [blocks, setBlocks] = useState([]);
  const [expanded, setExpanded] = useState(null);      // backlog project id expanded
  const [todosByProject, setTodosByProject] = useState({});
  const [dragOver, setDragOver] = useState(null);       // day key being hovered
  const [loading, setLoading] = useState(true);

  // focus timer (in-session)
  const [focus, setFocus] = useState(null);             // {blockId, title, client_id, sub}
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [tracked, setTracked] = useState(0);            // total seconds this session
  const tick = useRef(null);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayDefs = useMemo(() => [-1, 0, 1, 2].map((off) => {
    const d = addDays(today, off);
    const label = off === -1 ? 'Yesterday' : off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : WD[d.getDay()];
    return { off, key: keyOf(d), label, sub: `${d.getDate()} ${MO[d.getMonth()]}`, isToday: off === 0, isPast: off < 0 };
  }), [today.getTime()]);

  const from = dayDefs[0].key, to = dayDefs[dayDefs.length - 1].key;
  const reload = useCallback(async () => {
    try { const r = await api.plan(from, to); setBlocks(r.blocks || []); } catch {}
    setLoading(false);
  }, [from, to]);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setElapsed((e) => e + 1);
      setTracked((t) => t + 1);
    }, 1000);
    return () => clearInterval(tick.current);
  }, [running]);

  // ---- backlog ----
  const backlog = useMemo(() => {
    return [...projects]
      .map((p) => ({ ...p, dl: deadlineInfo(p.deadline) }))
      .sort((a, b) => {
        const rank = (x) => x.dl?.level === 'overdue' ? 0 : x.dl?.level === 'today' ? 1 : x.status === 'in_progress' ? 2 : x.status === 'waiting' ? 3 : 4;
        return rank(a) - rank(b) || (a.sort - b.sort);
      });
  }, [projects]);

  async function toggleExpand(pid) {
    if (expanded === pid) { setExpanded(null); return; }
    setExpanded(pid);
    if (!todosByProject[pid]) {
      try { const r = await api.project(pid); setTodosByProject((m) => ({ ...m, [pid]: (r.project.todos || []).filter((t) => !t.done) })); } catch {}
    }
  }

  const byDay = useCallback((key) => blocks.filter((b) => b.day === key).sort((a, b) => a.sort - b.sort), [blocks]);

  // ---- drag & drop ----
  function onDragStart(e, payload) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  }
  async function drop(e, day, beforeId = null) {
    e.preventDefault(); e.stopPropagation();
    setDragOver(null);
    let data; try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    let blockId = data.block_id;
    if (data.src === 'backlog') {
      try { const r = await api.addPlan({ kind: data.kind, ref_id: data.ref_id, day }); blockId = r.id; }
      catch { return; }
    }
    // build the target day's ordered id list with blockId inserted
    const dayIds = byDay(day).map((b) => b.id).filter((id) => id !== blockId);
    const idx = beforeId ? Math.max(0, dayIds.indexOf(beforeId)) : dayIds.length;
    dayIds.splice(idx, 0, blockId);
    try {
      await api.reorderPlan(day, dayIds.map((id, i) => ({ id, day, sort: i })));
      await reload();
    } catch {}
  }

  async function setDuration(b, delta) {
    const i = DUR_STEPS.findIndex((s) => s >= b.duration_min);
    let next = delta > 0 ? DUR_STEPS[Math.min(DUR_STEPS.length - 1, (i < 0 ? DUR_STEPS.length - 1 : i) + 1)]
      : DUR_STEPS[Math.max(0, (i < 0 ? 0 : i) - 1)];
    if (next === b.duration_min) return;
    setBlocks((bs) => bs.map((x) => x.id === b.id ? { ...x, duration_min: next } : x));
    api.updatePlan(b.id, { duration_min: next }).catch(() => {});
  }
  async function toggleDone(b) {
    const done = !b.done;
    setBlocks((bs) => bs.map((x) => x.id === b.id ? { ...x, done } : x));
    try { await api.updatePlan(b.id, { done }); } catch {}
  }
  async function setStatus(b, status) {
    setBlocks((bs) => bs.map((x) => x.project_id === b.project_id ? { ...x, status } : x));
    try { await api.updateProject(b.project_id, { status }); } catch {}
  }
  async function removeBlock(b) {
    setBlocks((bs) => bs.filter((x) => x.id !== b.id));
    api.deletePlan(b.id).catch(() => {});
  }
  async function carryToToday(b) {
    const day = dayDefs[1].key;
    setBlocks((bs) => bs.map((x) => x.id === b.id ? { ...x, day } : x));
    try { await api.updatePlan(b.id, { day }); await reload(); } catch {}
  }

  function startTimer(b) {
    setFocus({ blockId: b.id, title: b.title, client_id: b.client_id, sub: b.client_name || b.project_name });
    setElapsed(0); setRunning(true);
  }
  function toggleTimer() { setRunning((r) => !r); }

  const clientById = useMemo(() => Object.fromEntries((clients || []).map((c) => [c.id, c])), [clients]);
  const dayTotal = (key) => byDay(key).reduce((a, b) => a + (b.done ? 0 : b.duration_min), 0);

  return (
    <div className="planner">
      <div className="page-head">
        <h1>Plan<span className="subdate">{WD[today.getDay()]} {today.getDate()} {MO[today.getMonth()]} {today.getFullYear()}</span></h1>
        <div className={'focusbar' + (focus ? ' active' : '')}>
          <button className="focusbar-btn" onClick={focus ? toggleTimer : () => backlogFirst()} title={running ? 'Pause' : 'Start'} disabled={!focus}>
            <Icon name={running ? 'pause' : 'play'} size={15} />
          </button>
          <div className="focusbar-body">
            <div className="focusbar-title">{focus ? focus.title : 'No timer running'}</div>
            <div className="focusbar-sub">{focus ? focus.sub : 'press ▶ on a card to focus'}</div>
          </div>
          <div className="focusbar-time">{fmtClock(elapsed)}</div>
        </div>
      </div>

      <div className="planner-body">
        {/* BACKLOG */}
        <aside className="backlog">
          <div className="backlog-head">
            <span className="card-label"><Icon name="alert" size={14} /> Needs attention</span>
            <button className="mini-btn" onClick={onNew} title="New project"><Icon name="plus" size={14} /></button>
          </div>
          <div className="backlog-hint">Drag a project — or open it and drag a task — onto a day.</div>
          <div className="backlog-list">
            {backlog.length === 0 && <div className="sched-empty" style={{ padding: 20 }}>No active projects.</div>}
            {backlog.map((p) => (
              <div className="bl-item" key={p.id}>
                <div className="bl-row" draggable onDragStart={(e) => onDragStart(e, { src: 'backlog', kind: 'project', ref_id: p.id })}>
                  <span className="bl-grip"><Icon name="grid" size={13} /></span>
                  {p.client_id && clientById[p.client_id] ? <ClientAvatar client={clientById[p.client_id]} size={22} /> : <span className="bl-nodot" />}
                  <button className="bl-name" onClick={() => toggleExpand(p.id)} title="Show tasks">
                    {p.name}
                    {p.dl && (p.dl.level === 'overdue' || p.dl.level === 'today') && <span className="bl-flag" style={{ color: p.dl.color }}>{p.dl.rel}</span>}
                  </button>
                  <span className="bl-status" style={{ '--s': STATUS_META[p.status]?.color }}>{STATUS_META[p.status]?.label}</span>
                  <button className="bl-open" onClick={() => onOpen(p.id)} title="Open project"><Icon name="arrow" size={13} /></button>
                </div>
                {expanded === p.id && (
                  <div className="bl-todos">
                    {(todosByProject[p.id] || []).length === 0 && <div className="bl-todo-empty">No open tasks — drag the project itself.</div>}
                    {(todosByProject[p.id] || []).map((t) => (
                      <div className="bl-todo" key={t.id} draggable onDragStart={(e) => onDragStart(e, { src: 'backlog', kind: 'todo', ref_id: t.id })}>
                        <span className="bl-grip"><Icon name="grid" size={11} /></span>{t.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* DAY COLUMNS */}
        <div className="days">
          {dayDefs.map((d) => {
            const items = byDay(d.key);
            return (
              <section
                key={d.key}
                className={'day' + (d.isToday ? ' today' : '') + (d.isPast ? ' past' : '') + (dragOver === d.key ? ' over' : '')}
                onDragOver={(e) => { e.preventDefault(); setDragOver(d.key); }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(null); }}
                onDrop={(e) => drop(e, d.key)}
              >
                <header className="day-head">
                  <div>
                    <span className="day-label">{d.label}</span>
                    <span className="day-date">{d.sub}</span>
                  </div>
                  {dayTotal(d.key) > 0 && <span className="day-total">{fmtDur(dayTotal(d.key))}</span>}
                </header>
                <div className="day-drop">
                  {items.length === 0 && <div className="day-empty">Drop work here</div>}
                  {items.map((b) => (
                    <article
                      key={b.id}
                      className={'pcard' + (b.done ? ' done' : '') + (focus?.blockId === b.id ? ' focused' : '')}
                      draggable
                      onDragStart={(e) => onDragStart(e, { src: 'plan', block_id: b.id })}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => drop(e, d.key, b.id)}
                      style={{ '--stripe': clientColor(b.client_id) }}
                    >
                      <div className="pcard-top">
                        <button className={'pcard-check' + (b.done ? ' on' : '')} onClick={() => toggleDone(b)} title="Done">
                          {b.done && <Icon name="check" size={12} />}
                        </button>
                        <div className="pcard-main" onClick={() => onOpen(b.project_id)}>
                          <div className="pcard-title">{b.title}</div>
                          <div className="pcard-sub">
                            {b.kind === 'todo' ? b.project_name : (b.client_name || 'No client')}
                          </div>
                        </div>
                        <button className="pcard-x" onClick={() => removeBlock(b)} title="Remove from day">×</button>
                      </div>
                      <div className="pcard-foot">
                        <div className="dur">
                          <button onClick={() => setDuration(b, -1)}>−</button>
                          <span>{fmtDur(b.duration_min)}</span>
                          <button onClick={() => setDuration(b, 1)}>+</button>
                        </div>
                        <select className="pcard-status" style={{ '--s': STATUS_META[b.status]?.color }} value={b.status || 'idea'} onChange={(e) => setStatus(b, e.target.value)} onClick={(e) => e.stopPropagation()}>
                          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                        </select>
                        {d.isPast && !b.done && <button className="pcard-carry" onClick={() => carryToToday(b)} title="Move to today">→ Today</button>}
                        <button className={'pcard-play' + (running && focus?.blockId === b.id ? ' on' : '')} onClick={() => focus?.blockId === b.id ? toggleTimer() : startTimer(b)} title="Focus timer">
                          <Icon name={running && focus?.blockId === b.id ? 'pause' : 'play'} size={12} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );

  function backlogFirst() { if (blocks[0]) startTimer(blocks[0]); }
}

const CLIENT_COLORS = ['#e8622c', '#6f8dff', '#3fca7f', '#a678f0', '#f0c649', '#e07bb4', '#4cc3c0'];
function clientColor(id) { return id ? CLIENT_COLORS[Number(id) % CLIENT_COLORS.length] : '#6f6f79'; }
