import { Suspense, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { IconHelp, IconMenu } from './icons'
import { Sidebar } from './Sidebar'
import { useCloud } from '../state/authStore'

export function Layout() {
  const navigate = useNavigate()
  const { role } = useCloud()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [storageFull, setStorageFull] = useState(false)

  // Хранилище браузера переполнено — данные критичны, предупреждаем явно (не молча).
  useEffect(() => {
    const onErr = () => setStorageFull(true)
    window.addEventListener('svk:storage-error', onErr)
    return () => window.removeEventListener('svk:storage-error', onErr)
  }, [])

  return (
    <div className="flex h-full">
      {role === 'viewer' && (
        <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
          Кабинет открыт в режиме «только просмотр» — изменения не сохраняются на сервер.
        </div>
      )}
      {storageFull && (
        <div className="fixed inset-x-0 top-0 z-50 bg-red-600 px-4 py-2 text-center text-sm text-white">
          Хранилище браузера переполнено — последние данные могли не сохраниться. Откройте
          «Администрирование» и выгрузите резервную копию, затем удалите старые снимки.
          <button
            type="button"
            onClick={() => setStorageFull(false)}
            className="ml-3 underline"
          >
            скрыть
          </button>
        </div>
      )}
      {/* Боковое меню: на десктопе статично, на узких экранах — выезжающая панель */}
      <div
        className={`fixed inset-y-0 left-0 z-40 h-full transform transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </div>

      {/* Затемнение под выехавшим меню (только мобильные) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Верхняя панель с гамбургером — только на узких экранах */}
        <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Открыть меню"
            className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink transition-colors hover:bg-slate-50"
          >
            <IconMenu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-md bg-brand-600 text-sm font-semibold text-white">
              С
            </div>
            <span className="font-semibold text-ink">СвояКнига</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Suspense fallback={<div className="px-6 py-8 text-sm text-muted">Загрузка…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Кнопка помощи в правом нижнем углу — ведёт на экран «Помощь» с поиском */}
      <button
        type="button"
        aria-label="Помощь и о программе"
        title="Помощь"
        onClick={() => navigate('/help')}
        className="fixed bottom-5 right-5 z-20 grid h-11 w-11 place-items-center rounded-full bg-ink text-white shadow-card transition-colors hover:bg-slate-700"
      >
        <IconHelp size={22} />
      </button>
    </div>
  )
}
