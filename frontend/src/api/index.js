export const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const BASE_OPTS = {
  credentials: 'include',
};

const handleResponse = async (response) => {
  if (response.status === 401) {
    // 세션 만료 등으로 401 반환 시 프론트엔드 로그인 여부 쿠키를 비워 로그인 페이지 리다이렉션을 돕습니다.
    document.cookie = "logged_in=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error occurred' }));
    throw new Error(error.detail || response.statusText);
  }
  return response.json();
};

export const api = {
  get: async (endpoint) => {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...BASE_OPTS,
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse(response);
  },

  post: async (endpoint, body) => {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...BASE_OPTS,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },

  patch: async (endpoint, body) => {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...BASE_OPTS,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },

  delete: async (endpoint) => {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...BASE_OPTS,
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse(response);
  },
};

export const authService = {
  me: () => api.get('/auth/me'),
  login: (code) => api.get(`/auth/callback?code=${code}`),
  logout: () => api.post('/auth/logout', {}),
  updateProfile: (data) => api.patch('/user/profile', data),
  getProfile: (username) => api.get(`/auth/profile/${username}`),
  getGithubRepos: () => api.get('/auth/github/repos'),
  upgradeTier: () => api.post('/auth/upgrade'),
};

export const projectService = {
  analyze: (data) => api.post('/analyze', data),
  getStatus: (taskId) => api.get(`/status/${taskId}`),
  getOverview: (username) => api.get(`/overview/${username}`),
  getNetwork: (sessionId) => api.post('/generate/network', { session_id: sessionId }),
  getArchitectureAnalysis: (sessionId, data = {}) => api.post('/generate/architecture-analysis', { session_id: sessionId, ...data }),
  getProjectPipeline: (sessionId, data = {}) => api.post('/generate/pipeline', { session_id: sessionId, ...data }),
  checkUpdate: (projectId) => api.post(`/projects/${projectId}/check-update`),
  getProjects: () => api.get('/projects'),
};

export const inquiryService = {
  submit: (data) => api.post('/inquiries', data),
};

export const chatService = {
  ask: (data) => api.post('/chat', data),
  getHistory: (sessionId) => api.get(`/chat/history/${sessionId}`),
  getSessionInfo: (sessionId) => api.get(`/chat/session/${sessionId}/info`),
  getProjectSessions: (projectId) => api.get(`/chat/sessions/${projectId}`),
  createSession: (data) => api.post('/chat/session/new', data),
  deleteSession: (sessionId) => api.delete(`/chat/session/${sessionId}`),
};

export const docsService = {
  generateReadme: (data) => api.post('/generate/readme', data),
  getProjectReadmes: (projectId) => api.get(`/readmes/${projectId}`),
};

export const dashboardService = {
  getGlobalStats: () => api.get('/stats/global'),
};
