import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useOrg } from '../state/orgStore'
import { orgDisplayName, requisitesComplete } from '../lib/orgDisplay'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import {
  IconBuilding,
  IconAlert,
  IconCalc,
  IconCard,
  IconCheck,
  IconDoc,
  IconId,
  IconInfo,
  IconPackage,
  IconPatent,
  IconPlus,
  IconReport,
  IconSend,
  IconSettings,
  IconTasks,
  IconUsers,
  IconWallet,
} from './icons'

/** Навигация в духе Контур.Эльбы (левое вертикальное меню). */
export const NAV = [
  { to: '/', label: 'Задачи и отчётность', Icon: IconTasks, end: true },
  { to: '/archive', label: 'Архив', Icon: IconCheck },
  { to: '/taxes', label: 'Налоги', Icon: IconCalc },
  { to: '/reports', label: 'Отчётность', Icon: IconReport },
  { to: '/tax-office', label: 'Налоговая', Icon: IconSend },
  { to: '/patent', label: 'Патент', Icon: IconPatent },
  { to: '/money', label: 'Деньги', Icon: IconWallet },
  { to: '/payments', label: 'Платёжки', Icon: IconCard },
  { to: '/documents', label: 'Документы', Icon: IconDoc },
  { to: '/useful-docs', label: 'Полезные документы', Icon: IconInfo },
  { to: '/contractors', label: 'Контрагенты', Icon: IconUsers },
  { to: '/goods', label: 'Товары', Icon: IconPackage },
  { to: '/employees', label: 'Сотрудники', Icon: IconId },
  { to: '/requisites', label: 'Реквизиты', Icon: IconBuilding },
  { to: '/settings', label: 'Настройки', Icon: IconSettings },
  { to: '/admin', label: 'Администрирование', Icon: IconAlert },
] as const

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { orgs, activeOrgId, setActiveOrgId, addOrg } = useOrg()
  const navigate = useNavigate()

  // Добавить ИП и СРАЗУ открыть Реквизиты — куда вносить данные (иначе непонятно, что дальше).
  const onAddOrg = () => {
    addOrg()
    onNavigate?.()
    navigate('/requisites')
  }

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
          const end = 'end' in rest && rest.end
          return (
            <NavLink
              key={to}
              to={to}
              end={Boolean(end)}
              onClick={onNavigate}
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
            </NavLink>
          )
        })}
      </nav>

      {/* Переключатель организаций (твои ИП) — видимый список с подсветкой активного */}
      <div className="space-y-2 border-t border-line p-3">
        <span className="block px-1 text-[11px] uppercase tracking-wide text-muted">
          Мои ИП {orgs.length > 1 && <span className="text-slate-400">({orgs.length})</span>}
        </span>
        <div className="max-h-48 space-y-0.5 overflow-auto">
          {orgs.map((o) => {
            const active = o.id === activeOrgId
            const complete = requisitesComplete(o)
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setActiveOrgId(o.id)
                  onNavigate?.()
                }}
                title={complete ? 'Реквизиты заполнены' : 'Реквизиты заполнены не полностью'}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-ink'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${active ? 'font-medium' : ''}`}>
                    {orgDisplayName(o)}
                  </span>
                  {o.inn && <span className="block truncate text-[11px] text-muted">ИНН {o.inn}</span>}
                </span>
                <span
                  className={`shrink-0 text-xs ${complete ? 'text-ok' : 'text-slate-300'}`}
                  aria-hidden
                >
                  {complete ? '✓' : '•'}
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onAddOrg}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand-300 hover:text-brand-600"
        >
          <IconPlus size={14} />
          Добавить ИП
        </button>
        <ThemeToggle />
      </div>
    </aside>
  )
}

function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>(getTheme())
  const pick = (t: Theme) => {
    setTheme(t)
    setLocal(t)
  }
  const opts: [Theme, string][] = [
    ['light', 'Свет'],
    ['dark', 'Тьма'],
    ['system', 'Авто'],
  ]
  return (
    <div className="mt-1 inline-flex w-full rounded-lg border border-line p-0.5">
      {opts.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => pick(val)}
          className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
            theme === val ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
