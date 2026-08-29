import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { Icon } from './Icon.jsx';

const START_H = 6, END_H = 22;               // 6am – 10pm
const HOURS = END_H - START_H;               // 16
const HOUR_H = 46;                            // px per hour
const SNAP = 15;                              // minutes
const DAY_MIN0 = START_H * 60, DAY_MIN1 = END_H * 60;

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CLIENT_COLORS = ['#e8622c', '#6f8dff', '#3fca7f', '#a678f0', '#f0c649', '#e07bb4', '#4cc3c0'];
const clientColor = (id) => id ? CLIENT_COLORS[Number(id) % CLIENT_COLORS.length] : '#8a8a93';

const hourLabel = (h) => { const ap = h < 12 ? 'AM' : 'PM'; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh} ${ap}`; };
const fmtTime = (m) => { const h = Math.floor(m / 60), mm = m % 60; const ap = h < 12 ? 'AM' : 'PM'; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh}:${pad(mm)} ${ap}`; };
const toHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fromHHMM = (s) => { const [h, m] = String(s).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const snap = (m) => Math.round(m / SNAP) * SNAP;

export default function CalendarBoard({ projects, clients, onOpen, onFocus, focusId, running }) {
  const [blocks, setBlocks] = useState([]);
  const [dragCol, setDragCol] = useState(null);
  const [edit, setEdit] = useState(null);    // { block, x, y }
  const [addAt, setAddAt] = useState(null);   // { day, min, x, y }
  const [addQuery, setAddQuery] = useState('');
  const resizeRef = useRef(null);
  const gridRef = useRef(null);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = useMemo(() => [-1, 0, 1, 2].map((off) => {
    const d = addDays(today, off);
    return { off, key: keyOf(d), label: off === -1 ? 'Yesterday' : off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : WD[d.getDay()], sub: `${d.getDate()} ${MO[d.getMonth()]}`, isToday: off === 0, isPast: off < 0 };
  }), [today.getTime()]);

  const from = days[0].key, to = days[days.length - 1].key;
  const reload = useCallback(async () => {
    try { const r = await api.plan(from, to); setBlocks(r.blocks || []); } catch {}
  }, [from, to]);
  useEffect(() => { reload(); }, [reload]);

  const byDay = (key) => blocks.filter((b) => b.day === key);

  function yToMin(clientY, colEl) {
    const rect = colEl.getBoundingClientRect();
    const y = clientY - rect.top;
    let m = DAY_MIN0 + snap((y / HOUR_H) * 60);
    return Math.max(DAY_MIN0, Math.min(DAY_MIN1 - SNAP, m));
  }

  async function onColDrop(e, day) {
    e.preventDefault(); setDragCol(null);
    let data; try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    const min = yToMin(e.clientY, e.currentTarget);
    try {
      if (data.src === 'plan') await api.updatePlan(data.block_id, { day, start_min: min });
      else await api.addPlan({ kind: data.kind || 'project', ref_id: data.ref_id, day, start_min: min, duration_min: 60 });
      await reload();
    } catch {}
  }

  function onColClick(e, day) {
    if (e.target !== e.currentTarget) return;   // only empty space
    const min = yToMin(e.clientY, e.currentTarget);
    setEdit(null);
    setAddQuery('');
    setAddAt({ day, min, x: e.clientX, y: e.clientY });
  }

  async function addProject(p) {
    try { await api.addPlan({ kind: 'project', ref_id: p.id, day: addAt.day, start_min: addAt.min, duration_min: 60 }); setAddAt(null); await reload(); } catch {}
  }

  // pointer resize (drag bottom edge)
  function startResize(e, b) {
    e.stopPropagation(); e.preventDefault();
    resizeRef.current = { id: b.id, startY: e.clientY, startDur: b.duration_min };
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeUp, { once: true });
  }
  function onResizeMove(e) {
    const r = resizeRef.current; if (!r) return;
    const dMin = snap(((e.clientY - r.startY) / HOUR_H) * 60);
    const dur = Math.max(15, Math.min(720, r.startDur + dMin));
    setBlocks((bs) => bs.map((x) => x.id === r.id ? { ...x, duration_min: dur } : x));
  }
  function onResizeUp() {
    window.removeEventListener('pointermove', onResizeMove);
    const r = resizeRef.current; resizeRef.current = null;
    if (!r) return;
    const b = blocks.find((x) => x.id === r.id) || {};
    api.updatePlan(r.id, { duration_min: b.duration_min }).catch(() => {});
  }

  async function patch(id, body) {
    setBlocks((bs) => bs.map((x) => x.id === id ? { ...x, ...body } : x));
    try { await api.updatePlan(id, body); await reload(); } catch {}
  }
  async function remove(id) { setBlocks((bs) => bs.filter((x) => x.id !== id)); setEdit(null); api.deletePlan(id).catch(() => {}); }

  const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
  const showNowLine = nowMin >= DAY_MIN0 && nowMin <= DAY_MIN1;

  const addMatches = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    return projects.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.client_name || '').toLowerCase().includes(q)).slice(0, 8);
  }, [projects, addQuery]);

  return (
    <div className="cal" onClick={() => { setEdit(null); setAddAt(null); }}>
      <div className="cal-head">
        <div className="cal-gutter-h" />
        {days.map((d) => (
          <div key={d.key} className={'cal-dayhead' + (d.isToday ? ' today' : '') + (d.isPast ? ' past' : '')}>
            <span className="cal-dayname">{d.label}</span><span className="cal-daydate">{d.sub}</span>
          </div>
        ))}
      </div>
      <div className="cal-grid" ref={gridRef} style={{ height: HOURS * HOUR_H }}>
        <div className="cal-gutter">
          {Array.from({ length: HOURS + 1 }, (_, i) => (
            <div className="cal-hour-label" key={i} style={{ top: i * HOUR_H }}>{i < HOURS ? hourLabel(START_H + i) : ''}</div>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d.key}
            className={'cal-col' + (d.isToday ? ' today' : '') + (dragCol === d.key ? ' over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDragCol(d.key); }}
            onDragLeave={(e) => { if (e.target === e.currentTarget) setDragCol(null); }}
            onDrop={(e) => onColDrop(e, d.key)}
            onClick={(e) => onColClick(e, d.key)}
          >
            {Array.from({ length: HOURS }, (_, i) => <div className="cal-hline" key={i} style={{ top: (i + 1) * HOUR_H }} />)}
            {d.isToday && showNowLine && <div className="cal-now" style={{ top: (nowMin - DAY_MIN0) / 60 * HOUR_H }} />}
            {byDay(d.key).map((b) => {
              const top = (b.start_min - DAY_MIN0) / 60 * HOUR_H;
              const h = Math.max(22, b.duration_min / 60 * HOUR_H);
              return (
                <div
                  key={b.id}
                  className={'ev' + (b.done ? ' done' : '') + (focusId === b.id ? ' focused' : '')}
                  style={{ top, height: h - 2, '--stripe': clientColor(b.client_id) }}
                  draggable
                  onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', JSON.stringify({ src: 'plan', block_id: b.id })); }}
                  onClick={(e) => { e.stopPropagation(); setAddAt(null); setEdit({ block: b, x: e.clientX, y: e.clientY }); }}
                >
                  <div className="ev-time">{fmtTime(b.start_min)}</div>
                  <div className="ev-title">{b.title}</div>
                  {h > 40 && <div className="ev-sub">{b.kind === 'todo' ? b.project_name : (b.client_name || 'No client')}</div>}
                  <button className={'ev-play' + (running && focusId === b.id ? ' on' : '')} onClick={(e) => { e.stopPropagation(); onFocus?.(b); }} title="Focus timer">
                    <Icon name={running && focusId === b.id ? 'pause' : 'play'} size={11} />
                  </button>
                  <div className="ev-resize" onPointerDown={(e) => startResize(e, b)} title="Drag to resize" />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* add popover */}
      {addAt && (
        <div className="cal-pop" style={popPos(addAt, gridRef)} onClick={(e) => e.stopPropagation()}>
          <div className="cal-pop-head">Add at {fmtTime(addAt.min)}</div>
          <input className="inp cal-pop-search" autoFocus placeholder="Find a project…" value={addQuery} onChange={(e) => setAddQuery(e.target.value)} />
          <div className="cal-pop-list">
            {addMatches.length === 0 && <div className="cal-pop-empty">No match</div>}
            {addMatches.map((p) => (
              <button key={p.id} className="cal-pop-item" onClick={() => addProject(p)} style={{ '--stripe': clientColor(p.client_id) }}>
                <span className="cal-pop-dot" /><span className="cal-pop-name">{p.name}</span><span className="cal-pop-cl">{p.client_name || ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* edit popover */}
      {edit && (
        <div className="cal-pop wide" style={popPos(edit, gridRef)} onClick={(e) => e.stopPropagation()}>
          <div className="cal-pop-title" onClick={() => onOpen(edit.block.project_id)}>{edit.block.title}</div>
          <div className="cal-pop-sub">{edit.block.client_name || edit.block.project_name || 'No client'}</div>
          <div className="cal-pop-row">
            <label>Day</label>
            <select className="inp" value={edit.block.day} onChange={(e) => { patch(edit.block.id, { day: e.target.value }); setEdit((s) => ({ ...s, block: { ...s.block, day: e.target.value } })); }}>
              {days.map((d) => <option key={d.key} value={d.key}>{d.label} · {d.sub}</option>)}
            </select>
          </div>
          <div className="cal-pop-row">
            <label>Start</label>
            <input className="inp" type="time" step="900" value={toHHMM(edit.block.start_min)} onChange={(e) => { const m = fromHHMM(e.target.value); patch(edit.block.id, { start_min: m }); setEdit((s) => ({ ...s, block: { ...s.block, start_min: m } })); }} />
          </div>
          <div className="cal-pop-row">
            <label>Length</label>
            <div className="dur">
              <button onClick={() => { const v = Math.max(15, edit.block.duration_min - 15); patch(edit.block.id, { duration_min: v }); setEdit((s) => ({ ...s, block: { ...s.block, duration_min: v } })); }}>−</button>
              <span>{durLabel(edit.block.duration_min)}</span>
              <button onClick={() => { const v = Math.min(720, edit.block.duration_min + 15); patch(edit.block.id, { duration_min: v }); setEdit((s) => ({ ...s, block: { ...s.block, duration_min: v } })); }}>+</button>
            </div>
          </div>
          <div className="cal-pop-actions">
            <button className={'chk' + (edit.block.done ? ' on' : '')} onClick={() => { patch(edit.block.id, { done: !edit.block.done }); setEdit((s) => ({ ...s, block: { ...s.block, done: !s.block.done } })); }}>
              {edit.block.done ? '✓ Done' : 'Mark done'}
            </button>
            <button className="ghostbtn" onClick={() => onOpen(edit.block.project_id)}>Open</button>
            <button className="ghostbtn danger" onClick={() => remove(edit.block.id)}>Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}

function durLabel(m) { const h = Math.floor(m / 60), mm = m % 60; return `${h ? h + 'h ' : ''}${mm ? mm + 'm' : ''}`.trim() || '0m'; }

// keep a popover inside the grid horizontally; anchor near the click.
function popPos(a, gridRef) {
  const rect = gridRef.current?.getBoundingClientRect();
  const W = 240;
  let left = a.x, top = a.y + 8;
  if (rect) {
    left = Math.min(Math.max(rect.left + 6, a.x - 40), rect.right - W - 6);
    top = Math.min(a.y + 8, rect.bottom - 40);
  }
  return { position: 'fixed', left, top };
}
