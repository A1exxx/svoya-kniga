import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ApiError,
  activeWs,
  api,
  serverMode,
  setActiveWs,
  type CloudUser,
  type WorkspaceInfo,
} from '../lib/serverApi'
import { applyServerData, collectLocal, hasLocalData, localHash } from '../lib/cloudSync'
import { LoginScreen } from '../components/LoginScreen'

type Phase = 'loading' | 'login' | 'ready'
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'
export type WsRole = 'owner' | 'accountant' | 'viewer'

const PULLED_FLAG = 'svk.synced.session'

interface CloudCtx {
  enabled: boolean
  user: CloudUser | null
  status: SyncStatus
  lastVersion: number
  /** Роль в активном кабинете; viewer = только чтение (автопуш выключен). */
  role: WsRole
  /** Все кабинеты, доступные пользователю (свой + приглашения). */
  workspaces: WorkspaceInfo[]
  /** Активный кабинет (id) — null пока не загружен список. */
  workspaceId: number | null
  switchWorkspace: (id: number | null) => void
  refreshWorkspaces: () => Promise<void>
  saveNow: () => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<CloudCtx | null>(null)

export function CloudProvider({ children }: { children: ReactNode }) {
  const enabled = serverMode()
  const [phase, setPhase] = useState<Phase>(enabled ? 'loading' : 'ready')
  const [user, setUser] = useState<CloudUser | null>(null)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastVersion, setLastVersion] = useState(0)
  const [role, setRole] = useState<WsRole>('owner')
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [workspaceId, setWorkspaceId] = useState<number | null>(null)
  const lastHash = useRef<string>('')

  const refreshWorkspaces = async () => {
    try {
      const r = await api.listWorkspaces()
      setWorkspaces(r.workspaces)
    } catch {
      /* не критично */
    }
  }

  // Первичная подтяжка после входа: сервер — источник правды. Если на сервере
  // пусто (первый вход в СВОЙ кабинет), заливаем туда текущий локальный кабинет.
  const pullThenReady = async () => {
    void refreshWorkspaces()
    if (sessionStorage.getItem(PULLED_FLAG)) {
      lastHash.current = localHash()
      try {
        const ws = await api.getWorkspace()
        setRole(ws.role)
        setWorkspaceId(ws.workspace_id)
        setLastVersion(ws.version)
      } catch {
        /* ignore */
      }
      setPhase('ready')
      return
    }
    try {
      const ws = await api.getWorkspace()
      sessionStorage.setItem(PULLED_FLAG, '1')
      setRole(ws.role)
      setWorkspaceId(ws.workspace_id)
      if (ws.data && Object.keys(ws.data).length > 0) {
        applyServerData(ws.data)
        setLastVersion(ws.version)
        location.reload() // перечитать стора из обновлённого localStorage
        return
      }
      // Сервер пуст — отправляем текущее локальное состояние наверх (только не-viewer).
      if (hasLocalData() && ws.role !== 'viewer') {
        const r = await api.saveWorkspace(collectLocal(), 'первичная загрузка кабинета')
        setLastVersion(r.version)
      }
    } catch (e) {
      // Нет доступа к сохранённому кабинету (отозвали) → назад в свой.
      if (e instanceof ApiError && (e.status === 403 || e.status === 404) && activeWs() != null) {
        setActiveWs(null)
        sessionStorage.removeItem(PULLED_FLAG)
        location.reload()
        return
      }
      /* офлайн/ошибка — продолжаем с локальными данными */
    }
    lastHash.current = localHash()
    setPhase('ready')
  }

  // Старт: проверить сессию.
  useEffect(() => {
    if (!enabled) return
    let alive = true
    api
      .me()
      .then((u) => {
        if (!alive) return
        setUser(u)
        void pullThenReady()
      })
      .catch(() => {
        if (!alive) return
        setPhase('login') // 401 или сервер недоступен → показываем вход
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Автосохранение: раз в 8 c пушим, если что-то менялось; + при закрытии вкладки.
  // Для роли «просмотр» — выключено (сервер всё равно отклонит 403).
  useEffect(() => {
    if (!enabled || phase !== 'ready' || !user || role === 'viewer') return
    let busy = false
    const push = async (note = 'автосохранение') => {
      const h = localHash()
      if (busy || h === lastHash.current) return
      busy = true
      setStatus('saving')
      try {
        const r = await api.saveWorkspace(collectLocal(), note)
        lastHash.current = h
        setLastVersion(r.version)
        setStatus('saved')
      } catch {
        setStatus('error')
      } finally {
        busy = false
      }
    }
    const id = window.setInterval(() => void push(), 8000)
    const onHide = () => {
      if (document.visibilityState === 'hidden') void push('сохранение при уходе')
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [enabled, phase, user, role])

  const onAuthed = (u: CloudUser) => {
    setUser(u)
    setPhase('loading')
    void pullThenReady()
  }

  const saveNow = async () => {
    if (role === 'viewer') return
    setStatus('saving')
    try {
      const r = await api.saveWorkspace(collectLocal(), 'сохранение вручную')
      lastHash.current = localHash()
      setLastVersion(r.version)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  // Переключение кабинета: сохранить текущий (если можем), затем перетянуть новый.
  const switchWorkspace = (id: number | null) => {
    const doSwitch = () => {
      setActiveWs(id)
      sessionStorage.removeItem(PULLED_FLAG) // форсируем pull нового кабинета
      location.reload()
    }
    if (role !== 'viewer' && localHash() !== lastHash.current) {
      // Не теряем несохранённые правки текущего кабинета.
      void api
        .saveWorkspace(collectLocal(), 'сохранение перед переключением кабинета')
        .catch(() => undefined)
        .then(doSwitch)
      return
    }
    doSwitch()
  }

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem(PULLED_FLAG)
    setActiveWs(null)
    setUser(null)
    setPhase('login')
  }

  if (!enabled) return <>{children}</>
  if (phase === 'loading')
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">Загрузка кабинета…</div>
    )
  if (phase === 'login') return <LoginScreen onAuthed={onAuthed} />

  return (
    <Ctx.Provider
      value={{
        enabled,
        user,
        status,
        lastVersion,
        role,
        workspaces,
        workspaceId,
        switchWorkspace,
        refreshWorkspaces,
        saveNow,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

/** Облачный контекст. В локальном режиме провайдер не оборачивает — вернёт null-заглушку. */
export function useCloud(): CloudCtx {
  return (
    useContext(Ctx) ?? {
      enabled: false,
      user: null,
      status: 'idle',
      lastVersion: 0,
      role: 'owner',
      workspaces: [],
      workspaceId: null,
      switchWorkspace: () => {},
      refreshWorkspaces: async () => {},
      saveNow: async () => {},
      logout: async () => {},
    }
  )
}
