import { Outlet } from 'react-router-dom'
import { IconHelp } from './icons'
import { Sidebar } from './Sidebar'

export function Layout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Кнопка поддержки в правом нижнем углу — как у Эльбы */}
      <button
        type="button"
        aria-label="Помощь и поддержка"
        title="Помощь"
        className="fixed bottom-5 right-5 grid h-11 w-11 place-items-center rounded-full bg-ink text-white shadow-card transition-colors hover:bg-slate-700"
      >
        <IconHelp size={22} />
      </button>
    </div>
  )
}
