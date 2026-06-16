import { Link } from 'react-router-dom'
import { compute } from '../lib/compute'
import { formatRub, formatDate } from '../lib/format'
import { useOrg } from '../state/orgStore'
import { Card } from '../components/ui'
import { IconCheck, IconChevron, IconClock, IconSend } from '../components/icons'

const dec = (d: { toNumber: () => number } | null | undefined) =>
  formatRub(d == null ? null : d.toNumber())

const kindIcon = { payment: IconClock, notification: IconSend, report: IconCheck } as const

function startOfTodayMs(): number {
  const n = new Date()
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())
}

export function Dashboard() {
  const { activeOrg } = useOrg()
  const o = activeOrg

  let c: ReturnType<typeof compute> | null = null
  try {
    c = compute(o)
  } catch {
    c = null
  }

  const today = startOfTodayMs()
  const events = (c?.calendar ?? []).map((e) => {
    const days = Math.round((Date.parse(e.due) - today) / 86_400_000)
    return { ...e, days }
  })
  const upcoming = events.filter((e) => e.days >= 0)
  const past = events.filter((e) => e.days < 0)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{o.name}</div>
          <h1 className="text-2xl font-semibold text-ink">Задачи и отчётность</h1>
          <p className="mt-1 text-sm text-muted">
            Что и когда заплатить и сдать. Данные берутся из расчёта на экране «Налоги».
          </p>
        </div>
        <Link
          to="/taxes"
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Открыть расчёт
          <IconChevron size={16} />
        </Link>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm text-muted">Налог УСН за {o.year}</div>
          <div className="tnum mt-1 text-2xl font-semibold text-ink">{dec(c?.usn.tax_year_final)}</div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Страховые взносы</div>
          <div className="tnum mt-1 text-2xl font-semibold text-brand-600">{dec(c?.contr.total)}</div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Режим</div>
          <div className="mt-1 text-lg font-semibold text-ink">
            {o.usnObject === 'income' ? 'УСН «Доходы» 6%' : 'УСН «Д − Р» 15%'}
          </div>
          <div className="text-xs text-muted">{o.hasEmployees ? 'с работниками' : 'без работников'}</div>
        </Card>
      </div>

      <Card title="Актуальные задачи">
        <div className="space-y-1.5">
          {upcoming.length === 0 && <p className="text-sm text-muted">Нет предстоящих задач.</p>}
          {upcoming.map((e, i) => {
            const Icon = kindIcon[e.kind]
            const soon = e.days <= 14
            const badge = soon ? 'bg-amber-50 text-warn' : 'bg-slate-100 text-muted'
            const badgeText = soon ? `через ${e.days} дн.` : formatDate(e.due)
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 transition-colors hover:bg-slate-50"
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${badge}`}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{e.title}</div>
                  <div className="text-xs text-muted">
                    {formatDate(e.due)}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                {e.amount != null && (
                  <span className="tnum whitespace-nowrap text-sm font-medium text-ink">{dec(e.amount)}</span>
                )}
                <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${badge}`}>
                  {badgeText}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {past.length > 0 && (
        <div className="mt-5">
          <Card title="Прошедшие сроки">
            <div className="space-y-1">
              {past.map((e, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-1.5 text-sm text-muted">
                  <span className="tnum w-20 shrink-0 text-xs">{formatDate(e.due)}</span>
                  <span className="flex-1 truncate">{e.title}</span>
                  <span className="tnum">{dec(e.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
