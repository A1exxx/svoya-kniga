import { NavLink } from 'react-router-dom'
import { useOrg } from '../state/orgStore'
import {
  IconBuilding,
  IconCalc,
  IconDoc,
  IconId,
  IconPackage,
  IconPlus,
  IconSettings,
  IconTasks,
  IconUsers,
  IconWallet,
} from './icons'

/** Навигация в духе Контур.Эльбы (левое вертикальное меню). */
export const NAV = [
  { to: '/', label: 'Задачи и отчётность', Icon: IconTasks, end: true },
  { to: '/taxes', label: 'Налоги', Icon: IconCalc },
  { to: '/money', label: 'Деньги', Icon: IconWallet },
  { to: '/documents', label: 'Документы', Icon: IconDoc },
  { to: '/contractors', label: 'Контрагенты', Icon: IconUsers, wip: true },
  { to: '/goods', label: 'Товары', Icon: IconPackage, wip: true },
  { to: '/employees', label: 'Сотрудники', Icon: IconId },
  { to: '/requisites', label: 'Реквизиты', Icon: IconBuilding },
  { to: '/settings', label: 'Настройки', Icon: IconSettings },
] as const

export function Sidebar() {
  const { orgs, activeOrgId, setActiveOrgId, addOrg } = useOrg()

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

      {/* Переключатель организаций (твои ИП) */}
      <div className="space-y-2 border-t border-line p-3">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Организация</span>
          <select
            className="w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            value={activeOrgId}
            onChange={(e) => setActiveOrgId(e.target.value)}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name || 'Без названия'}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={addOrg}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand-300 hover:text-brand-600"
        >
          <IconPlus size={14} />
          Добавить ИП
        </button>
      </div>
    </aside>
  )
}
