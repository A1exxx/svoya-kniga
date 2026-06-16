import { NavLink } from 'react-router-dom'
import {
  IconCalc,
  IconDoc,
  IconId,
  IconPackage,
  IconSettings,
  IconTasks,
  IconUsers,
  IconWallet,
} from './icons'

/** Навигация в духе Контур.Эльбы (левое вертикальное меню). */
export const NAV = [
  { to: '/', label: 'Задачи и отчётность', Icon: IconTasks, end: true },
  { to: '/taxes', label: 'Налоги', Icon: IconCalc },
  { to: '/money', label: 'Деньги', Icon: IconWallet, wip: true },
  { to: '/documents', label: 'Документы', Icon: IconDoc, wip: true },
  { to: '/contractors', label: 'Контрагенты', Icon: IconUsers, wip: true },
  { to: '/goods', label: 'Товары', Icon: IconPackage, wip: true },
  { to: '/employees', label: 'Сотрудники', Icon: IconId, wip: true },
  { to: '/settings', label: 'Реквизиты и настройки', Icon: IconSettings },
] as const

export function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-white">
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 font-semibold text-white">
          С
        </div>
        <span className="font-semibold text-ink">СвояКнига</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-auto px-2 py-3">
        {NAV.map(({ to, label, Icon, ...rest }) => {
          const wip = 'wip' in rest && rest.wip
          const end = 'end' in rest && rest.end
          return (
            <NavLink
              key={to}
              to={to}
              end={Boolean(end)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-50 font-medium text-brand-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-ink'
                }`
              }
            >
              <Icon size={20} className="shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {wip && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warn">
                  скоро
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-line p-3">
        <button
          type="button"
          className="w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-100"
        >
          <div className="font-medium text-ink">ИП Демонстрация</div>
          <div className="text-muted">УСН «Доходы» • демо-режим</div>
        </button>
      </div>
    </aside>
  )
}
