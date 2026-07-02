import { useEffect, useState } from 'react'
import { useCloud } from '../state/authStore'
import { api, type TeamMember, type WorkspaceVersionInfo } from '../lib/serverApi'
import { applyServerData } from '../lib/cloudSync'

const ROLE_RU: Record<string, string> = {
  owner: 'владелец',
  accountant: 'бухгалтер',
  viewer: 'просмотр',
}

/** Блок облака в Sidebar: кабинеты (мультибухгалтерия), роль, статус, команда, история. */
export function CloudStatus() {
  const { enabled, user, status, lastVersion, role, workspaces, workspaceId, switchWorkspace, saveNow, logout } =
    useCloud()
  const [showVersions, setShowVersions] = useState(false)
  const [showTeam, setShowTeam] = useState(false)

  if (!enabled || !user) return null

  const statusText =
    role === 'viewer'
      ? 'Режим просмотра'
      : status === 'saving'
        ? 'Сохранение…'
        : status === 'error'
          ? 'Ошибка сохранения'
          : 'Сохранено в облаке ✓'
  const statusColor =
    role === 'viewer' ? 'text-warn' : status === 'error' ? 'text-danger' : status === 'saving' ? 'text-muted' : 'text-ok'

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

      {/* Кабинеты: селектор появляется, когда доступно больше одного (бухфирма). */}
      {workspaces.length > 1 ? (
        <select
          className="mt-1.5 w-full rounded-md border border-line bg-white px-1.5 py-1 text-[11px] dark:bg-slate-900"
          value={workspaceId ?? ''}
          onChange={(e) => switchWorkspace(Number(e.target.value) || null)}
          title="Переключить кабинет"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.own ? `Мой кабинет` : `${w.name || 'Кабинет'} · ${w.owner_email}`} ({ROLE_RU[w.role]})
            </option>
          ))}
        </select>
      ) : (
        <div className="mt-1 text-muted">
          Кабинет: {workspaces[0]?.own === false ? workspaces[0]?.owner_email : 'мой'} · {ROLE_RU[role]}
        </div>
      )}

      <div className={`mt-1 ${statusColor}`}>
        {statusText}
        {lastVersion > 0 && <span className="text-muted"> · версия {lastVersion}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
        {role !== 'viewer' && (
          <button type="button" onClick={() => void saveNow()} className="text-brand-600 hover:underline">
            Сохранить
          </button>
        )}
        <button type="button" onClick={() => setShowVersions(true)} className="text-brand-600 hover:underline">
          История
        </button>
        <button type="button" onClick={() => setShowTeam(true)} className="text-brand-600 hover:underline">
          Команда
        </button>
        <a href={api.exportUrl()} className="text-brand-600 hover:underline">
          Скачать
        </a>
      </div>
      {showVersions && <VersionsModal onClose={() => setShowVersions(false)} />}
      {showTeam && <TeamModal onClose={() => setShowTeam(false)} />}
    </div>
  )
}

/** Команда и доступы: участники, роли, приглашение по коду, вступление по коду. */
function TeamModal({ onClose }: { onClose: () => void }) {
  const { role, refreshWorkspaces, switchWorkspace } = useCloud()
  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [invites, setInvites] = useState<{ code: string; role: string; expires_at: string }[]>([])
  const [newCode, setNewCode] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const isOwner = role === 'owner'

  const load = () => {
    api
      .teamMembers()
      .then((r) => setMembers(r.members))
      .catch(() => setErr('Не удалось загрузить участников'))
    if (isOwner) {
      api
        .teamInvites()
        .then((r) => setInvites(r.invites))
        .catch(() => undefined)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  const invite = async (r: 'accountant' | 'viewer') => {
    setErr(null)
    try {
      const res = await api.teamInvite(r)
      setNewCode(res.code)
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const join = async () => {
    setErr(null)
    setMsg(null)
    try {
      const res = await api.teamJoin(joinCode)
      setMsg(`Доступ получен: кабинет ${res.owner_email} (роль: ${ROLE_RU[res.role] ?? res.role}). Переключаю…`)
      await refreshWorkspaces()
      setTimeout(() => switchWorkspace(res.workspace_id), 900)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Код не подошёл')
    }
  }

  const changeRole = async (userId: number, r: 'accountant' | 'viewer') => {
    try {
      await api.teamChangeRole(userId, r)
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const remove = async (userId: number, email: string) => {
    if (!window.confirm(`Отозвать доступ у ${email}?`)) return
    try {
      await api.teamRemove(userId)
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Команда и доступы"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 text-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-ink">Команда и доступы</h2>
        <p className="mb-4 text-muted">
          Несколько бухгалтеров ведут один кабинет: владелец приглашает по коду, роли — «бухгалтер»
          (полный доступ) или «просмотр» (только чтение).
        </p>
        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-danger">{err}</div>}
        {msg && <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-ok">{msg}</div>}

        <div className="mb-2 font-medium text-ink">Участники кабинета</div>
        {members === null ? (
          <p className="text-muted">Загрузка…</p>
        ) : (
          <div className="space-y-1.5">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <span className="min-w-0 flex-1 truncate">
                  {m.email}
                  {m.me && <span className="ml-1 text-[11px] text-muted">(вы)</span>}
                </span>
                {isOwner && m.role !== 'owner' ? (
                  <select
                    className="rounded-md border border-line px-1.5 py-0.5 text-xs"
                    value={m.role}
                    onChange={(e) => void changeRole(m.user_id, e.target.value as 'accountant' | 'viewer')}
                  >
                    <option value="accountant">бухгалтер</option>
                    <option value="viewer">просмотр</option>
                  </select>
                ) : (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-muted">
                    {ROLE_RU[m.role]}
                  </span>
                )}
                {isOwner && m.role !== 'owner' && (
                  <button
                    type="button"
                    aria-label={`Отозвать доступ ${m.email}`}
                    onClick={() => void remove(m.user_id, m.email)}
                    className="text-xs text-slate-400 hover:text-danger"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {isOwner && (
          <>
            <div className="mb-2 mt-5 font-medium text-ink">Пригласить в этот кабинет</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void invite('accountant')}
                className="rounded-lg border border-line px-3 py-1.5 font-medium text-ink hover:border-brand-300 hover:bg-brand-50"
              >
                Код для бухгалтера
              </button>
              <button
                type="button"
                onClick={() => void invite('viewer')}
                className="rounded-lg border border-line px-3 py-1.5 font-medium text-ink hover:border-brand-300 hover:bg-brand-50"
              >
                Код для просмотра
              </button>
            </div>
            {newCode && (
              <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2">
                Код приглашения: <span className="font-mono text-base font-semibold">{newCode}</span>
                <span className="block text-[11px] text-muted">
                  Передайте коллеге — он вводит код у себя в «Команда → Войти по коду». Код одноразовый,
                  действует 7 дней.
                </span>
              </div>
            )}
            {invites.length > 0 && (
              <div className="mt-2 text-[11px] text-muted">
                Активные коды: {invites.map((i) => `${i.code} (${ROLE_RU[i.role] ?? i.role})`).join(', ')}
              </div>
            )}
          </>
        )}

        <div className="mb-2 mt-5 font-medium text-ink">Войти в чужой кабинет по коду</div>
        <div className="flex gap-2">
          <input
            className="w-40 rounded-lg border border-line px-3 py-1.5 font-mono uppercase"
            placeholder="КОД"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button
            type="button"
            onClick={() => void join()}
            disabled={joinCode.trim().length < 4}
            className="rounded-lg bg-brand-600 px-4 py-1.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Присоединиться
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Код выдаёт владелец кабинета (например, ваш клиент-ИП или главный бухгалтер фирмы).
        </p>

        <div className="mt-5 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 font-medium text-ink hover:bg-slate-50"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

function VersionsModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<WorkspaceVersionInfo[] | null>(null)
  const [current, setCurrent] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { role } = useCloud()

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
        <p className="mb-4 text-sm text-muted">
          Каждое сохранение — отдельная версия (видно, кто сохранил). Можно вернуться к любой.
        </p>
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
                {v.version !== current && role !== 'viewer' && (
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
