import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import ClientAvatar from './ClientAvatar.jsx';

export default function ResponsibilitiesView({ clients = [] }) {
  const [clientId, setClientId] = useState(() => localStorage.getItem('deck.respClient') || (clients[0] && String(clients[0].id)) || '');
  const [items, setItems] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => { if (clientId) localStorage.setItem('deck.respClient', clientId); }, [clientId]);
  useEffect(() => { if (!clientId && clients[0]) setClientId(String(clients[0].id)); }, [clients, clientId]);

  const load = useCallback(async () => {
    if (!clientId) { setItems([]); return; }
    setLoading(true);
    try { const r = await api.responsibilities(clientId); setItems(r.items); setCanManage(r.can_manage); }
    finally { setLoading(false); }
  }, [clientId]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  async function add(kind) {
    const t = text.trim();
    if (!t) return;
    await api.addResponsibility(clientId, { text: t, kind });
    setText('');
    await load();
  }
  async function toggle(it) { await api.updateResponsibility(it.id, { done: it.done ? 0 : 1 }); await load(); }
  async function saveText(it, val) {
    const v = val.trim();
    if (!v || v === it.text) return;
    await api.updateResponsibility(it.id, { text: v });
    await load();
  }
  async function remove(it) { await api.deleteResponsibility(it.id); await load(); }
  async function move(it, dir) {
    const idx = items.findIndex((x) => x.id === it.id);
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const reordered = [...items];
    [reordered[idx], reordered[j]] = [reordered[j], reordered[idx]];
    setItems(reordered);
    await api.reorderResponsibilities(clientId, reordered.map((x, i) => ({ id: x.id, sort: i })));
    await load();
  }

  const client = clients.find((c) => String(c.id) === String(clientId));
  const taskItems = items.filter((i) => i.kind !== 'heading');
  const doneCount = taskItems.filter((i) => i.done).length;
  const pct = taskItems.length ? Math.round((doneCount / taskItems.length) * 100) : 0;

  return (
    <div className="resp">
      <div className="resp-head">
        <div>
          <h1 className="recurring-title">🧾 Roles & responsibilities</h1>
          <p className="column-sub">Everything we need to deliver for a client — a living checklist, separate from your projects.</p>
        </div>
        {clients.length > 0 && (
          <div className="resp-client-picker">
            {client && <ClientAvatar client={{ id: client.id, name: client.name, has_logo: !!client.has_logo, updated_at: client.updated_at }} size={26} />}
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {clients.length === 0 ? (
        <p className="empty">No clients yet — add one from the Clients button first, then build its checklist here.</p>
      ) : (
        <>
          {taskItems.length > 0 && (
            <div className="resp-progress">
              <div className="resp-bar"><div className="resp-bar-fill" style={{ width: pct + '%' }} /></div>
              <span className="resp-progress-label">{doneCount} / {taskItems.length} done · {pct}%</span>
            </div>
          )}

          {loading ? <div className="loading">Loading…</div> : (
            <ul className="resp-list">
              {items.map((it, i) => (
                it.kind === 'heading' ? (
                  <li key={it.id} className="resp-heading">
                    {canManage ? (
                      <input className="resp-heading-in" defaultValue={it.text} key={it.id + '|' + it.text}
                        onBlur={(e) => saveText(it, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
                    ) : <span>{it.text}</span>}
                    {canManage && <ManageBtns it={it} i={i} items={items} onMove={move} onRemove={remove} />}
                  </li>
                ) : (
                  <li key={it.id} className={'resp-item' + (it.done ? ' done' : '')}>
                    <button className="check" onClick={() => toggle(it)} aria-label="toggle">{it.done ? '✓' : ''}</button>
                    {canManage ? (
                      <input className="resp-item-in" defaultValue={it.text} key={it.id + '|' + it.text}
                        onBlur={(e) => saveText(it, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
                    ) : <span className="resp-item-text">{it.text}</span>}
                    {canManage && <ManageBtns it={it} i={i} items={items} onMove={move} onRemove={remove} />}
                  </li>
                )
              ))}
              {items.length === 0 && <li className="empty">Nothing here yet{canManage ? ' — add your first deliverable below.' : '.'}</li>}
            </ul>
          )}

          {canManage && (
            <form className="resp-add" onSubmit={(e) => { e.preventDefault(); add('item'); }}>
              <input placeholder="Add a deliverable or a section heading…" value={text} onChange={(e) => setText(e.target.value)} />
              <button type="submit" className="btn primary" disabled={!text.trim()}>＋ Item</button>
              <button type="button" className="btn" disabled={!text.trim()} onClick={() => add('heading')}>＋ Heading</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function ManageBtns({ it, i, items, onMove, onRemove }) {
  return (
    <span className="resp-manage">
      <button className="btn tiny" title="Move up" disabled={i === 0} onClick={() => onMove(it, -1)}>▲</button>
      <button className="btn tiny" title="Move down" disabled={i === items.length - 1} onClick={() => onMove(it, 1)}>▼</button>
      <button className="todo-del" title="Delete" onClick={() => onRemove(it)}>×</button>
    </span>
  );
}
