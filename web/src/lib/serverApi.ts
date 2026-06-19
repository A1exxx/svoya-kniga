/**
 * Клиент серверной базы «СвояКнига». Включается флагом VITE_API_BASE
 * (адрес бэкенда). Если флаг не задан — приложение работает в локальном
 * режиме (как сейчас), эти функции не вызываются.
 *
 * Все запросы с credentials:'include' — серверная сессия в httpOnly-cookie.
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || ''

// VITE_SERVER_MODE=true — серверный режим при ОДНОМ адресе (бэкенд сам отдаёт
// приложение): API относительный (тот же origin), логин/cookie без CORS.
const FORCE_SERVER = (import.meta.env.VITE_SERVER_MODE as string | undefined) === 'true'

/** Включён ли серверный режим (задан адрес API или forced same-origin). */
export const serverMode = (): boolean => FORCE_SERVER || API_BASE.length > 0

export interface CloudUser {
  id: number
  email: string
  name: string
}

export interface WorkspaceVersionInfo {
  version: number
  saved_at: string
  size_bytes: number
  note: string
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    let detail = `Ошибка ${res.status}`
    try {
      const j = await res.json()
      if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const api = {
  register: (email: string, password: string, name: string) =>
    req<CloudUser>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    req<CloudUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => req<CloudUser>('/api/auth/me'),

  getWorkspace: () =>
    req<{ version: number; data: Record<string, string> | null; saved_at: string | null }>('/api/workspace'),
  saveWorkspace: (data: Record<string, string>, note = 'автосохранение') =>
    req<{ version: number; saved_at: string }>('/api/workspace', {
      method: 'PUT',
      body: JSON.stringify({ data, note }),
    }),
  listVersions: () =>
    req<{ current: number; versions: WorkspaceVersionInfo[] }>('/api/workspace/versions'),
  restoreVersion: (v: number) =>
    req<{ version: number; saved_at: string }>(`/api/workspace/restore/${v}`, { method: 'POST' }),
  exportUrl: () => API_BASE + '/api/workspace/export',
}
