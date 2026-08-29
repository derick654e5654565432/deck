import { useState, useRef } from 'react';
import { STATUS_META, STATUS_ORDER } from './constants.js';
import { api } from './api.js';
import ClientPicker from './ClientPicker.jsx';

export default function NewProjectModal({ onComplete, onSaved, onClose, clients = [], onClientsChanged }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('idea');
  const [bucket, setBucket] = useState('current');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [clientId, setClientId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const nameRef = useRef(null);

  // Inline "new client".
  const [addingClient, setAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newLogo, setNewLogo] = useState(null);
  const [newPreview, setNewPreview] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const logoRef = useRef(null);

  // To-dos / links / files gathered before the project exists.
  const [todos, setTodos] = useState([]);
  const [todoText, setTodoText] = useState('');
  const [links, setLinks] = useState([]);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [files, setFiles] = useState([]);
  const filesRef = useRef(null);

  function pickLogo(file) { setNewLogo(file || null); setNewPreview(file ? URL.createObjectURL(file) : ''); }

  async function createClientInline() {
    if (!newClientName.trim() || creatingClient) return;
    setCreatingClient(true);
    try {
      const fd = new FormData();
      fd.append('name', newClientName.trim());
      if (newLogo) fd.append('logo', newLogo);
      const r = await api.saveClient(fd);
      await onClientsChanged?.();
      setClientId(r.id);
      setAddingClient(false);
      setNewClientName(''); setNewLogo(null); setNewPreview('');
    } finally { setCreatingClient(false); }
  }

  function addTodo() { const v = todoText.trim(); if (!v) return; setTodos((a) => [...a, v]); setTodoText(''); }
  function removeTodo(i) { setTodos((a) => a.filter((_, x) => x !== i)); }
  function addLink() { const u = linkUrl.trim(); if (!u) return; setLinks((a) => [...a, { label: linkLabel.trim(), url: u }]); setLinkLabel(''); setLinkUrl(''); }
  function removeLink(i) { setLinks((a) => a.filter((_, x) => x !== i)); }
  function addFiles(list) { const arr = Array.from(list || []); if (arr.length) setFiles((a) => [...a, ...arr]); }
  function removeFile(i) { setFiles((a) => a.filter((_, x) => x !== i)); }

  async function doCreate() {
    const r = await api.createProject({
      name: name.trim(), status, bucket, description: description.trim(),
      deadline: deadline || null, client_id: clientId,
    });
    const pid = r.id;
    for (const t of todos) await api.addTodo(pid, { text: t }).catch(() => {});
    for (const l of links) await api.addLink(pid, l).catch(() => {});
    for (const f of files) await api.uploadFile(pid, f).catch(() => {});
    return pid;
  }

  // Clear the per-project fields for the next entry; keep client/status/bucket
  // so a run of projects for the same client is fast.
  function resetForNext() {
    setName(''); setDescription(''); setDeadline('');
    setTodos([]); setTodoText('');
    setLinks([]); setLinkLabel(''); setLinkUrl('');
    setFiles([]);
    setTimeout(() => nameRef.current?.focus(), 0);
  }

  // Enter / "Add & next": save and stay in the popup for the next project.
  async function addAnother(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try { await doCreate(); onSaved?.(); setSavedCount((n) => n + 1); resetForNext(); }
    finally { setBusy(false); }
  }

  // "Add & open": save and jump into the project.
  async function createAndOpen() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try { const pid = await doCreate(); onComplete(pid); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New project</h2>
        <form onSubmit={addAnother}>
          <label className="field">
            <span>Name</span>
            <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Funkyfing Jr2 launch" autoFocus />
          </label>

          <label className="field">
            <span>Short description</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. waiting on designer to send mockups" />
          </label>

          <div className="field">
            <span>Client</span>
            {addingClient ? (
              <div className="inline-client-add">
                <button type="button" className="client-logo-btn add" title="Add logo" onClick={() => logoRef.current?.click()}>
                  {newPreview ? <img className="client-avatar" style={{ width: 38, height: 38 }} src={newPreview} alt="" />
                    : <span className="logo-placeholder">＋</span>}
                </button>
                <input className="client-name-input" placeholder="New client name" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} autoFocus />
                <button type="button" className="btn small primary" onClick={createClientInline} disabled={creatingClient || !newClientName.trim()}>
                  {creatingClient ? '…' : 'Create'}
                </button>
                <button type="button" className="btn small ghost" onClick={() => { setAddingClient(false); pickLogo(null); setNewClientName(''); }}>Cancel</button>
                <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => { pickLogo(e.target.files[0]); e.target.value = ''; }} />
              </div>
            ) : (
              <ClientPicker clients={clients} value={clientId} onPick={setClientId} onManage={() => setAddingClient(true)} manageLabel="＋ New client" />
            )}
          </div>

          <div className="field-row">
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Bucket</span>
              <select value={bucket} onChange={(e) => setBucket(e.target.value)}>
                <option value="current">Current</option>
                <option value="longterm">Long-term</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span>Deadline <span className="field-opt">(optional — leave blank for none)</span></span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>

          <div className="field">
            <span>To-dos <span className="field-opt">(optional)</span></span>
            {todos.length > 0 && (
              <ul className="mini-list">
                {todos.map((t, i) => (
                  <li key={i}><span>{t}</span><button type="button" className="todo-del" onClick={() => removeTodo(i)}>×</button></li>
                ))}
              </ul>
            )}
            <div className="mini-add">
              <input value={todoText} onChange={(e) => setTodoText(e.target.value)} placeholder="Add a to-do…"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTodo(); } }} />
              <button type="button" className="btn small" onClick={addTodo} disabled={!todoText.trim()}>Add</button>
            </div>
          </div>

          <div className="field">
            <span>Links <span className="field-opt">(optional)</span></span>
            {links.length > 0 && (
              <ul className="mini-list">
                {links.map((l, i) => (
                  <li key={i}><span>🔗 {l.label || l.url}</span><button type="button" className="todo-del" onClick={() => removeLink(i)}>×</button></li>
                ))}
              </ul>
            )}
            <div className="mini-add links">
              <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Label (optional)" />
              <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Paste a URL…"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} />
              <button type="button" className="btn small" onClick={addLink} disabled={!linkUrl.trim()}>Add</button>
            </div>
          </div>

          <div className="field">
            <span>Files <span className="field-opt">(optional)</span></span>
            {files.length > 0 && (
              <ul className="mini-list">
                {files.map((f, i) => (
                  <li key={i}><span>📄 {f.name}</span><button type="button" className="todo-del" onClick={() => removeFile(i)}>×</button></li>
                ))}
              </ul>
            )}
            <button type="button" className="dropzone small" onClick={() => filesRef.current?.click()}>＋ Choose files</button>
            <input ref={filesRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>

          {savedCount > 0 && (
            <p className="save-count">✓ {savedCount} added — keep going, or Done when you're finished.</p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>{savedCount > 0 ? 'Done' : 'Cancel'}</button>
            <button type="button" className="btn" onClick={createAndOpen} disabled={busy || !name.trim()}>Add &amp; open</button>
            <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
              {busy ? 'Adding…' : 'Add & next'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
