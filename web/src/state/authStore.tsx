import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, api, serverMode, type CloudUser } from '../lib/serverApi'
import { applyServerData, collectLocal, hasLocalData, localHash } from '../lib/cloudSync'
import { LoginScreen } from '../components/LoginScreen'

type Phase = 'loading' | 'login' | 'ready'
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

const PULLED_FLAG = 'svk.synced.session'

interface CloudCtx {
  enabled: boolean
  user: CloudUser | null
  status: SyncStatus
  lastVersion: number
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
  const lastHash = useRef<string>('')

  // Первичная подтяжка после входа: сервер — источник правды. Если на сервере
  // пусто (первый вход), заливаем туда текущий локальный кабинет.
  const pullThenReady = async () => {
    if (sessionStorage.getItem(PULLED_FLAG)) {
      lastHash.current = localHash()
      setPhase('ready')
      return
    }
    try {
      const ws = await api.getWorkspace()
      sessionStorage.setItem(PULLED_FLAG, '1')
      if (ws.data && Object.keys(ws.data).length > 0) {
        applyServerData(ws.data)
        setLastVersion(ws.version)
        location.reload() // перечитать стора из обновлённого localStorage
        return
      }
      // Сервер пуст — отправляем текущее локальное состояние наверх.
      if (hasLocalData()) {
        const r = await api.saveWorkspace(collectLocal(), 'первичная загрузка кабинета')
        setLastVersion(r.version)
      }
    } catch {
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
      .catch((e) => {
        if (!alive) return
        if (e instanceof ApiError && e.status === 401) setPhase('login')
        else setPhase('login') // сервер недоступен → показываем вход (можно повторить)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Автосохранение: раз в 8 c пушим, если что-то менялось; + при закрытии вкладки.
  useEffect(() => {
    if (!enabled || phase !== 'ready' || !user) return
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
  }, [enabled, phase, user])

  const onAuthed = (u: CloudUser) => {
    setUser(u)
    setPhase('loading')
    void pullThenReady()
  }

  const saveNow = async () => {
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

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem(PULLED_FLAG)
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
    <Ctx.Provider value={{ enabled, user, status, lastVersion, saveNow, logout }}>{children}</Ctx.Provider>
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
      saveNow: async () => {},
      logout: async () => {},
    }
  )
}
