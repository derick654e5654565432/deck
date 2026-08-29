import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import Login from './Login.jsx';
import InviteSignup from './InviteSignup.jsx';
import Home from './Home.jsx';
import Dashboard from './Dashboard.jsx';
import ScheduleView from './ScheduleView.jsx';
import TeamView from './TeamView.jsx';
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
import { Icon } from './Icon.jsx';

const PRIMARY = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'pipeline', label: 'Pipeline', icon: 'columns' },
  { key: 'schedule', label: 'Schedule', icon: 'calendar' },
  { key: 'team', label: 'Team', icon: 'people' },
];
const SECONDARY = [
  { key: 'recurring', label: 'Recurring', icon: 'repeat' },
  { key: 'tasks', label: 'My tasks', icon: 'check' },
  { key: 'responsibilities', label: 'Roles', icon: 'clipboard' },
  { key: 'vault', label: 'Vault', icon: 'lock' },
];

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking
  const [user, setUser] = useState(null);
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite'));
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [members, setMembers] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [view, setView] = useState('dashboard');
  const [showNew, setShowNew] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState(false);

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
    setShowNew(false); setShowVoice(false);
    await refresh();
    setOpenId(r.id);
  }
  async function logout() {
    await api.logout().catch(() => {});
    setAuthed(false); setUser(null); setOpenId(null);
  }

  function go(v) { setOpenId(null); setView(v); setDrawer(false); }

  if (authed === null) return <div className="loading">Loading Deck…</div>;
  if (inviteToken && !authed) return <InviteSignup token={inviteToken} onSuccess={onAuthed} onCancel={clearInvite} />;
  if (!authed) return <Login onSuccess={onAuthed} />;

  const openProject = projects.find((p) => p.id === openId);
  const firstName = (user?.name || 'there').split(' ')[0];
  const initials = (user?.name || 'D').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  const navItem = (it) => (
    <button
      key={it.key}
      className={'side-link' + (openId == null && view === it.key ? ' active' : '')}
      onClick={() => go(it.key)}
    >
      <span className="ic"><Icon name={it.icon} /></span>
      <span>{it.label}</span>
    </button>
  );

  const sidebar = (cls = '') => (
    <aside className={'sidebar' + cls}>
      <div className="side-brand">
        <div className="side-logo">FC</div>
        <div>
          <div className="side-brand-name">Full Chair</div>
          <div className="side-brand-sub">Agency workspace</div>
        </div>
      </div>
      <nav className="side-nav">
        {PRIMARY.map(navItem)}
        <div className="side-group-label">More</div>
        {SECONDARY.map(navItem)}
      </nav>
      <div className="side-actions">
        <button className="btn primary" onClick={() => { setShowNew(true); setDrawer(false); }}>＋ New project</button>
        <button className="btn" onClick={() => { setShowVoice(true); setDrawer(false); }}><span className="ic-inline"><Icon name="mic" /></span> Speak</button>
        <button className="btn" onClick={() => { setShowClients(true); setDrawer(false); }}><span className="ic-inline"><Icon name="people" /></span> Clients</button>
        <button className="btn" onClick={() => { setShowTemplates(true); setDrawer(false); }}><span className="ic-inline"><Icon name="copy" /></span> Templates</button>
      </div>
      <div className="side-spacer" />
      <div className="side-user">
        <div className="side-avatar">{initials}</div>
        <div>
          <div className="side-user-name">{user?.name || 'You'}</div>
          <div className="side-user-role">{user?.role === 'admin' ? 'Admin' : 'Member'}</div>
        </div>
        <button className="side-logout" onClick={logout}>Log out</button>
      </div>
    </aside>
  );

  return (
    <div className="shell">
      {sidebar()}
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}
      {drawer && sidebar(' drawer-open')}

      <main className="main">
        <div className="mobile-bar">
          <div className="side-logo">FC</div>
          <div>
            <div className="side-brand-name">Full Chair</div>
            <div className="side-brand-sub">Agency workspace</div>
          </div>
          <button className="mobile-menu-btn" onClick={() => setDrawer(true)}>☰ Menu</button>
        </div>

        {openId != null ? (
          <ProjectDetail
            key={openId}
            projectId={openId}
            summary={openProject}
            clients={clients}
            members={members}
            user={user}
            onManageClients={() => setShowClients(true)}
            onBack={() => setOpenId(null)}
            onChanged={refresh}
            onDeleted={() => { setOpenId(null); refresh(); }}
          />
        ) : view === 'dashboard' ? (
          <Dashboard
            projects={projects}
            clients={clients}
            user={user}
            loading={loading}
            onOpen={setOpenId}
            onNew={() => setShowNew(true)}
            onGo={go}
          />
        ) : view === 'schedule' ? (
          <ScheduleView projects={projects} clients={clients} onOpen={setOpenId} />
        ) : view === 'team' ? (
          <TeamView user={user} members={members} onReload={loadMembers} />
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
            initialGroup="stage"
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
      {showVoice && <VoiceCapture onCreate={createProject} onClose={() => setShowVoice(false)} />}
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
