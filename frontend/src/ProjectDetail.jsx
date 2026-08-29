import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from './api.js';
import { STATUS_META, STATUS_ORDER, RECURRENCE_META, RECURRENCE_ORDER, recurDue, fileSize, deadlineInfo } from './constants.js';
import ClientPicker from './ClientPicker.jsx';

function firstName(n) { return (n || '').split(' ')[0] || n || '?'; }

function whenLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `today ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

export default function ProjectDetail({ projectId, summary, clients = [], members = [], user, onManageClients, onBack, onChanged, onDeleted }) {
  const [project, setProject] = useState(null);
  const [name, setName] = useState(summary?.name || '');
  const [desc, setDesc] = useState(summary?.description || '');
  const [notes, setNotes] = useState('');
  const [tplSaved, setTplSaved] = useState(false);

  const reload = useCallback(async () => {
    const r = await api.project(projectId);
    setProject(r.project);
    setName(r.project.name);
    setDesc(r.project.description);
    setNotes(r.project.notes || '');
  }, [projectId]);

  useEffect(() => { reload().catch(() => {}); }, [reload]);

  async function patch(fields) {
    await api.updateProject(projectId, fields);
    await reload();
    onChanged?.();
  }

  async function saveName() {
    const v = name.trim();
    if (v && v !== project.name) await patch({ name: v });
  }
  async function saveDesc() {
    if (desc !== project.description) await patch({ description: desc });
  }
  async function saveNotes() {
    if (notes !== project.notes) await patch({ notes });
  }
  async function saveAsTemplate() {
    await api.saveAsTemplate(projectId);
    setTplSaved(true);
    setTimeout(() => setTplSaved(false), 2200);
  }

  async function del() {
    if (!window.confirm(`Delete "${project.name}" and everything in it? This cannot be undone.`)) return;
    await api.deleteProject(projectId);
    onDeleted?.();
  }

  if (!project) return <div className="loading">Opening project…</div>;

  const isT = !!project.is_template;
  const canEdit = !!project.can_edit;          // owner-only actions
  const accessUsers = project.access_users || [];

  return (
    <div className="detail">
      <button className="back" onClick={onBack}>← All projects</button>

      <div className="detail-head">
        <input
          className="detail-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          placeholder="Project name"
          disabled={!canEdit}
        />
        <div className="detail-controls">
          {isT && <span className="badge" style={{ '--dot': '#8b95ff' }}><span className="badge-dot" />Template</span>}
          {project.recurring ? <span className="badge" style={{ '--dot': '#c07cf5' }}><span className="badge-dot" />🔁 Recurring</span> : null}
          {canEdit ? (
            <ClientPicker
              clients={clients}
              value={project.client_id}
              onPick={(id) => patch({ client_id: id })}
              onManage={onManageClients}
            />
          ) : (
            project.client_name && <span className="badge" style={{ '--dot': '#8b95ff' }}><span className="badge-dot" />{project.client_name}</span>
          )}
          {!isT && (
            <>
              <select
                className="status-select"
                value={project.status}
                onChange={(e) => patch({ status: e.target.value })}
                style={{ '--dot': STATUS_META[project.status]?.color }}
                disabled={!canEdit}
              >
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
              {canEdit && (
                <>
                  <div className="bucket-toggle">
                    <button
                      className={project.bucket === 'current' ? 'on' : ''}
                      onClick={() => project.bucket !== 'current' && patch({ bucket: 'current' })}
                    >Current</button>
                    <button
                      className={project.bucket === 'longterm' ? 'on' : ''}
                      onClick={() => project.bucket !== 'longterm' && patch({ bucket: 'longterm' })}
                    >Long-term</button>
                  </div>
                  <button className="btn ghost" onClick={saveAsTemplate}>{tplSaved ? 'Saved ✓' : 'Save as template'}</button>
                </>
              )}
            </>
          )}
          {canEdit && !isT && (
            <button className="btn ghost" onClick={() => patch({ recurring: project.recurring ? 0 : 1 })} title="Recurring projects live in the Recurring view and hold tasks that repeat">
              {project.recurring ? 'Make normal' : '🔁 Make recurring'}
            </button>
          )}
          {canEdit && <button className="btn danger-ghost" onClick={del}>Delete</button>}
        </div>
      </div>

      <input
        className="detail-desc"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={saveDesc}
        placeholder="One line — what is this, or what's it waiting on?"
        disabled={!canEdit}
      />

      {!isT && canEdit && (
      <div className="detail-deadline">
        <span className="deadline-label">Deadline</span>
        <input
          type="date"
          value={project.deadline || ''}
          onChange={(e) => patch({ deadline: e.target.value || null })}
        />
        {project.deadline
          ? <button className="btn small ghost" onClick={() => patch({ deadline: null })}>Clear</button>
          : <span className="deadline-none">No deadline</span>}
        {(() => {
          const dl = deadlineInfo(project.deadline);
          return dl ? <span className="pill" style={{ '--dl': dl.color }}><span className="pill-dot" />{dl.label}</span> : null;
        })()}
      </div>
      )}

      {!isT && (
        <SharedCard project={project} members={members} user={user} reload={reload} onChanged={onChanged} />
      )}

      <p className="detail-savenote">Everything here saves automatically the moment you add it — no Save button needed.</p>

      <TodoList
        todos={project.todos}
        projectId={projectId}
        reload={reload}
        onChanged={onChanged}
        accessUsers={accessUsers}
        user={user}
        collaborative={accessUsers.length > 1}
      />

      <NotesThread
        notes={project.notes_thread || []}
        projectId={projectId}
        reload={reload}
        user={user}
        isOwner={project.is_owner}
      />

      {(canEdit || (notes && notes.trim())) && (
      <section className="panel">
        <div className="panel-head"><h3>Scratchpad</h3><span className="panel-hint">{canEdit ? 'Your private freeform notes' : `${firstName(project.owner_name)}'s scratchpad`}</span></div>
        <textarea
          className="notes-area"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Anything worth remembering about this project — context, decisions, who said what…"
          disabled={!canEdit}
        />
      </section>
      )}

      <div className="detail-grid">
        <LinksPanel links={project.links} projectId={projectId} reload={reload} onChanged={onChanged} />
        <FilesPanel files={project.files} projectId={projectId} reload={reload} onChanged={onChanged} />
      </div>
    </div>
  );
}

// --- Shared card (always visible when shared; owner can manage) --------------
function SharedCard({ project, members, user, reload, onChanged }) {
  const [manage, setManage] = useState(false);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const isOwner = project.is_owner;
  const shares = project.shares || [];                       // populated for owner
  // People with access other than me (works for owner + collaborator via access_users).
  const others = (project.access_users || []).filter((u) => u.id !== user?.id);
  const isShared = (project.access_users || []).length > 1;

  const sharedIds = new Set(shares.map((s) => s.user_id));
  const candidates = members.filter((m) => m.id !== project.owner_id && !sharedIds.has(m.id));

  async function add() {
    const id = Number(pick);
    if (!id || busy) return;
    setBusy(true);
    try { await api.shareProject(project.id, id); setPick(''); await reload(); onChanged?.(); }
    finally { setBusy(false); }
  }
  async function remove(userId) { await api.unshareProject(project.id, userId); await reload(); onChanged?.(); }

  // Not shared + not owner shouldn't happen; not shared + owner → a gentle prompt to share.
  if (!isShared && !isOwner) return null;

  return (
    <div className={'shared-card' + (isShared ? ' on' : '')}>
      <div className="shared-card-main">
        <span className="shared-ico">🤝</span>
        <div className="shared-card-text">
          {isShared ? (
            isOwner ? (
              <span>This project is <strong>shared with {others.map((u) => firstName(u.name)).join(', ')}</strong>.</span>
            ) : (
              <span>Shared with you by <strong>{firstName(project.owner_name)}</strong>{others.length > 1 ? <> · also {others.filter((u) => u.name !== project.owner_name).map((u) => firstName(u.name)).join(', ')}</> : null}. You can add & work to-dos, notes, links and files — only {firstName(project.owner_name)} can rename, restage or delete it.</span>
            )
          ) : (
            <span>Only you can see this project. Share it to hand off to someone.</span>
          )}
        </div>
        {isOwner && (
          <button className="btn small" onClick={() => setManage((m) => !m)}>{manage ? 'Done' : isShared ? 'Manage' : 'Share'}</button>
        )}
      </div>
      {isOwner && manage && (
        <div className="share-panel">
          {shares.length > 0 && (
            <ul className="share-list">
              {shares.map((s) => (
                <li key={s.user_id}>
                  <span><strong>{s.name}</strong> <span className="field-opt">· {s.email}</span></span>
                  <button className="todo-del" title="Remove access" onClick={() => remove(s.user_id)}>×</button>
                </li>
              ))}
            </ul>
          )}
          {candidates.length > 0 ? (
            <div className="mini-add links">
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Choose a person…</option>
                {candidates.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
              <button className="btn primary small" onClick={add} disabled={!pick || busy}>Share</button>
            </div>
          ) : (
            <p className="field-opt" style={{ margin: '4px 2px' }}>
              {members.length <= 1 ? 'Invite someone from Team first, then share with them here.' : 'Shared with everyone already.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// --- To-dos (with author + assignee) ---------------------------------------
function TodoList({ todos, projectId, reload, onChanged, accessUsers = [], user, collaborative }) {
  const [items, setItems] = useState(todos);
  const [draggingId, setDraggingId] = useState(null);
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState('');
  const [recurrence, setRecurrence] = useState('');
  const listRef = useRef(items);
  listRef.current = items;

  useEffect(() => { setItems(todos); }, [todos]);

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await api.addTodo(projectId, { text: text.trim(), assignee_id: assignee ? Number(assignee) : null, recurrence: recurrence || null });
    setText(''); setAssignee(''); setRecurrence('');
    await reload();
    onChanged?.();
  }
  // For a recurring to-do, ticking it logs a completion (server keeps it live).
  async function toggle(t) { await api.updateTodo(t.id, { done: t.recurrence ? 1 : (t.done ? 0 : 1) }); await reload(); onChanged?.(); }
  async function saveRecurrence(t, val) {
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, recurrence: val || null } : x)));
    await api.updateTodo(t.id, { recurrence: val || null });
    await reload();
    onChanged?.();
  }
  async function remove(t) { await api.deleteTodo(t.id); await reload(); onChanged?.(); }
  async function saveText(t, val) {
    const v = val.trim();
    if (!v || v === t.text) return;
    await api.updateTodo(t.id, { text: v });
    await reload();
    onChanged?.();
  }
  async function saveDeadline(t, val) {
    const v = val || null;
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, deadline: v } : x)));
    await api.updateTodo(t.id, { deadline: v });
    await reload();
    onChanged?.();
  }
  async function saveAssignee(t, val) {
    const v = val ? Number(val) : null;
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, assignee_id: v } : x)));
    await api.updateTodo(t.id, { assignee_id: v });
    await reload();
    onChanged?.();
  }

  function reorderBefore(overId) {
    setItems((prev) => {
      if (draggingId == null || draggingId === overId) return prev;
      const drag = prev.find((t) => t.id === draggingId);
      if (!drag) return prev;
      const without = prev.filter((t) => t.id !== draggingId);
      let idx = without.findIndex((t) => t.id === overId);
      if (idx < 0) idx = without.length;
      without.splice(idx, 0, drag);
      return without;
    });
  }
  function onDragEnd() {
    setDraggingId(null);
    setTimeout(() => {
      api.reorderTodos(listRef.current.map((t, i) => ({ id: t.id, sort: i })))
        .catch(() => {})
        .finally(() => onChanged?.());
    }, 0);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>To-dos</h3>
        <span className="panel-hint">{collaborative ? 'Assign to a person · drag ⠿ to sort' : 'Drag ⠿ to sort · click text to edit'}</span>
      </div>
      <ul className="todo-list">
        {items.map((t) => {
          const mine = user && t.assignee_id === user.id;
          const rd = t.recurrence ? recurDue(t.recurrence, t.last_done_at) : null;
          const cls = 'todo'
            + (!t.recurrence && t.done ? ' done' : '')
            + (rd ? ' recurring' + (rd.due ? ' due' : ' logged') : '')
            + (draggingId === t.id ? ' dragging' : '')
            + (mine ? ' mine' : '');
          return (
          <li
            key={t.id}
            className={cls}
            onDragEnter={() => reorderBefore(t.id)}
            onDragOver={(e) => e.preventDefault()}
          >
            <span className="todo-grip" draggable onDragStart={() => setDraggingId(t.id)} onDragEnd={onDragEnd} aria-hidden="true">⠿</span>
            <button className="check" onClick={() => toggle(t)} aria-label={rd ? 'log done' : 'toggle'} title={rd ? 'Mark done for this cycle' : 'Mark done'}>
              {rd ? (rd.due ? '' : '✓') : (t.done ? '✓' : '')}
            </button>
            <div className="todo-main">
              <input
                className="todo-edit"
                defaultValue={t.text}
                key={t.id + '|' + t.text}
                onBlur={(e) => saveText(t, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
              />
              {(rd || (collaborative && (t.author_name || t.assignee_name))) && (
                <div className="todo-attribution">
                  {rd && <span className="todo-recur" style={{ '--rc': rd.color }}>🔁 {RECURRENCE_META[t.recurrence].short} · {rd.label}</span>}
                  {collaborative && (t.assignee_name
                    ? <span className={'todo-assignee' + (mine ? ' me' : '')}>→ {mine ? 'you' : firstName(t.assignee_name)}</span>
                    : <span className="todo-assignee none">unassigned</span>)}
                  {collaborative && t.author_name && <span className="todo-author">added by {firstName(t.author_name)}</span>}
                </div>
              )}
            </div>
            <select
              className="todo-assign-select recur-select"
              value={t.recurrence || ''}
              onChange={(e) => saveRecurrence(t, e.target.value)}
              title="Make this to-do repeat"
            >
              <option value="">One-off</option>
              {RECURRENCE_ORDER.map((r) => <option key={r} value={r}>🔁 {RECURRENCE_META[r].short}</option>)}
            </select>
            {collaborative && accessUsers.length > 0 && (
              <select
                className="todo-assign-select"
                value={t.assignee_id || ''}
                onChange={(e) => saveAssignee(t, e.target.value)}
                title="Assign this to-do to someone"
              >
                <option value="">Unassigned</option>
                {accessUsers.map((u) => <option key={u.id} value={u.id}>{firstName(u.name)}</option>)}
              </select>
            )}
            {!t.recurrence && (
              <input
                type="date"
                className={'todo-date' + (() => { const dl = deadlineInfo(t.deadline); return dl && (dl.level === 'overdue' || dl.level === 'today') ? ' overdue' : ''; })()}
                value={t.deadline || ''}
                onChange={(e) => saveDeadline(t, e.target.value)}
                title="Due date for this to-do"
              />
            )}
            <button className="todo-del" title="Delete" onClick={() => remove(t)}>×</button>
          </li>
        );})}
        {items.length === 0 && <li className="empty">No to-dos yet — add your first below.</li>}
      </ul>
      <form className="todo-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do…" />
        <select className="todo-assign-select recur-select" value={recurrence} onChange={(e) => setRecurrence(e.target.value)} title="Repeat?">
          <option value="">One-off</option>
          {RECURRENCE_ORDER.map((r) => <option key={r} value={r}>🔁 {RECURRENCE_META[r].short}</option>)}
        </select>
        {collaborative && accessUsers.length > 0 && (
          <select className="todo-assign-select" value={assignee} onChange={(e) => setAssignee(e.target.value)} title="Assign to">
            <option value="">Unassigned</option>
            {accessUsers.map((u) => <option key={u.id} value={u.id}>{firstName(u.name)}</option>)}
          </select>
        )}
        <button type="submit" className="add-btn" title="Add" disabled={!text.trim()}>＋ Add</button>
      </form>
    </section>
  );
}

// --- Attributed notes thread ------------------------------------------------
function NotesThread({ notes, projectId, reload, user, isOwner }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try { await api.addNote(projectId, body.trim()); setBody(''); await reload(); }
    finally { setBusy(false); }
  }
  async function remove(n) {
    if (!window.confirm('Delete this note?')) return;
    await api.deleteNote(n.id);
    await reload();
  }

  return (
    <section className="panel">
      <div className="panel-head"><h3>Notes</h3><span className="panel-hint">Shared thread — everyone sees who wrote what</span></div>
      <ul className="note-thread">
        {notes.map((n) => {
          const own = user && n.author_id === user.id;
          return (
            <li key={n.id} className={'note-item' + (own ? ' own' : '')}>
              <div className="note-head">
                <span className="note-author">{firstName(n.author_name) || 'Someone'}</span>
                <span className="note-when">{whenLabel(n.created_at)}</span>
                {(own || isOwner) && <button className="todo-del note-del" title="Delete" onClick={() => remove(n)}>×</button>}
              </div>
              <div className="note-body">{n.body}</div>
            </li>
          );
        })}
        {notes.length === 0 && <li className="empty">No notes yet — start the thread below.</li>}
      </ul>
      <form className="note-add" onSubmit={add}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note for the thread…"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(e); }}
          rows={2}
        />
        <button type="submit" className="btn small primary" disabled={!body.trim() || busy}>Post</button>
      </form>
    </section>
  );
}

function LinksPanel({ links, projectId, reload, onChanged }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');

  async function add(e) {
    e.preventDefault();
    if (!url.trim()) return;
    await api.addLink(projectId, { label: label.trim(), url: url.trim() });
    setLabel(''); setUrl('');
    await reload();
    onChanged?.();
  }
  async function remove(l) { await api.deleteLink(l.id); await reload(); onChanged?.(); }

  return (
    <section className="panel">
      <div className="panel-head"><h3>Links</h3><span className="panel-hint">Resources</span></div>
      <ul className="link-list">
        {links.map((l) => (
          <li key={l.id} className="link-row">
            <a href={l.url} target="_blank" rel="noreferrer" className="link-a">🔗 {l.label}</a>
            <button className="todo-del" title="Delete" onClick={() => remove(l)}>×</button>
          </li>
        ))}
        {links.length === 0 && <li className="empty">No links yet.</li>}
      </ul>
      <form className="link-add" onSubmit={add}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a URL…" />
        <button className="btn small" type="submit">Add</button>
      </form>
    </section>
  );
}

function FilesPanel({ files, projectId, reload, onChanged }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function upload(fileList) {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    setBusy(true); setErr('');
    try {
      for (const f of arr) await api.uploadFile(projectId, f);
      await reload();
      onChanged?.();
    } catch (e) {
      setErr(e.message || 'upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(f) {
    if (!window.confirm(`Remove ${f.original_name}?`)) return;
    await api.deleteFile(f.id); await reload(); onChanged?.();
  }

  return (
    <section className="panel">
      <div className="panel-head"><h3>Files</h3><span className="panel-hint">Documents</span></div>
      <ul className="file-list">
        {files.map((f) => (
          <li key={f.id} className="file-row">
            <a href={`/api/files/${f.id}/download`} className="file-a">📄 {f.original_name}</a>
            <span className="file-size">{fileSize(f.size)}</span>
            <button className="todo-del" title="Delete" onClick={() => remove(f)}>×</button>
          </li>
        ))}
        {files.length === 0 && <li className="empty">No files yet.</li>}
      </ul>
      <div
        className={drag ? 'dropzone over' : 'dropzone'}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
      >
        {busy ? 'Uploading…' : 'Drop a file here, or click to choose (max 25 MB)'}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => { upload(e.target.files); e.target.value = ''; }}
        />
      </div>
      {err && <p className="login-error">{err}</p>}
    </section>
  );
}
