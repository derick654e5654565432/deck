import { useMemo, useState } from 'react';
import { STATUS_META, STATUS_ORDER, deadlineInfo } from './constants.js';
import { Icon } from './Icon.jsx';
import ClientAvatar from './ClientAvatar.jsx';

const CLIENT_COLORS = ['#e8622c', '#6f8dff', '#3fca7f', '#a678f0', '#f0c649', '#e07bb4', '#4cc3c0'];
const clientColor = (id) => id ? CLIENT_COLORS[Number(id) % CLIENT_COLORS.length] : '#8a8a93';

function dragProps(kind, ref_id) {
  return {
    draggable: true,
    onDragStart: (e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', JSON.stringify({ src: 'backlog', kind, ref_id })); },
  };
}

export default function AttentionBrowser({ projects, recDue = [], clients, onOpen }) {
  const [tab, setTab] = useState('attention');
  const clientById = useMemo(() => Object.fromEntries((clients || []).map((c) => [c.id, c])), [clients]);

  const withDl = useMemo(() => projects.map((p) => ({ ...p, dl: deadlineInfo(p.deadline) })), [projects]);
  const attention = useMemo(() => {
    const rows = [];
    for (const p of withDl) {
      if (p.dl?.level === 'overdue') rows.push({ key: 'o' + p.id, p, kind: 'project', ref_id: p.id, tag: `${Math.abs(p.dl.days)}d overdue`, tagCls: 'danger' });
    }
    for (const p of withDl) {
      if (p.dl?.level === 'today') rows.push({ key: 't' + p.id, p, kind: 'project', ref_id: p.id, tag: 'Due today', tagCls: 'warn' });
    }
    for (const p of withDl) {
      if (p.dl?.level === 'soon') rows.push({ key: 's' + p.id, p, kind: 'project', ref_id: p.id, tag: `in ${p.dl.days}d`, tagCls: 'plain' });
    }
    for (const r of recDue) {
      rows.push({ key: 'r' + r.todo.id, p: { id: r.project.id, name: r.todo.text, client_id: r.project.client_id, client_name: r.project.client_name, status: r.project.status }, kind: 'todo', ref_id: r.todo.id, tag: 'Recurring', tagCls: 'rec' });
    }
    return rows;
  }, [withDl, recDue]);

  const byStage = useMemo(() => {
    const m = {};
    for (const s of STATUS_ORDER) m[s] = [];
    for (const p of projects) if (m[p.status]) m[p.status].push(p);
    return m;
  }, [projects]);

  const stageTabs = STATUS_ORDER.filter((s) => byStage[s].length > 0);

  const rows = tab === 'attention'
    ? attention
    : byStage[tab].map((p) => ({ key: 'p' + p.id, p, kind: 'project', ref_id: p.id, tag: null }));

  return (
    <div className="fcard att-browser">
      <div className="card-head">
        <span className="card-label"><Icon name="alert" size={14} /> {tab === 'attention' ? 'Needs attention' : STATUS_META[tab].label}</span>
        <span className="card-hint">drag onto the calendar →</span>
      </div>

      <div className="att-tabs">
        <button className={'att-tab' + (tab === 'attention' ? ' active' : '')} onClick={() => setTab('attention')}>
          Needs attention{attention.length ? <span className="att-tab-n">{attention.length}</span> : null}
        </button>
        {stageTabs.map((s) => (
          <button key={s} className={'att-tab' + (tab === s ? ' active' : '')} style={{ '--s': STATUS_META[s].color }} onClick={() => setTab(s)}>
            {STATUS_META[s].label}<span className="att-tab-n">{byStage[s].length}</span>
          </button>
        ))}
      </div>

      <div className="att-list">
        {rows.length === 0 && <div className="sched-empty" style={{ padding: '18px 4px' }}>{tab === 'attention' ? 'All clear — nothing overdue or due soon.' : 'Nothing in this stage.'}</div>}
        {rows.map((r) => (
          <div className="brow" key={r.key} {...dragProps(r.kind, r.ref_id)} onClick={() => onOpen(r.p.id)} style={{ '--stripe': clientColor(r.p.client_id) }} title="Drag onto the calendar, or click to open">
            <span className="brow-grip"><Icon name="grid" size={12} /></span>
            {r.p.client_id && clientById[r.p.client_id] ? <ClientAvatar client={clientById[r.p.client_id]} size={22} /> : <span className="brow-dot" />}
            <div className="brow-main">
              <div className="brow-name">{r.p.name}</div>
              {r.p.client_name && <div className="brow-cl">{r.p.client_name}</div>}
            </div>
            {r.tag && <span className={'tag ' + r.tagCls}>{r.tag}</span>}
            {!r.tag && r.p.status && <span className="bl-status" style={{ '--s': STATUS_META[r.p.status]?.color }}>{STATUS_META[r.p.status]?.label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
