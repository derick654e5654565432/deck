import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import Login from './Login.jsx';
import InviteSignup from './InviteSignup.jsx';
import Home from './Home.jsx';
import MyTasks from './MyTasks.jsx';
import RecurringView from './RecurringView.jsx';
import VaultView from './VaultView.jsx';
import ResponsibilitiesView from './ResponsibilitiesView.jsx';
import ProjectDetail from './ProjectDetail.jsx';
import NewProjectModal from './NewProjectModal.jsx';
import VoiceCapture from './VoiceCapture.jsx';
import ClientsManager from './ClientsManager.jsx';
import MembersModal from './MembersModal.jsx';
import TemplatesModal from './TemplatesModal.jsx';

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking
  const [user, setUser] = useState(null);
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite'));
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [members, setMembers] = useState([]);
  const [openId, setOpenId] = useState(null);   // null = home / tasks view
  const [view, setView] = useState('home');     // 'home' | 'tasks'
  const [showNew, setShowNew] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [loading, setLoading] = useState(false);

  function clearInvite() {
    setInviteToken(null);
    window.history.replaceState({}, '', window.location.pathname);
  }
  function onAuthed(u) { setUser(u); setAuthed(true); clearInvite(); }

  const loadProjects = useCallback(async () => {
    const r = await api.projects();
    setProjects(r.projects);
  }, []);

  const loadClients = useCallback(async () => {
    const r = await api.clients();
    setClients(r.clients);
  }, []);

  const loadMembers = useCallback(async () => {
    const r = await api.members();
    setMembers(r.members || []);
  }, []);

  useEffect(() => {
    api.me().then((r) => { setAuthed(r.authed); setUser(r.user); }).catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (authed) {
      setLoading(true);
      loadProjects().catch((e) => { if (e.unauthorized) setAuthed(false); }).finally(() => setLoading(false));
      loadClients().catch(() => {});
      loadMembers().catch(() => {});
    }
  }, [authed, loadProjects, loadClients, loadMembers]);

  async function refresh() {
    try { await loadProjects(); }
    catch (e) { if (e.unauthorized) setAuthed(false); }
  }

  async function reloadClients() {
    try { await loadClients(); await loadProjects(); }
    catch (e) { if (e.unauthorized) setAuthed(false); }
  }

  async function createProject(payload) {
    const r = await api.createProject(payload);
    setShowNew(false);
    setShowVoice(false);
    await refresh();
    setOpenId(r.id); // jump straight into the new project
  }

  async function logout() {
    await api.logout().catch(() => {});
    setAuthed(false);
    setUser(null);
    setOpenId(null);
  }

  if (authed === null) return <div className="loading">Loading Deck…</div>;
  if (inviteToken && !authed) return <InviteSignup token={inviteToken} onSuccess={onAuthed} onCancel={clearInvite} />;
  if (!authed) return <Login onSuccess={onAuthed} />;

  const openProject = projects.find((p) => p.id === openId);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand-btn" onClick={() => { setOpenId(null); setView('home'); }}>
          <span className="brand-mark small">▚</span>
          <span>Deck</span>
        </button>
        <div className="topbar-actions">
          <button
            className={'btn' + (openId == null && view === 'recurring' ? ' primary' : '')}
            title="Recurring projects + tasks that keep happening"
            onClick={() => { setOpenId(null); setView('recurring'); }}
          >
            <span className="mic-label">Recurring</span><span className="mic-ico">🔁</span>
          </button>
          <button
            className={'btn' + (openId == null && view === 'tasks' ? ' primary' : '')}
            title="Tasks assigned to me + handed off by me"
            onClick={() => { setOpenId(null); setView('tasks'); }}
          >
            <span className="mic-label">My tasks</span><span className="mic-ico">✔</span>
          </button>
          <button
            className={'btn' + (openId == null && view === 'responsibilities' ? ' primary' : '')}
            title="Client roles & responsibilities"
            onClick={() => { setOpenId(null); setView('responsibilities'); }}
          >
            <span className="mic-label">Roles</span><span className="mic-ico">🧾</span>
          </button>
          <button
            className={'btn' + (openId == null && view === 'vault' ? ' primary' : '')}
            title="Password vault"
            onClick={() => { setOpenId(null); setView('vault'); }}
          >
            <span className="mic-label">Vault</span><span className="mic-ico">🔐</span>
          </button>
          {user?.role === 'admin' && (
            <button className="btn" title="Team members" onClick={() => setShowMembers(true)}>
              <span className="mic-label">Team</span><span className="mic-ico">👤</span>
            </button>
          )}
          <button className="btn" title="Templates" onClick={() => setShowTemplates(true)}>
            <span className="mic-label">Templates</span><span className="mic-ico">⧉</span>
          </button>
          <button className="btn" title="Manage clients" onClick={() => setShowClients(true)}>
            <span className="mic-label">Clients</span><span className="mic-ico">👥</span>
          </button>
          <button className="btn mic" title="Speak a new project" onClick={() => setShowVoice(true)}>
            <span className="mic-ico">🎤</span><span className="mic-label">Speak</span>
          </button>
          <button className="btn primary" onClick={() => setShowNew(true)}>＋ New project</button>
          {user?.name && <span className="user-chip" title={user.email}>{user.name.split(' ')[0]}</span>}
          <button className="btn ghost" onClick={logout}>Log out</button>
        </div>
      </header>

      <main className="content">
        {openId != null ? (
          <ProjectDetail
            key={openId}
            projectId={openId}
            summary={openProject}
            clients={clients}
            members={members}
            user={user}
            onManageClients={() => setShowClients(true)}
            onBack={() => { setOpenId(null); }}
            onChanged={refresh}
            onDeleted={() => { setOpenId(null); refresh(); }}
          />
        ) : view === 'recurring' ? (
          <RecurringView user={user} clients={clients} onOpen={setOpenId} onChanged={refresh} />
        ) : view === 'vault' ? (
          <VaultView user={user} members={members} />
        ) : view === 'responsibilities' ? (
          <ResponsibilitiesView clients={clients} />
        ) : view === 'tasks' ? (
          <MyTasks user={user} onOpen={setOpenId} onChanged={refresh} />
        ) : (
          <Home
            projects={projects}
            loading={loading}
            clients={clients}
            user={user}
            onOpen={setOpenId}
            onNew={() => setShowNew(true)}
            onChanged={refresh}
          />
        )}
      </main>

      {showNew && (
        <NewProjectModal
          onComplete={(id) => { setShowNew(false); setOpenId(id); refresh(); }}
          onSaved={refresh}
          onClose={() => setShowNew(false)}
          clients={clients}
          onClientsChanged={reloadClients}
        />
      )}
      {showVoice && (
        <VoiceCapture onCreate={createProject} onClose={() => setShowVoice(false)} />
      )}
      {showClients && (
        <ClientsManager clients={clients} members={members} onChanged={reloadClients} onClose={() => setShowClients(false)} />
      )}
      {showMembers && (
        <MembersModal onClose={() => { setShowMembers(false); loadMembers().catch(() => {}); }} />
      )}
      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onEdit={(id) => { setShowTemplates(false); setOpenId(id); }}
          onUsed={(id) => { setShowTemplates(false); refresh(); setOpenId(id); }}
        />
      )}
    </div>
  );
}
