async function req(method, url, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) {
    const err = new Error('unauthorized');
    err.unauthorized = true;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  me: () => req('GET', '/api/me'),
  login: (email, password) => req('POST', '/api/login', { email, password }),
  logout: () => req('POST', '/api/logout'),
  invite: (token) => req('GET', `/api/invite/${token}`),
  signup: (token, name, password) => req('POST', '/api/signup', { token, name, password }),
  users: () => req('GET', '/api/users'),
  createInvite: (email, role) => req('POST', '/api/invites', { email, role }),
  deleteInvite: (id) => req('DELETE', `/api/invites/${id}`),
  members: () => req('GET', '/api/members'),

  projectShares: (id) => req('GET', `/api/projects/${id}/shares`),
  shareProject: (id, userId) => req('POST', `/api/projects/${id}/shares`, { user_id: userId }),
  unshareProject: (id, userId) => req('DELETE', `/api/projects/${id}/shares/${userId}`),
  clientShares: (id) => req('GET', `/api/clients/${id}/shares`),
  shareClient: (id, userId) => req('POST', `/api/clients/${id}/shares`, { user_id: userId }),
  unshareClient: (id, userId) => req('DELETE', `/api/clients/${id}/shares/${userId}`),

  addNote: (projectId, body) => req('POST', `/api/projects/${projectId}/notes`, { body }),
  deleteNote: (id) => req('DELETE', `/api/notes/${id}`),

  tasks: () => req('GET', '/api/tasks'),
  recurring: () => req('GET', '/api/recurring'),

  responsibilities: (clientId) => req('GET', `/api/clients/${clientId}/responsibilities`),
  addResponsibility: (clientId, body) => req('POST', `/api/clients/${clientId}/responsibilities`, body),
  updateResponsibility: (id, body) => req('PUT', `/api/responsibilities/${id}`, body),
  deleteResponsibility: (id) => req('DELETE', `/api/responsibilities/${id}`),
  reorderResponsibilities: (clientId, items) => req('POST', `/api/clients/${clientId}/responsibilities/reorder`, { items }),

  vault: () => req('GET', '/api/vault'),
  addVaultItem: (v) => req('POST', '/api/vault', v),
  updateVaultItem: (id, v) => req('PUT', `/api/vault/${id}`, v),
  deleteVaultItem: (id) => req('DELETE', `/api/vault/${id}`),
  revealVaultItem: (id) => req('GET', `/api/vault/${id}/reveal`),
  shareVaultItem: (id, userId) => req('POST', `/api/vault/${id}/shares`, { user_id: userId }),
  unshareVaultItem: (id, userId) => req('DELETE', `/api/vault/${id}/shares/${userId}`),

  projects: () => req('GET', '/api/projects'),
  project: (id) => req('GET', `/api/projects/${id}`),
  createProject: (p) => req('POST', '/api/projects', p),
  updateProject: (id, p) => req('PUT', `/api/projects/${id}`, p),
  deleteProject: (id) => req('DELETE', `/api/projects/${id}`),
  reorderProjects: (items) => req('POST', '/api/projects/reorder', { items }),

  // calendar (4-day time-grid board)
  plan: (from, to) => req('GET', `/api/plan?from=${from}&to=${to}`),
  addPlan: (b) => req('POST', '/api/plan', b),
  updatePlan: (id, b) => req('PUT', `/api/plan/${id}`, b),
  deletePlan: (id) => req('DELETE', `/api/plan/${id}`),

  templates: () => req('GET', '/api/templates'),
  createTemplate: (name) => req('POST', '/api/templates', { name }),
  useTemplate: (id, name) => req('POST', `/api/templates/${id}/use`, { name }),
  saveAsTemplate: (projectId) => req('POST', `/api/projects/${projectId}/save-as-template`),

  addTodo: (projectId, t) => req('POST', `/api/projects/${projectId}/todos`, t),
  updateTodo: (id, t) => req('PUT', `/api/todos/${id}`, t),
  deleteTodo: (id) => req('DELETE', `/api/todos/${id}`),
  reorderTodos: (items) => req('POST', '/api/todos/reorder', { items }),

  addLink: (projectId, l) => req('POST', `/api/projects/${projectId}/links`, l),
  deleteLink: (id) => req('DELETE', `/api/links/${id}`),

  clients: () => req('GET', '/api/clients'),
  deleteClient: (id) => req('DELETE', `/api/clients/${id}`),
  // create/update send FormData (name + optional logo file), so they bypass the JSON helper.
  saveClient: async (fd, id) => {
    const url = id ? `/api/clients/${id}` : '/api/clients';
    const res = await fetch(url, { method: id ? 'PUT' : 'POST', body: fd, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  voiceStatus: () => req('GET', '/api/voice/status'),
  transcribe: (audio, language) => req('POST', '/api/voice/transcribe', { audio, language }),

  deleteFile: (id) => req('DELETE', `/api/files/${id}`),
  // File upload uses FormData, so it bypasses the JSON helper.
  uploadFile: async (projectId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: 'POST', body: fd, credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
};
