import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { STATUS_META, STATUS_ORDER, deadlineInfo } from './constants.js';
import StatusBadge from './StatusBadge.jsx';
import ClientAvatar from './ClientAvatar.jsx';

// Click the status badge on a card to change it, without opening the project.
function StatusControl({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="status-control" ref={ref} onMouseDown={(e) => e.stopPropagation()}>
      <button className="status-badge-btn" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <StatusBadge status={status} />
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="client-menu status-menu" onClick={(e) => e.stopPropagation()}>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              className={'client-menu-item' + (s === status ? ' active' : '')}
              onClick={() => { setOpen(false); if (s !== status) onChange(s); }}
            >
              <span className="badge-dot" style={{ background: STATUS_META[s].color }} />
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ p, lane, onOpen, onSetStatus, onDelete, onSetPriority, onSetBucket, dnd }) {
  const dl = deadlineInfo(p.deadline);
  const meta = [];
  if (p.open_count > 0) meta.push(`${p.open_count} open`);
  if (p.file_count > 0) meta.push(`${p.file_count} file${p.file_count > 1 ? 's' : ''}`);
  if (p.link_count > 0) meta.push(`${p.link_count} link${p.link_count > 1 ? 's' : ''}`);
  const canMove = !p.shared; // you own it (personal or shared-out) → you can move it

  return (
    <div
      className={'card' + (dnd.draggingId === p.id ? ' dragging' : '')}
      style={{ '--status': STATUS_META[p.status]?.color || '#8B93A7' }}
      data-card-id={p.id}
      data-lane={lane}
      onPointerDown={(e) => dnd.onPointerDown(e, p.id, lane)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p.id); }}
    >
      {dnd.dragEnabled && <span className="card-grip" aria-hidden="true">⠿</span>}
      <div className="card-body">
        {p.client_name && (
          <div className="card-client">
            <ClientAvatar client={{ id: p.client_id, name: p.client_name, has_logo: !!p.client_has_logo, updated_at: p.client_updated }} size={18} />
            <span>{p.client_name}</span>
          </div>
        )}
        <div className="card-top">
          <h3 className="card-name">{p.name}</h3>
          <div className="card-controls" onMouseDown={(e) => e.stopPropagation()}>
            <StatusControl status={p.status} onChange={(s) => onSetStatus(p.id, s)} />
            <button className="card-del" title="Delete project" onClick={(e) => { e.stopPropagation(); onDelete(p); }}>🗑</button>
          </div>
        </div>
        {p.description && <p className="card-desc">{p.description}</p>}
        <div className="card-meta">
          {p.shared
            ? <span className="chip shared-chip" title={`Shared with you by ${p.owner_name || 'someone'}`}>🤝 from {p.owner_name ? p.owner_name.split(' ')[0] : 'someone'}</span>
            : p.shared_out
              ? <span className="chip shared-chip" title={`You shared this with ${p.shared_with_names || 'someone'}`}>🤝 with {p.shared_with_names ? p.shared_with_names.split(',')[0].trim().split(' ')[0] : 'someone'}</span>
              : null}
          {dl && (
            <span className="pill" style={{ '--dl': dl.color }}>
              <span className="pill-dot" />{dl.label}
            </span>
          )}
          {meta.map((m, i) => <span key={i} className="chip">{m}</span>)}
          {!dl && meta.length === 0 && !p.shared && !p.shared_out && <span className="chip muted">nothing open</span>}
        </div>
        {canMove && (onSetPriority || onSetBucket) && (
          <div className="card-actions" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {onSetPriority && (
              <button
                className={'card-move-btn' + (p.priority != null ? ' on' : '')}
                title={p.priority != null ? 'Remove from priority' : 'Pin to priority'}
                onClick={(e) => { e.stopPropagation(); onSetPriority(p.id, p.priority != null ? null : 1); }}
              >{p.priority != null ? '★ Unpin' : '☆ Pin'}</button>
            )}
            {onSetBucket && (
              <button
                className="card-move-btn"
                title={p.bucket === 'current' ? 'Move to Long-term' : 'Move to Current'}
                onClick={(e) => { e.stopPropagation(); onSetBucket(p.id, p.bucket === 'current' ? 'longterm' : 'current'); }}
              >{p.bucket === 'current' ? '→ Long-term' : '→ Current'}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Compact horizontal card for the "Needs attention" strip (overdue / due today).
function AttentionCard({ p, onOpen, onReschedule, onSetPriority, dnd, urg }) {
  const dl = deadlineInfo(p.deadline);
  const canMove = !p.shared;
  return (
    <div
      className={'attn-card' + (dnd && dnd.draggingId === p.id ? ' dragging' : '')}
      style={{ '--urg': urg || (dl ? dl.color : '#e8636b') }}
      onClick={() => onOpen(p.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p.id); }}
    >
      <div className="attn-main">
        {dnd && (
          <span
            className="card-grip"
            data-card-id={p.id}
            data-lane={p.priority != null ? 'priority' : p.bucket}
            onPointerDown={(e) => { e.stopPropagation(); dnd.onPointerDown(e, p.id, p.priority != null ? 'priority' : p.bucket); }}
            onClick={(e) => e.stopPropagation()}
            aria-hidden="true"
          >⠿</span>
        )}
        {p.client_name && (
          <ClientAvatar client={{ id: p.client_id, name: p.client_name, has_logo: !!p.client_has_logo, updated_at: p.client_updated }} size={18} />
        )}
        <span className="attn-name">{p.name}</span>
        <StatusBadge status={p.status} />
      </div>
      <div className="attn-foot">
        {dl && <span className="pill" style={{ '--dl': dl.color }}><span className="pill-dot" />{dl.label}</span>}
        {canMove && onSetPriority && (
          <button
            className={'card-move-btn' + (p.priority != null ? ' on' : '')}
            title={p.priority != null ? 'Remove from priority' : 'Pin to priority'}
            onClick={(e) => { e.stopPropagation(); onSetPriority(p.id, p.priority != null ? null : 1); }}
          >{p.priority != null ? '★ Unpin' : '☆ Pin'}</button>
        )}
        <label className="attn-resched" onClick={(e) => e.stopPropagation()}>
          <span>Reschedule</span>
          <input type="date" value={p.deadline || ''} onChange={(e) => onReschedule(p.id, e.target.value || null)} />
        </label>
      </div>
    </div>
  );
}

function Column({ title, subtitle, bucket, projects, onOpen, onNew, onSetStatus, onDelete, onSetPriority, onSetBucket, dnd }) {
  return (
    <section className="column">
      <div className="column-head">
        <h2>{title}</h2>
        <span className="column-count">{projects.length}</span>
      </div>
      <p className="column-sub">{subtitle}</p>
      <div className="card-list" data-lane-zone={bucket}>
        {projects.map((p) => (
          <ProjectCard key={p.id} p={p} lane={bucket} onOpen={onOpen} onSetStatus={onSetStatus} onDelete={onDelete} onSetPriority={onSetPriority} onSetBucket={onSetBucket} dnd={dnd} />
        ))}
        <div className={'col-drop' + (dnd.draggingId != null ? ' active' : '')} data-lane-zone={bucket} />
        <button className="card add" onClick={onNew}>＋ Add a project</button>
      </div>
    </section>
  );
}

// The priority lane at the very top — drag projects in to pin them.
// `dropZone` off = a display-only lane (e.g. the shared-priority row, which fills
// automatically when a shared project is pinned via the personal lane's drop zone).
function PriorityLane({ projects, onOpen, onSetStatus, onDelete, onSetPriority, onSetBucket, dnd, title = '★ Priority', subtitle = 'Your focus — drag projects up here to pin them to the top.', dropZone = true }) {
  return (
    <section className="priority-lane">
      <div className="attention-head">
        <h2 className="priority-title">{title}</h2>
        <span className="column-count priority-count">{projects.length}</span>
        <span className="attention-sub">{subtitle}</span>
      </div>
      <div className="priority-grid" data-lane-zone={dropZone ? 'priority' : undefined}>
        {projects.map((p) => (
          <ProjectCard key={p.id} p={p} lane="priority" onOpen={onOpen} onSetStatus={onSetStatus} onDelete={onDelete} onSetPriority={onSetPriority} onSetBucket={onSetBucket} dnd={dnd} />
        ))}
        {dropZone && (
          <div
            className={'priority-drop' + (dnd.draggingId != null ? ' active' : '') + (projects.length === 0 ? ' empty' : '')}
            data-lane-zone="priority"
          >
            {projects.length === 0 && <span>Drag a project here to prioritise it</span>}
          </div>
        )}
      </div>
    </section>
  );
}

function cmpDeadline(a, b) {
  if (!a.deadline && !b.deadline) return 0;
  if (!a.deadline) return 1;   // no-deadline sinks to the bottom
  if (!b.deadline) return -1;
  return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0;
}

export default function Home({ projects, loading, clients = [], user, onOpen, onNew, onChanged, initialGroup }) {
  const [list, setList] = useState(projects);
  const [draggingId, setDraggingId] = useState(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState(() => localStorage.getItem('deck.sort') || 'custom');
  const [clientFilter, setClientFilter] = useState(() => localStorage.getItem('deck.clientFilter') || 'all');
  const [groupBy, setGroupBy] = useState(() => localStorage.getItem('deck.groupBy') || initialGroup || 'buckets');
  const listRef = useRef(list);
  listRef.current = list;

  useEffect(() => { setList(projects); }, [projects]);
  useEffect(() => { localStorage.setItem('deck.sort', sortMode); }, [sortMode]);
  useEffect(() => { localStorage.setItem('deck.clientFilter', clientFilter); }, [clientFilter]);
  useEffect(() => { localStorage.setItem('deck.groupBy', groupBy); }, [groupBy]);

  // --- Pointer-based drag ---------------------------------------------------
  // We drive drag from pointer events, NOT the native HTML5 draggable API.
  // HTML5 draggable is flaky across browsers (breaks with user-select:none,
  // steals the drag onto child images, etc.). Pointer events are immune to all
  // of that, so grabbing a card and dropping it onto a stage/lane just works.
  const groupByRef = useRef(groupBy);
  groupByRef.current = groupBy;
  const drag = useRef(null); // { id, lane, startX, startY, moved }
  const [overStage, setOverStage] = useState(null);
  const [overWaiting, setOverWaiting] = useState(false);

  // Lanes: 'priority' (pinned to the top) or a bucket ('current' / 'longterm').
  const laneOf = (p) => (p.priority != null ? 'priority' : p.bucket);
  function applyLane(p, lane) {
    return lane === 'priority' ? { ...p, priority: 1 } : { ...p, priority: null, bucket: lane };
  }

  // Move the dragged card to just before `overId`, adopting the target lane.
  function reorderBefore(dragId, overId, lane) {
    setList((prev) => {
      if (dragId == null || dragId === overId) {
        return prev.map((p) => (p.id === dragId ? applyLane(p, lane) : p));
      }
      const dragItem = prev.find((p) => p.id === dragId);
      if (!dragItem) return prev;
      const without = prev.filter((p) => p.id !== dragId);
      let idx = without.findIndex((p) => p.id === overId);
      if (idx < 0) idx = without.length;
      without.splice(idx, 0, applyLane(dragItem, lane));
      return without;
    });
  }

  // Hovering the empty space of a lane → move to the end of that lane.
  function moveToLaneEnd(dragId, lane) {
    setList((prev) => {
      const dragItem = prev.find((p) => p.id === dragId);
      if (!dragItem) return prev;
      const without = prev.filter((p) => p.id !== dragId);
      let lastIdx = -1;
      without.forEach((p, i) => { if (laneOf(p) === lane) lastIdx = i; });
      without.splice(lastIdx + 1, 0, applyLane(dragItem, lane));
      return without;
    });
  }

  function persistOrder() {
    // Let the last state update flush, then persist the new order + buckets.
    setTimeout(() => {
      const items = listRef.current.map((p, idx) => ({ id: p.id, bucket: p.bucket, sort: idx, priority: p.priority != null ? 1 : null }));
      api.reorderProjects(items).catch(() => {}).finally(() => onChanged?.());
    }, 0);
  }

  function onPointerMove(e) {
    const s = drag.current;
    if (!s) return;
    // Cross a small threshold before it counts as a drag (so a click still opens).
    if (!s.moved) {
      if (Math.abs(e.clientX - s.startX) + Math.abs(e.clientY - s.startY) < 6) return;
      s.moved = true;
      setDraggingId(s.id);
      document.body.classList.add('dragging-active');
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    // The Waiting strip is a drop target in both views — check it first.
    if (el.closest('[data-waiting-zone]')) { setOverWaiting(true); setOverStage(null); return; }
    setOverWaiting(false);
    if (groupByRef.current === 'stage') {
      const stageEl = el.closest('[data-stage]');
      setOverStage(stageEl ? stageEl.getAttribute('data-stage') : null);
      return;
    }
    const overCard = el.closest('[data-card-id]');
    const zone = el.closest('[data-lane-zone]');
    if (overCard) {
      const overId = Number(overCard.getAttribute('data-card-id'));
      const lane = overCard.getAttribute('data-lane') || (zone && zone.getAttribute('data-lane-zone')) || s.lane;
      reorderBefore(s.id, overId, lane);
    } else if (zone) {
      moveToLaneEnd(s.id, zone.getAttribute('data-lane-zone'));
    }
  }

  function onPointerUp(e) {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    document.body.classList.remove('dragging-active');
    const s = drag.current;
    drag.current = null;
    if (!s) return;
    if (!s.moved) { setDraggingId(null); onOpen(s.id); return; } // no drag → it was a click
    const dropEl = document.elementFromPoint(e.clientX, e.clientY);
    if (dropEl && dropEl.closest('[data-waiting-zone]')) {
      setDraggingId(null); setOverWaiting(false); setOverStage(null);
      setStatus(s.id, 'waiting'); // dropped on the Waiting strip → park it
      return;
    }
    if (groupByRef.current === 'stage') {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const stageEl = el && el.closest('[data-stage]');
      const stage = stageEl && stageEl.getAttribute('data-stage');
      setDraggingId(null); setOverStage(null);
      if (stage) setStatus(s.id, stage); // drop onto a stage → restage the project
      return;
    }
    setDraggingId(null);
    persistOrder();
  }

  function onPointerDown(e, id, lane) {
    if (e.button !== 0) return; // left button only
    // Ignore drags that start on interactive controls inside the card.
    if (e.target.closest('button, input, select, textarea, a, label, .card-controls, .status-control')) return;
    drag.current = { id, lane, startX: e.clientX, startY: e.clientY, moved: false };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  const dragEnabled = true;
  const dnd = { draggingId, overStage, onPointerDown, dragEnabled };

  // Filter + sort are view-only — they never touch the saved drag order.
  function applyView(arr) {
    let out = arr;
    if (clientFilter === 'none') out = out.filter((p) => !p.client_id);
    else if (clientFilter !== 'all') out = out.filter((p) => p.client_id === Number(clientFilter));
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
    if (draggingId == null) {
      if (sortMode === 'deadline') out = [...out].sort(cmpDeadline);
      else if (sortMode === 'name') out = [...out].sort((a, b) => a.name.localeCompare(b.name));
      else if (sortMode === 'status') out = [...out].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    }
    return out;
  }

  async function setStatus(id, status) {
    try { await api.updateProject(id, { status }); onChanged?.(); }
    catch { /* ignore */ }
  }

  async function del(p) {
    if (!window.confirm(`Delete "${p.name}"? This removes the project and everything in it.`)) return;
    try { await api.deleteProject(p.id); onChanged?.(); }
    catch { /* ignore */ }
  }

  async function reschedule(id, deadline) {
    try { await api.updateProject(id, { deadline }); onChanged?.(); }
    catch { /* ignore */ }
  }

  async function setPriority(id, val) {
    try { await api.updateProject(id, { priority: val }); onChanged?.(); }
    catch { /* ignore */ }
  }

  async function setBucket(id, bucket) {
    try { await api.updateProject(id, { bucket }); onChanged?.(); }
    catch { /* ignore */ }
  }

  function passesFilter(p) {
    if (clientFilter === 'none' && p.client_id) return false;
    if (clientFilter !== 'all' && clientFilter !== 'none' && p.client_id !== Number(clientFilter)) return false;
    const q = search.trim().toLowerCase();
    if (q && !(p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))) return false;
    return true;
  }

  if (loading && list.length === 0) {
    return <div className="loading">Loading your things…</div>;
  }

  // Admin dashboard separates personal work from shared collaborative work:
  // two priority rows (personal / shared), personal columns exclude shared, and
  // remaining shared projects get their own section. Members keep the mixed view.
  const separateShared = user?.role === 'admin';
  const isSharedProj = (p) => p.shared || p.shared_out;
  const personal = (p) => !separateShared || !isSharedProj(p);

  // Pinned projects — split into a personal row and a shared row for admin.
  const allPinned = list.filter((p) => p.priority != null).filter(passesFilter);
  const priorityIds = new Set(allPinned.map((p) => p.id)); // ALL pinned stay out of the sections below
  const personalPriority = separateShared ? allPinned.filter((p) => !isSharedProj(p)) : allPinned;
  const sharedPriority = separateShared ? allPinned.filter(isSharedProj) : [];

  // Waiting wins over Needs Attention: a card you've explicitly parked as
  // "waiting" shouldn't also nag as overdue, so it's pulled out first.
  const waiting = list.filter(passesFilter).filter(personal).filter((p) => p.priority == null && p.status === 'waiting');
  const waitingIds = new Set(waiting.map((p) => p.id));

  // Overdue + due-today (excluding pinned + waiting) get pulled into the attention strip.
  const attention = list
    .filter(passesFilter)
    .filter(personal)
    .filter((p) => !priorityIds.has(p.id) && !waitingIds.has(p.id))
    .filter((p) => { const dl = deadlineInfo(p.deadline); return dl && (dl.level === 'overdue' || dl.level === 'today'); })
    .sort(cmpDeadline);
  const attentionIds = new Set(attention.map((p) => p.id));

  const current = applyView(list.filter(personal).filter((p) => p.priority == null && p.bucket === 'current' && !attentionIds.has(p.id) && !waitingIds.has(p.id)));
  const longterm = applyView(list.filter(personal).filter((p) => p.priority == null && p.bucket === 'longterm' && !attentionIds.has(p.id) && !waitingIds.has(p.id)));

  // Remaining shared projects (admin only, non-pinned) — their own board section.
  const sharedBoard = separateShared
    ? list.filter((p) => isSharedProj(p) && p.priority == null).filter(passesFilter)
    : [];

  // Stage grouping: board projects grouped by their status/stage. Dropping a
  // card onto a stage section changes the project's status (handled in onPointerUp).
  // Stage view stays mixed (personal + shared) so nothing is hidden there; the
  // personal/shared split is a Buckets-view treatment.
  const boardProjects = list.filter((p) => p.priority == null && !attentionIds.has(p.id) && !waitingIds.has(p.id)).filter(passesFilter);
  const byStage = {};
  for (const p of boardProjects) (byStage[p.status] = byStage[p.status] || []).push(p);

  // Shared grouping: every collaborative project (shared with me OR shared by me),
  // laid out by stage so you can see where each handoff sits.
  const sharedProjects = list.filter((p) => p.shared || p.shared_out).filter(passesFilter);
  const sharedByStage = {};
  for (const p of sharedProjects) (sharedByStage[p.status] = sharedByStage[p.status] || []).push(p);

  return (
    <>
      <div className="toolbar">
        <input className="tb-search" placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="tb-field">
          <label>Sort</label>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
            <option value="custom">My order</option>
            <option value="deadline">Deadline</option>
            <option value="status">Status</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        <div className="tb-field">
          <label>Client</label>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="none">No client</option>
            {clients.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </div>
        <div className="tb-field">
          <label>Group</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="buckets">Buckets</option>
            <option value="stage">Stage</option>
            <option value="shared">Shared</option>
          </select>
        </div>
        {(sortMode !== 'custom' || clientFilter !== 'all' || search.trim()) && (
          <button className="btn small ghost" onClick={() => { setSortMode('custom'); setClientFilter('all'); setSearch(''); }}>Reset</button>
        )}
        {!dragEnabled && <span className="tb-hint">Drag off — set “My order” + no filters to reorder</span>}
      </div>

      {groupBy === 'shared' ? (
        <div className="stages">
          <p className="tb-hint" style={{ margin: '2px 0 10px' }}>
            Every project you share or that's shared with you, grouped by stage. 🤝 shows the direction.
          </p>
          {sharedProjects.length === 0 && (
            <p className="empty">Nothing shared yet — open a project and hit “Share project”, or share a whole client from the Clients manager.</p>
          )}
          {STATUS_ORDER.filter((s) => sharedByStage[s] && sharedByStage[s].length).map((s) => (
            <section className="stage-group" key={s} style={{ '--stage': STATUS_META[s].color }}>
              <div className="attention-head">
                <h2 style={{ color: STATUS_META[s].color }}>{STATUS_META[s].label}</h2>
                <span className="column-count">{sharedByStage[s].length}</span>
              </div>
              <div className="priority-grid">
                {sharedByStage[s].map((p) => (
                  <ProjectCard key={p.id} p={p} lane={p.bucket} onOpen={onOpen} onSetStatus={setStatus} onDelete={del} onSetPriority={setPriority} onSetBucket={setBucket} dnd={dnd} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
      <>
      <PriorityLane
        projects={personalPriority}
        title={separateShared ? '★ My priority' : '★ Priority'}
        subtitle={separateShared ? 'Your own pinned projects — use ★ Pin on any card, or drag it here.' : 'Your focus — use ★ Pin on any card, or drag it here.'}
        onOpen={onOpen} onSetStatus={setStatus} onDelete={del} onSetPriority={setPriority} onSetBucket={setBucket} dnd={dnd}
      />
      {separateShared && sharedPriority.length > 0 && (
        <PriorityLane
          projects={sharedPriority}
          title="🤝 Shared priority"
          subtitle="Pinned projects you share with the team."
          dropZone={false}
          onOpen={onOpen} onSetStatus={setStatus} onDelete={del} onSetPriority={setPriority} onSetBucket={setBucket} dnd={dnd}
        />
      )}

      {attention.length > 0 && (
        <section className="attention">
          <div className="attention-head">
            <h2>⚠ Needs attention</h2>
            <span className="column-count urgent">{attention.length}</span>
            <span className="attention-sub">Overdue or due today — reschedule or get them done.</span>
          </div>
          <div className="attention-grid">
            {attention.map((p) => <AttentionCard key={p.id} p={p} onOpen={onOpen} onReschedule={reschedule} onSetPriority={setPriority} dnd={dnd} />)}
          </div>
        </section>
      )}

      {(waiting.length > 0 || draggingId != null) && (
        <section className={'attention waiting-zone' + (overWaiting ? ' over' : '')} data-waiting-zone>
          <div className="attention-head">
            <h2 style={{ color: '#f5ac4b' }}>⏳ Waiting</h2>
            <span className="column-count" style={{ background: 'color-mix(in srgb, #f5ac4b 16%, var(--surface-2))', borderColor: 'color-mix(in srgb, #f5ac4b 38%, var(--border))', color: '#f5ac4b' }}>{waiting.length}</span>
            <span className="attention-sub">Waiting on someone — parked until they come back. Drag a card here to park it.</span>
          </div>
          <div className="attention-grid" data-waiting-zone>
            {waiting.map((p) => <AttentionCard key={p.id} p={p} onOpen={onOpen} onReschedule={reschedule} onSetPriority={setPriority} dnd={dnd} urg="#f5ac4b" />)}
            {waiting.length === 0 && <div className="waiting-empty" data-waiting-zone>Drop here to park as waiting</div>}
          </div>
        </section>
      )}

      {groupBy === 'stage' ? (
        <div className="stages">
          {STATUS_ORDER.filter((s) => byStage[s] && byStage[s].length).map((s) => (
            <section
              className={'stage-group' + (draggingId != null ? ' droppable' : '') + (overStage === s ? ' over' : '')}
              key={s}
              data-stage={s}
              style={{ '--stage': STATUS_META[s].color }}
            >
              <div className="attention-head">
                <h2 style={{ color: STATUS_META[s].color }}>{STATUS_META[s].label}</h2>
                <span className="column-count">{byStage[s].length}</span>
              </div>
              <div className="priority-grid">
                {byStage[s].map((p) => (
                  <ProjectCard key={p.id} p={p} lane={p.bucket} onOpen={onOpen} onSetStatus={setStatus} onDelete={del} onSetPriority={setPriority} onSetBucket={setBucket} dnd={dnd} />
                ))}
              </div>
            </section>
          ))}
          {boardProjects.length === 0 && <p className="empty">No projects here — pinned and overdue ones show above.</p>}
          <p className="tb-hint" style={{ marginTop: '6px' }}>Drag a project onto another stage to move it there (or click its status badge).</p>
        </div>
      ) : (
        <>
        {separateShared && (
          <div className="board-section-label">🙋 Personal <span>your own projects</span></div>
        )}
        <div className="home">
          <Column
            title="Current" subtitle="What's front of mind right now."
            bucket="current" projects={current} onOpen={onOpen} onNew={onNew}
            onSetStatus={setStatus} onDelete={del} onSetPriority={setPriority} onSetBucket={setBucket} dnd={dnd}
          />
          <Column
            title="Long-term" subtitle="Someday, not today. Use → Current on a card to move it."
            bucket="longterm" projects={longterm} onOpen={onOpen} onNew={onNew}
            onSetStatus={setStatus} onDelete={del} onSetPriority={setPriority} onSetBucket={setBucket} dnd={dnd}
          />
        </div>
        {separateShared && sharedBoard.length > 0 && (
          <section className="shared-board">
            <div className="attention-head">
              <h2>🤝 Shared with the team</h2>
              <span className="column-count">{sharedBoard.length}</span>
              <span className="attention-sub">Collaborative work — kept separate from your personal projects.</span>
            </div>
            <div className="priority-grid">
              {sharedBoard.map((p) => (
                <ProjectCard key={p.id} p={p} lane={p.bucket} onOpen={onOpen} onSetStatus={setStatus} onDelete={del} onSetPriority={setPriority} onSetBucket={setBucket} dnd={dnd} />
              ))}
            </div>
          </section>
        )}
        </>
      )}
      </>
      )}
    </>
  );
}
