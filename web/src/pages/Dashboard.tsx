import { useState } from 'react'
import { Link } from 'react-router-dom'
import { compute } from '../lib/compute'
import { formatRub, formatDate } from '../lib/format'
import { useOrg } from '../state/orgStore'
import { useOps } from '../state/opsStore'
import { useDocs } from '../state/docsStore'
import { useArchive, archiveDocKindFromTitle } from '../state/archiveStore'
import { Card } from '../components/ui'
import { IconCheck, IconChevron, IconClock, IconSend } from '../components/icons'
import { TaskWizardModal, type TaskEvent } from '../components/TaskWizardModal'

const dec = (d: { toNumber: () => number } | null | undefined) =>
  formatRub(d == null ? null : d.toNumber())

const kindIcon = { payment: IconClock, notification: IconSend, report: IconCheck } as const

function startOfTodayMs(): number {
  const n = new Date()
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())
}

export function Dashboard() {
  const { activeOrg } = useOrg()
  const { ops } = useOps()
  const { docs } = useDocs()
  const { archivedKeys, addArchive } = useArchive()
  const o = activeOrg
  const [wizard, setWizard] = useState<TaskEvent | null>(null)

  let c: ReturnType<typeof compute> | null = null
  try {
    c = compute(o, ops)
  } catch {
    c = null
  }

  const today = startOfTodayMs()
  const taskKey = (e: { title: string; due: string }) => `${e.title}|${e.due}`
  const events = (c?.calendar ?? [])
    .filter((e) => !archivedKeys.has(taskKey(e)))
    .map((e) => {
      const days = Math.round((Date.parse(e.due) - today) / 86_400_000)
      return { ...e, days }
    })
  const past = events.filter((e) => e.days < 0)
  // Срочные (≤3 дн) → В этом месяце (≤31 дн) → Будущие (заблокированы до приближения срока).
  const urgent = events.filter((e) => e.days >= 0 && e.days <= 3)
  const thisMonth = events.filter((e) => e.days > 3 && e.days <= 31)
  const future = events.filter((e) => e.days > 31)

  type Ev = (typeof events)[number]
  const markDone = (e: Ev) =>
    addArchive({
      taskKey: taskKey(e),
      kind: e.kind,
      docKind: archiveDocKindFromTitle(e.title),
      title: e.title,
      period: String(o.year),
      dueDate: e.due,
      submittedAt: new Date().toISOString().slice(0, 10),
      amount: e.amount != null ? e.amount.toNumber() : null,
      // Снимок входных данных на момент сдачи — чтобы повторная печать показывала поданные цифры.
      snapshot: { org: o, ops, docs },
    })

  const TaskRow = ({ e, locked }: { e: Ev; locked?: boolean }) => {
    const Icon = kindIcon[e.kind]
    const soon = e.days <= 3
    const badge = soon ? 'bg-amber-50 text-warn' : 'bg-slate-100 text-muted'
    const dateText = e.windowStart
      ? `с ${formatDate(e.windowStart)} по ${formatDate(e.due)}`
      : formatDate(e.due)
    return (
      <div
        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
          locked
            ? 'border-line/60 opacity-60'
            : 'cursor-pointer border-line transition-colors hover:border-brand-300 hover:bg-slate-50'
        }`}
        role={locked ? undefined : 'button'}
        tabIndex={locked ? undefined : 0}
        onClick={locked ? undefined : () => setWizard(e)}
      >
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${badge}`}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-ink">{e.title}</div>
          <div className="text-xs text-muted">
            {dateText}
            {e.note ? ` · ${e.note}` : ''}
          </div>
        </div>
        {e.amount != null && (
          <span className="tnum whitespace-nowrap text-sm font-medium text-ink">{dec(e.amount)}</span>
        )}
        {locked ? (
          <span className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium text-slate-400">
            через {e.days} дн.
          </span>
        ) : (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation()
              markDone(e)
            }}
            className="shrink-0 cursor-pointer rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:border-ok hover:text-ok"
          >
            Сдано
          </button>
        )}
      </div>
    )
  }

  // Налоговая копилка: сколько откладывать с каждого поступления на налог + взносы.
  const obligation = c ? c.usn.tax_year_final.toNumber() + c.contr.total.toNumber() : 0
  const piggyIncome = c ? (c.quarterly ? c.byQuarter.reduce((s, q) => s + q.income, 0) : o.income) : 0
  const piggyPct = piggyIncome > 0 ? Math.round((obligation / piggyIncome) * 1000) / 10 : 0

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

      {c && obligation > 0 && (
        <div className="mb-6">
          <Card title="Налоговая копилка">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm text-muted">Откладывайте с каждого поступления</div>
                <div className="tnum mt-1 text-3xl font-semibold text-brand-600">{piggyPct}%</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted">К срокам уплаты накопится</div>
                <div className="tnum mt-1 text-2xl font-semibold text-ink">{formatRub(obligation)}</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">
              Налог УСН {dec(c.usn.tax_year_final)} + взносы {dec(c.contr.total)}. Откладывая{' '}
              {piggyPct}% с каждого прихода, к 28 апреля и 28 декабря деньги уже будут отложены — как
              «копилка» в Точке.
            </p>
          </Card>
        </div>
      )}

      {urgent.length > 0 && (
        <Card title="Срочные (в ближайшие дни)">
          <div className="space-y-1.5">
            {urgent.map((e) => (
              <TaskRow key={taskKey(e)} e={e} />
            ))}
          </div>
        </Card>
      )}

      <div className="mt-5">
        <Card
          title="В этом месяце"
          right={
            <Link to="/archive" className="text-sm font-medium text-brand-600 hover:underline">
              Архив сданного →
            </Link>
          }
        >
          <div className="space-y-1.5">
            {thisMonth.length === 0 && urgent.length === 0 && (
              <p className="text-sm text-muted">Нет задач в ближайший месяц.</p>
            )}
            {thisMonth.map((e) => (
              <TaskRow key={taskKey(e)} e={e} />
            ))}
          </div>
        </Card>
      </div>

      {future.length > 0 && (
        <div className="mt-5">
          <Card title="Будущие задачи">
            <p className="mb-2 text-xs text-muted">
              Видны заранее, но станут доступны ближе к сроку — «постепенно перемещаются» в актуальные.
            </p>
            <div className="space-y-1.5">
              {future.map((e) => (
                <TaskRow key={taskKey(e)} e={e} locked />
              ))}
            </div>
          </Card>
        </div>
      )}

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

      {wizard && <TaskWizardModal event={wizard} onClose={() => setWizard(null)} />}
    </div>
  )
}
