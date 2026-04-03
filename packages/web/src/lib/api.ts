const API_BASE = '/api';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const json = await res.json();

  if (!json.success) {
    throw new ApiError(json.error.message, json.error.code);
  }

  return json.data as T;
}

export class ApiError extends Error {
  constructor(message: string, public code: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// Auth
export const auth = {
  register: (data: { email: string; password: string; name: string; phone?: string; company?: string }) =>
    request<{ token: string; user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<{ user: any }>('/auth/me').then((d) => d.user),
};

// Clients
export const clients = {
  list: () => request<{ clients: any[] }>('/clients').then((d) => d.clients),
  get: (id: string) => request<{ client: any }>(`/clients/${id}`).then((d) => d.client),
  create: (data: { name: string; email?: string; phone?: string; leadSource?: string; preferredLanguage?: string; notes?: string }) =>
    request<{ client: any }>('/clients', { method: 'POST', body: JSON.stringify(data) }).then((d) => d.client),
  update: (id: string, data: Record<string, any>) =>
    request<{ client: any }>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then((d) => d.client),
  delete: (id: string) =>
    request<{ deleted: boolean }>(`/clients/${id}`, { method: 'DELETE' }),
};

// Interviews
export const interviews = {
  create: (clientId: string) =>
    request<{ session: any; interviewUrl: string }>(`/clients/${clientId}/interviews`, { method: 'POST', body: '{}' }),
  get: (token: string) =>
    request<any>(`/interviews/${token}`),
  sendMessage: (token: string, message: string) =>
    request<any>(`/interviews/${token}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
  status: (token: string) =>
    request<any>(`/interviews/${token}/status`),
};

// Reports
export const reports = {
  generate: (clientId: string) =>
    request<{ report: any }>(`/clients/${clientId}/reports/generate`, { method: 'POST' }).then((d) => d.report),
  get: (clientId: string, reportId: string) =>
    request<{ report: any }>(`/clients/${clientId}/reports/${reportId}`).then((d) => d.report),
  lenderSnapshot: (clientId: string, reportId: string) =>
    request<{ lenderSnapshot: any }>(`/clients/${clientId}/reports/${reportId}/lender-snapshot`).then((d) => d.lenderSnapshot),
};

// Workflow
export const workflow = {
  get: (clientId: string) =>
    request<{ workflow: any }>(`/clients/${clientId}/workflow`).then((d) => d.workflow),
  execute: (clientId: string, notes?: string) =>
    request<{ workflow: any }>(`/clients/${clientId}/workflow/execute`, { method: 'POST', body: JSON.stringify({ actionNotes: notes ?? '' }) }).then((d) => d.workflow),
};

// Dashboard
export const dashboard = {
  summary: () => request<any>('/dashboard/summary'),
  clients: (status?: string) =>
    request<{ clients: any[] }>(`/dashboard/clients${status ? `?status=${status}` : ''}`).then((d) => d.clients),
};
