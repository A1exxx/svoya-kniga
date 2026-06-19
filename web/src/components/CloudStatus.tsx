import { useEffect, useState } from 'react'
import { useCloud } from '../state/authStore'
import { api, type WorkspaceVersionInfo } from '../lib/serverApi'
import { applyServerData } from '../lib/cloudSync'

/** Компактный блок облака в Sidebar: кто вошёл, статус сохранения, история, выход. */
export function CloudStatus() {
  const { enabled, user, status, lastVersion, saveNow, logout } = useCloud()
  const [showVersions, setShowVersions] = useState(false)

  if (!enabled || !user) return null

  const statusText =
    status === 'saving' ? 'Сохранение…' : status === 'error' ? 'Ошибка сохранения' : 'Сохранено в облаке ✓'
  const statusColor = status === 'error' ? 'text-danger' : status === 'saving' ? 'text-muted' : 'text-ok'

  return (
    <div className="rounded-lg border border-line bg-slate-50/60 p-2.5 text-xs dark:bg-slate-800/40">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium text-ink" title={user.email}>
          ☁ {user.name || user.email}
        </span>
        <button type="button" onClick={logout} className="shrink-0 text-slate-400 hover:text-danger">
          выйти
        </button>
      </div>
      <div className={`mt-1 ${statusColor}`}>
        {statusText}
        {lastVersion > 0 && <span className="text-muted"> · версия {lastVersion}</span>}
      </div>
      <div className="mt-1.5 flex gap-2">
        <button type="button" onClick={() => void saveNow()} className="text-brand-600 hover:underline">
          Сохранить
        </button>
        <button type="button" onClick={() => setShowVersions(true)} className="text-brand-600 hover:underline">
          История
        </button>
        <a href={api.exportUrl()} className="text-brand-600 hover:underline">
          Скачать
        </a>
      </div>
      {showVersions && <VersionsModal onClose={() => setShowVersions(false)} />}
    </div>
  )
}

function VersionsModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<WorkspaceVersionInfo[] | null>(null)
  const [current, setCurrent] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .listVersions()
      .then((r) => {
        setRows(r.versions)
        setCurrent(r.current)
      })
      .catch(() => setErr('Не удалось загрузить историю'))
  }, [])

  const restore = async (v: number) => {
    if (!window.confirm(`Откатить кабинет к версии ${v}? Текущее состояние сохранится как новая версия.`)) return
    setBusy(true)
    try {
      await api.restoreVersion(v)
      const ws = await api.getWorkspace()
      if (ws.data) applyServerData(ws.data)
      location.reload()
    } catch {
      setErr('Не удалось откатить')
      setBusy(false)
    }
  }

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('ru-RU')
    } catch {
      return iso
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="История версий"
      onClick={onClose}
    >
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold text-ink">История версий кабинета</h2>
        <p className="mb-4 text-sm text-muted">Каждое сохранение — отдельная версия. Можно вернуться к любой.</p>
        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{err}</div>}
        {rows === null ? (
          <p className="text-sm text-muted">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">Пока нет сохранённых версий.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((v) => (
              <div key={v.version} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="font-medium text-ink">
                  v{v.version}
                  {v.version === current && <span className="ml-1 text-[11px] text-ok">текущая</span>}
                </span>
                <span className="flex-1 truncate text-muted">
                  {fmt(v.saved_at)} · {Math.round(v.size_bytes / 1024)} КБ{v.note ? ` · ${v.note}` : ''}
                </span>
                {v.version !== current && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void restore(v.version)}
                    className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs text-ink hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                  >
                    Вернуть
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 text-right">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
