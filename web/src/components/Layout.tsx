import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { IconHelp, IconMenu } from './icons'
import { Sidebar } from './Sidebar'

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className="flex h-full">
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

      {/* Кнопка поддержки в правом нижнем углу — как у Эльбы */}
      <button
        type="button"
        aria-label="Помощь и поддержка"
        title="Помощь"
        onClick={() => setHelpOpen(true)}
        className="fixed bottom-5 right-5 z-20 grid h-11 w-11 place-items-center rounded-full bg-ink text-white shadow-card transition-colors hover:bg-slate-700"
      >
        <IconHelp size={22} />
      </button>

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-ink">Помощь</h2>
            <p className="mt-2 text-sm text-slate-700">
              «СвояКнига» — онлайн-бухгалтерия для ИП на УСН. Все расчёты прозрачны: на каждом
              экране видно, как получилась сумма, а в «Настройках» — какие параметры и из какой
              статьи НК РФ взяты. Данные сохраняются в этом браузере.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
              <li>• <b>Налоги</b> — расчёт УСН, взносов, НДС и сроков.</li>
              <li>• <b>Отчётность</b> — все декларации и отчёты в одном месте.</li>
              <li>• <b>Деньги</b> — операции и КУДиР (можно загрузить выписку банка).</li>
              <li>• <b>Реквизиты</b> и <b>Настройки</b> — данные ИП и параметры налогов по годам.</li>
            </ul>
            <p className="mt-3 text-xs text-muted">
              Корректность сумм перед сдачей подтверждает бухгалтер. Подпись КЭП и отправка — пока
              в демо-режиме.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
