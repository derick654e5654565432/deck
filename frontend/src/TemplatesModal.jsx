import { useEffect, useState } from 'react';
import { api } from './api.js';
import ClientAvatar from './ClientAvatar.jsx';

export default function TemplatesModal({ onClose, onEdit, onUsed }) {
  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api.templates();
    setTemplates(r.templates);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function create(e) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.createTemplate(name.trim());
      setName('');
      onEdit(r.id); // jump into the new template to add its to-dos
    } finally { setBusy(false); }
  }

  async function use(t) {
    const r = await api.useTemplate(t.id);
    onUsed(r.id);
  }

  async function remove(t) {
    if (!window.confirm(`Delete the "${t.name}" template? Projects you already spawned from it are unaffected.`)) return;
    await api.deleteProject(t.id);
    await load();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal clients-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Templates</h2>
        <p className="voice-sub" style={{ textAlign: 'left', margin: '0 0 14px' }}>
          Reusable projects with a preset to-do checklist — creative briefing, ad planning, performance check.
          <strong> Use</strong> spins up a fresh copy on your board; <strong>Edit</strong> changes the template itself.
        </p>

        <form className="mini-add" onSubmit={create}>
          <input placeholder="New template name (e.g. Creative briefing)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button className="btn primary small" type="submit" disabled={busy || !name.trim()}>Create</button>
        </form>

        <div className="client-list" style={{ marginTop: '12px' }}>
          {templates.length === 0 && <p className="empty">No templates yet — create your first above, then add its to-dos.</p>}
          {templates.map((t) => (
            <div key={t.id} className="client-row">
              {t.client_name
                ? <ClientAvatar client={{ id: t.client_id, name: t.client_name, has_logo: !!t.client_has_logo, updated_at: t.client_updated }} size={30} />
                : <span className="tmpl-icon">⧉</span>}
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{t.name}</strong>
                <span className="field-opt"> · {t.todo_count} to-do{t.todo_count === 1 ? '' : 's'}</span>
              </span>
              <button className="btn small primary" onClick={() => use(t)}>Use</button>
              <button className="btn small" onClick={() => onEdit(t.id)}>Edit</button>
              <button className="todo-del" title="Delete template" onClick={() => remove(t)}>×</button>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
