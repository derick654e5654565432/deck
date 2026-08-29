import { useState, useRef, useEffect } from 'react';
import ClientAvatar from './ClientAvatar.jsx';

// Shows the project's current client (logo + name) and lets you change it.
// type="button" everywhere so it never submits a surrounding form.
export default function ClientPicker({ clients, value, onPick, onManage, manageLabel = '＋ Manage clients…' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = clients.find((c) => c.id === value) || null;

  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function choose(id) {
    setOpen(false);
    if (id !== value) onPick(id);
  }

  return (
    <div className="client-picker" ref={ref}>
      <button type="button" className={'client-trigger' + (current ? ' has' : '')} onClick={() => setOpen((o) => !o)}>
        {current ? <><ClientAvatar client={current} size={20} /><span>{current.name}</span></>
          : <><span className="logo-placeholder small">◈</span><span>Assign client</span></>}
        <span className="caret">▾</span>
      </button>

      {open && (
        <div className="client-menu">
          <button type="button" className="client-menu-item" onClick={() => choose(null)}>
            <span className="logo-placeholder small">∅</span><span>No client</span>
          </button>
          {clients.map((c) => (
            <button type="button" key={c.id} className={'client-menu-item' + (c.id === value ? ' active' : '')} onClick={() => choose(c.id)}>
              <ClientAvatar client={c} size={20} /><span>{c.name}</span>
            </button>
          ))}
          <button type="button" className="client-menu-item manage" onClick={() => { setOpen(false); onManage(); }}>
            {manageLabel}
          </button>
        </div>
      )}
    </div>
  );
}
