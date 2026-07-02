import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../state/orgStore'
import type { Operation } from '../state/opsStore'
import type { Doc } from '../state/docsStore'
import type { Employee } from '../state/employeesStore'
import { compute } from '../lib/compute'
import { formatRub, formatDate } from '../lib/format'
import { orgDisplayName, requisitesComplete } from '../lib/orgDisplay'
import { auditClient, type AuditIssue } from '../lib/clientAudit'
import { ensNotificationXml, ensFileName } from '../lib/ensXml'
import { downloadText } from '../lib/download'
import { Card, Note, inputClass } from '../components/ui'

/**
 * Обзор клиентов — сводная панель по ВСЕМ ИП сразу (режим обслуживающей
 * бухгалтерии): у кого что горит, ближайшие сроки, налоги, авто-аудит учёта,
 * ответственный бухгалтер и массовые операции. Аналога нет даже в Эльбе.
 *
 * Читает данные всех ИП напрямую из localStorage (те же ключи, что сторы) —
 * экран read-only по операциям, пересчитывается при открытии.
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
  assignee: string
  complete: boolean
  taxYear: number | null
  contrib: number | null
  overdue: number
  urgent: number
  next: { title: string; due: string; days: number } | null
  audit: AuditIssue[]
  error: boolean
}

export function Clients() {
  const { orgs, setActiveOrgId, activeOrgId, updateOrg } = useOrg()
  const navigate = useNavigate()
  const [auditFor, setAuditFor] = useState<ClientRow | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [massMsg, setMassMsg] = useState<string | null>(null)

  const rows: ClientRow[] = useMemo(() => {
    const allOps = readStore<Operation>('svoyakniga.ops.v1')
    const allDocs = readStore<Doc>('svoyakniga.docs.v1')
    const allEmps = readStore<Employee>('svoyakniga.employees.v1')
    const allArchive = readStore<{ taskKey: string }>('svoyakniga.archive.v1')
    const today = startOfTodayMs()
    return orgs.map((o) => {
      const ops = allOps[o.id] ?? []
      const docs = allDocs[o.id] ?? []
      const emps = allEmps[o.id] ?? []
      const archived = new Set((allArchive[o.id] ?? []).map((r) => r.taskKey))
      const audit = auditClient(o, ops, docs, emps)
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
          assignee: o.assignee || '',
          complete: requisitesComplete(o),
          taxYear: c.usn.tax_year_final.toNumber(),
          contrib: c.contr.total.toNumber(),
          overdue,
          urgent,
          next: next ? { title: next.title, due: next.due, days: next.days } : null,
          audit,
          error: false,
        }
      } catch {
        return {
          id: o.id, name: orgDisplayName(o), inn: o.inn, assignee: o.assignee || '',
          complete: requisitesComplete(o), taxYear: null, contrib: null,
          overdue: 0, urgent: 0, next: null, audit, error: true,
        }
      }
    })
    // Сначала проблемные: просрочки → срочные → ошибки аудита → остальные.
    .sort(
      (a, b) =>
        b.overdue - a.overdue ||
        b.urgent - a.urgent ||
        b.audit.filter((i) => i.level === 'error').length - a.audit.filter((i) => i.level === 'error').length ||
        a.name.localeCompare(b.name, 'ru')
    )
  }, [orgs])

  const assignees = [...new Set(rows.map((r) => r.assignee).filter(Boolean))].sort()
  const view = assigneeFilter ? rows.filter((r) => r.assignee === assigneeFilter) : rows

  const open = (id: string, to = '/') => {
    setActiveOrgId(id)
    navigate(to)
  }

  // Массовая операция: уведомления ЕНС (авансы УСН) по всем клиентам с поквартальными данными.
  const massEnsNotifications = () => {
    const allOps = readStore<Operation>('svoyakniga.ops.v1')
    let done = 0
    const skipped: string[] = []
    for (const o of orgs) {
      try {
        const c = compute(o, allOps[o.id] ?? [])
        const hasAdvances = c.calendar.some(
          (e) => e.kind === 'notification' && e.title.includes('аванс') && e.amount != null
        )
        if (!hasAdvances) {
          skipped.push(orgDisplayName(o))
          continue
        }
        downloadText(ensFileName(o), ensNotificationXml(o, c), 'application/xml;charset=utf-8')
        done++
      } catch {
        skipped.push(orgDisplayName(o))
      }
    }
    setMassMsg(
      `Сформировано XML-уведомлений: ${done}.` +
        (skipped.length
          ? ` Пропущены (нет поквартальных авансов — заполните операции по датам): ${skipped.join(', ')}.`
          : '')
    )
  }

  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0)
  const totalUrgent = rows.reduce((s, r) => s + r.urgent, 0)
  const totalAuditErr = rows.reduce((s, r) => s + r.audit.filter((i) => i.level === 'error').length, 0)

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Обзор клиентов</h1>
          <p className="mt-1 text-sm text-muted">
            Все ИП кабинета одним взглядом: просрочки, ближайшие сроки, налоги, аудит учёта. Клик по
            строке — переключиться на клиента.
          </p>
        </div>
        <button
          type="button"
          onClick={massEnsNotifications}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
          title="Скачать XML уведомлений об исчисленных авансах УСН по каждому клиенту"
        >
          Уведомления ЕНС по всем клиентам
        </button>
      </header>

      {massMsg && (
        <div className="mb-4 rounded-lg bg-brand-50 px-4 py-2.5 text-sm text-ink">{massMsg}</div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-4">
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
        <Card>
          <div className="text-sm text-muted">Ошибок аудита</div>
          <div className={`mt-1 text-2xl font-semibold ${totalAuditErr > 0 ? 'text-danger' : 'text-ok'}`}>
            {totalAuditErr}
          </div>
        </Card>
      </div>

      <Card
        title="Клиенты"
        right={
          assignees.length > 0 ? (
            <select
              className={`${inputClass} max-w-[220px] text-sm`}
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              title="Фильтр по ответственному бухгалтеру"
            >
              <option value="">Все ответственные</option>
              {assignees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          ) : undefined
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Клиент</th>
                <th className="py-2 pr-3 font-medium">Статус</th>
                <th className="py-2 pr-3 font-medium">Аудит</th>
                <th className="py-2 pr-3 font-medium">Ближайшая задача</th>
                <th className="py-2 pr-3 text-right font-medium">Налог УСН (год)</th>
                <th className="py-2 pr-3 font-medium">Ответственный</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => {
                const errN = r.audit.filter((i) => i.level === 'error').length
                const warnN = r.audit.length - errN
                return (
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
                    <td className="py-2.5 pr-3">
                      {r.audit.length === 0 ? (
                        <span className="text-xs text-ok">✓ чисто</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setAuditFor(r)
                          }}
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            errN > 0 ? 'bg-red-50 text-danger' : 'bg-amber-50 text-warn'
                          }`}
                          title="Показать проблемы учёта"
                        >
                          {errN > 0 ? `${errN} ошиб.` : ''}
                          {errN > 0 && warnN > 0 ? ' + ' : ''}
                          {warnN > 0 ? `${warnN} предупр.` : ''}
                        </button>
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
                    <td className="py-2.5 pr-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="w-32 rounded border border-line px-2 py-1 text-xs"
                        placeholder="бухгалтер"
                        value={r.assignee}
                        onChange={(e) => updateOrg(r.id, { assignee: e.target.value })}
                        title="Ответственный бухгалтер по клиенту"
                      />
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
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5">
        <Note>
          Сводка и аудит пересчитываются при открытии экрана. «Аудит» находит типовые проблемы
          (пустые реквизиты, сотрудники без СНИЛС, разрывы нумерации счетов, доход выше порога НДС) —
          кликните по бейджу, чтобы увидеть список. Ответственный бухгалтер — свободное поле, по нему
          работает фильтр справа сверху.
        </Note>
      </div>

      {auditFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Аудит учёта"
          onClick={() => setAuditFor(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold text-ink">Аудит учёта — {auditFor.name}</h2>
            <p className="mb-4 text-sm text-muted">
              Что стоит поправить, чтобы отчётность собралась без ошибок.
            </p>
            <div className="space-y-1.5">
              {auditFor.audit.map((i, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    i.level === 'error' ? 'bg-red-50 text-danger' : 'bg-amber-50 text-warn'
                  }`}
                >
                  {i.level === 'error' ? '⛔ ' : '⚠ '}
                  {i.text}
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-between">
              <button
                type="button"
                onClick={() => {
                  setAuditFor(null)
                  open(auditFor.id, '/requisites')
                }}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Открыть клиента
              </button>
              <button
                type="button"
                onClick={() => setAuditFor(null)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50"
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
