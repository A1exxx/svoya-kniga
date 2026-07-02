import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../state/orgStore'
import type { Operation } from '../state/opsStore'
import { compute } from '../lib/compute'
import { formatRub, formatDate } from '../lib/format'
import { orgDisplayName, requisitesComplete } from '../lib/orgDisplay'
import { Card, Note } from '../components/ui'

/**
 * Обзор клиентов — сводная панель по ВСЕМ ИП сразу (режим обслуживающей
 * бухгалтерии): у кого что горит, ближайшие сроки, налоги за год. Такой
 * сводки нет даже в Эльбе (там задачи клиентов свалены в один список) —
 * это наша киллер-фича по итогам конкурентного анализа.
 *
 * Читает операции/архив всех ИП напрямую из localStorage (те же ключи, что
 * сторы) — экран read-only, пересчитывается при открытии.
 */

function readStore<T>(key: string): Record<string, T[]> {
  try {
    return (JSON.parse(localStorage.getItem(key) || '{}') as Record<string, T[]>) || {}
  } catch {
    return {}
  }
}

function startOfTodayMs(): number {
  const n = new Date()
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())
}

interface ClientRow {
  id: string
  name: string
  inn: string
  complete: boolean
  taxYear: number | null
  contrib: number | null
  overdue: number
  urgent: number
  next: { title: string; due: string; days: number } | null
  error: boolean
}

export function Clients() {
  const { orgs, setActiveOrgId, activeOrgId } = useOrg()
  const navigate = useNavigate()

  const rows: ClientRow[] = useMemo(() => {
    const allOps = readStore<Operation>('svoyakniga.ops.v1')
    const allArchive = readStore<{ taskKey: string }>('svoyakniga.archive.v1')
    const today = startOfTodayMs()
    return orgs.map((o) => {
      const ops = allOps[o.id] ?? []
      const archived = new Set((allArchive[o.id] ?? []).map((r) => r.taskKey))
      try {
        const c = compute(o, ops)
        const events = c.calendar
          .filter((e) => !archived.has(`${e.title}|${e.due}`))
          .map((e) => ({ ...e, days: Math.round((Date.parse(e.due) - today) / 86_400_000) }))
        const overdue = events.filter((e) => e.days < 0).length
        const urgent = events.filter((e) => e.days >= 0 && e.days <= 3).length
        const next = events.filter((e) => e.days >= 0).sort((a, b) => a.days - b.days)[0] ?? null
        return {
          id: o.id,
          name: orgDisplayName(o),
          inn: o.inn,
          complete: requisitesComplete(o),
          taxYear: c.usn.tax_year_final.toNumber(),
          contrib: c.contr.total.toNumber(),
          overdue,
          urgent,
          next: next ? { title: next.title, due: next.due, days: next.days } : null,
          error: false,
        }
      } catch {
        return {
          id: o.id,
          name: orgDisplayName(o),
          inn: o.inn,
          complete: requisitesComplete(o),
          taxYear: null,
          contrib: null,
          overdue: 0,
          urgent: 0,
          next: null,
          error: true,
        }
      }
    })
    // Сначала проблемные: просрочки → срочные → остальные.
    .sort((a, b) => b.overdue - a.overdue || b.urgent - a.urgent || a.name.localeCompare(b.name, 'ru'))
  }, [orgs])

  const open = (id: string, to = '/') => {
    setActiveOrgId(id)
    navigate(to)
  }

  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0)
  const totalUrgent = rows.reduce((s, r) => s + r.urgent, 0)

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Обзор клиентов</h1>
        <p className="mt-1 text-sm text-muted">
          Все ИП кабинета одним взглядом: просрочки, ближайшие сроки, налоги. Клик по строке —
          переключиться на клиента.
        </p>
      </header>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm text-muted">Клиентов (ИП)</div>
          <div className="mt-1 text-2xl font-semibold text-ink">{rows.length}</div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Просроченных задач</div>
          <div className={`mt-1 text-2xl font-semibold ${totalOverdue > 0 ? 'text-danger' : 'text-ok'}`}>
            {totalOverdue}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Срочных (≤ 3 дней)</div>
          <div className={`mt-1 text-2xl font-semibold ${totalUrgent > 0 ? 'text-warn' : 'text-ok'}`}>
            {totalUrgent}
          </div>
        </Card>
      </div>

      <Card title="Клиенты">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Клиент</th>
                <th className="py-2 pr-3 font-medium">Статус</th>
                <th className="py-2 pr-3 font-medium">Ближайшая задача</th>
                <th className="py-2 pr-3 text-right font-medium">Налог УСН (год)</th>
                <th className="py-2 pr-3 text-right font-medium">Взносы</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`cursor-pointer border-b border-line/60 align-top transition-colors hover:bg-slate-50 ${
                    r.id === activeOrgId ? 'bg-brand-50/40' : ''
                  }`}
                  onClick={() => open(r.id)}
                >
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-ink">{r.name}</div>
                    <div className="text-xs text-muted">
                      {r.inn ? `ИНН ${r.inn}` : 'ИНН не указан'}
                      {!r.complete && <span className="ml-2 text-warn">реквизиты не заполнены</span>}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    {r.error ? (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-danger">
                        ошибка расчёта
                      </span>
                    ) : r.overdue > 0 ? (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-danger">
                        просрочено: {r.overdue}
                      </span>
                    ) : r.urgent > 0 ? (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-warn">
                        срочных: {r.urgent}
                      </span>
                    ) : (
                      <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-ok">
                        всё в срок
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-xs">
                    {r.next ? (
                      <>
                        <div className="text-ink">{r.next.title}</div>
                        <div className="text-muted">
                          {formatDate(r.next.due)}
                          {r.next.days === 0 ? ' (сегодня)' : r.next.days === 1 ? ' (завтра)' : ` (через ${r.next.days} дн.)`}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="tnum py-2.5 pr-3 text-right font-medium text-ink">
                    {r.taxYear == null ? '—' : formatRub(r.taxYear)}
                  </td>
                  <td className="tnum py-2.5 pr-3 text-right text-ink">
                    {r.contrib == null ? '—' : formatRub(r.contrib)}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex justify-end gap-2 text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          open(r.id, '/')
                        }}
                        className="text-brand-600 hover:underline"
                      >
                        задачи
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          open(r.id, '/money')
                        }}
                        className="text-brand-600 hover:underline"
                      >
                        деньги
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          open(r.id, '/requisites')
                        }}
                        className="text-brand-600 hover:underline"
                      >
                        реквизиты
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5">
        <Note>
          Сводка пересчитывается при открытии экрана из данных всех ИП. Новый клиент — кнопка
          «Добавить ИП» слева внизу. Для командной работы над кабинетом (несколько бухгалтеров,
          роли) — блок «Команда» в облачном режиме.
        </Note>
      </div>
    </div>
  )
}
