/**
 * Клиент серверной базы «СвояКнига». Включается флагом VITE_API_BASE
 * (адрес бэкенда). Если флаг не задан — приложение работает в локальном
 * режиме (как сейчас), эти функции не вызываются.
 *
 * Все запросы с credentials:'include' — серверная сессия в httpOnly-cookie.
 *
 * V2: мультипользовательский режим. Активный кабинет (свой или куда пригласили)
 * хранится в localStorage 'svk.activeWs'; все workspace-запросы идут с ?ws=<id>.
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

/** Кабинет из списка доступных (свой или по приглашению). */
export interface WorkspaceInfo {
  id: number
  name: string
  role: 'owner' | 'accountant' | 'viewer'
  owner_email: string
  own: boolean
  updated_at: string
  version: number
}

export interface TeamMember {
  user_id: number
  email: string
  name: string
  role: 'owner' | 'accountant' | 'viewer'
  me: boolean
  since: string
}

const ACTIVE_WS_KEY = 'svk.activeWs'

/** Выбранный кабинет (null = свой). Хранится локально, переживает перезагрузку. */
export function activeWs(): number | null {
  const raw = localStorage.getItem(ACTIVE_WS_KEY)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

export function setActiveWs(id: number | null): void {
  if (id == null) localStorage.removeItem(ACTIVE_WS_KEY)
  else localStorage.setItem(ACTIVE_WS_KEY, String(id))
}

/** ?ws=<id> для запросов кабинета (пусто, когда работаем в своём). */
function wsq(): string {
  const id = activeWs()
  return id == null ? '' : `?ws=${id}`
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

  listWorkspaces: () => req<{ workspaces: WorkspaceInfo[] }>('/api/workspace/list'),
  getWorkspace: () =>
    req<{
      version: number
      data: Record<string, string> | null
      saved_at: string | null
      role: 'owner' | 'accountant' | 'viewer'
      workspace_id: number
    }>('/api/workspace' + wsq()),
  saveWorkspace: (data: Record<string, string>, note = 'автосохранение') =>
    req<{ version: number; saved_at: string }>('/api/workspace' + wsq(), {
      method: 'PUT',
      body: JSON.stringify({ data, note }),
    }),
  listVersions: () =>
    req<{ current: number; versions: WorkspaceVersionInfo[] }>('/api/workspace/versions' + wsq()),
  restoreVersion: (v: number) =>
    req<{ version: number; saved_at: string }>(`/api/workspace/restore/${v}` + wsq(), { method: 'POST' }),
  exportUrl: () => API_BASE + '/api/workspace/export' + wsq(),

  // --- Команда и доступы (обслуживающая бухгалтерия) ---
  teamMembers: () =>
    req<{ workspace_id: number; my_role: string; members: TeamMember[] }>('/api/team/members' + wsq()),
  teamInvite: (role: 'accountant' | 'viewer') =>
    req<{ code: string; role: string; expires_at: string }>('/api/team/invite' + wsq(), {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
  teamInvites: () =>
    req<{ invites: { code: string; role: string; expires_at: string }[] }>('/api/team/invites' + wsq()),
  teamJoin: (code: string) =>
    req<{ workspace_id: number; name: string; role: string; owner_email: string }>('/api/team/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  teamChangeRole: (userId: number, role: 'accountant' | 'viewer') =>
    req<{ ok: boolean; role: string }>(`/api/team/members/${userId}` + wsq(), {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  teamRemove: (userId: number) =>
    req<{ ok: boolean }>(`/api/team/members/${userId}` + wsq(), { method: 'DELETE' }),
}
