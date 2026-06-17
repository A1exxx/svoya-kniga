import { useRef, useState } from 'react'
import { Card, Note, inputClass } from '../components/ui'
import {
  listSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  downloadSnapshot,
  downloadBackup,
  importBackup,
  storageUsage,
  listAudit,
  clearAudit,
} from '../lib/storage/storeAdmin'

const dt = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ru-RU')
  } catch {
    return iso
  }
}
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} КБ`

export function Admin() {
  const [, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace')
  const [msg, setMsg] = useState<string | null>(null)

  const snapshots = listSnapshots()
  const audit = listAudit()
  const usage = storageUsage()

  const onRestore = (id: string) => {
    if (!window.confirm('Откатить данные к этому снимку? Текущее состояние сохранится как «перед откатом».')) return
    if (restoreSnapshot(id)) {
      setMsg('Откат выполнен. Перезагрузка…')
      setTimeout(() => window.location.reload(), 500)
    }
  }

  const onImport = async (file: File) => {
    const text = await file.text()
    const res = importBackup(text, importMode)
    setMsg(res.message)
    if (res.ok) setTimeout(() => window.location.reload(), 800)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Администрирование</h1>
        <p className="mt-1 text-sm text-muted">
          Снимки данных с откатом, резервные копии, журнал действий и занятое место. Данные хранятся
          локально; ничего не теряется.
        </p>
      </header>

      {msg && (
        <div className="mb-5">
          <Note tone="info">{msg}</Note>
        </div>
      )}

      {/* Снимки */}
      <Card
        title="Снимки и откат"
        right={
          <button
            type="button"
            onClick={() => {
              createSnapshot('Контрольная точка (вручную)')
              refresh()
            }}
            className="cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Создать контрольную точку
          </button>
        }
      >
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted">Снимков пока нет. Создайте контрольную точку перед рискованными изменениями.</p>
        ) : (
          <div className="space-y-1.5">
            {snapshots.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ink">{s.label}</div>
                  <div className="text-xs text-muted">{dt(s.createdAt)} · {Object.keys(s.data).length} разделов</div>
                </div>
                <button type="button" onClick={() => onRestore(s.id)} className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-brand-300 hover:bg-brand-50">Восстановить</button>
                <button type="button" onClick={() => downloadSnapshot(s.id)} className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-ink">Скачать</button>
                <button type="button" onClick={() => { deleteSnapshot(s.id); refresh() }} className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs text-slate-400 hover:text-danger">Удалить</button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Хранится до 20 снимков; при запуске раз в сутки создаётся автоснимок. Перед откатом/импортом — авто-снимок «перед…».</p>
      </Card>

      {/* Экспорт/импорт */}
      <div className="mt-5">
        <Card title="Резервная копия">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={downloadBackup} className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50">
              Скачать полную копию (.json)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImport(f)
                e.target.value = ''
              }}
            />
            <select className={`${inputClass} max-w-[180px]`} value={importMode} onChange={(e) => setImportMode(e.target.value as 'replace' | 'merge')}>
              <option value="replace">Заменить всё</option>
              <option value="merge">Объединить</option>
            </select>
            <button type="button" onClick={() => fileRef.current?.click()} className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50">
              Загрузить из файла
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">Резервная копия включает все ИП, операции, документы, сотрудников, архив и налоговую (без DaData-токена).</p>
        </Card>
      </div>

      {/* Хранилище */}
      <div className="mt-5">
        <Card title="Хранилище">
          <div className="mb-2 text-sm text-ink">Занято: <span className="tnum font-medium">{kb(usage.bytes)}</span> в {usage.keys} разделах</div>
          <div className="space-y-0.5">
            {usage.items.slice(0, 10).map((it) => (
              <div key={it.key} className="flex justify-between text-xs text-muted">
                <span className="truncate">{it.key.replace('svoyakniga.', '')}</span>
                <span className="tnum">{kb(it.bytes)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Журнал */}
      <div className="mt-5">
        <Card
          title={`Журнал действий (${audit.length})`}
          right={
            audit.length > 0 ? (
              <button type="button" onClick={() => { if (window.confirm('Очистить журнал?')) { clearAudit(); refresh() } }} className="cursor-pointer text-sm text-slate-400 hover:text-danger">Очистить</button>
            ) : null
          }
        >
          {audit.length === 0 ? (
            <p className="text-sm text-muted">Журнал пуст. Здесь фиксируются снимки, откаты, импорт/экспорт.</p>
          ) : (
            <div className="max-h-72 space-y-0.5 overflow-auto">
              {audit.map((a) => (
                <div key={a.id} className="flex items-baseline gap-3 border-b border-line/50 py-1 text-sm">
                  <span className="tnum w-36 shrink-0 text-xs text-muted">{dt(a.at)}</span>
                  <span className="font-medium text-ink">{a.action}</span>
                  <span className="truncate text-muted">{a.detail}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Журнал фиксирует каждое действие: создание/изменение/удаление ИП, сотрудников, операций,
            документов, контрагентов и номенклатуры (с разбивкой по изменённым полям), а также снимки,
            откаты и бэкапы. Данные дублируются в IndexedDB — не теряются при очистке localStorage.
            Полная серверная база с синхронизацией — следующий этап (вместе с переносом на сервер).
          </p>
        </Card>
      </div>
    </div>
  )
}
