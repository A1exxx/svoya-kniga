import { useRef, useState } from 'react'
import { useOrg } from '../state/orgStore'
import { useOps, type Operation } from '../state/opsStore'
import { useDocs, docTotals } from '../state/docsStore'
import { usePayments } from '../state/paymentsStore'
import { formatRub, formatDate } from '../lib/format'
import { Card, Field, Note, inputClass } from '../components/ui'
import { IconPlus } from '../components/icons'
import { PrintModal } from '../components/PrintModal'
import { KudirDoc } from '../components/KudirDoc'
import { parse1CClientBankExchange, readBankStatement } from '../lib/bankImport'
import { downloadCsv } from '../lib/download'
import { getAutomationSettings } from '../lib/automation/settings'
import { suggestForCounterparty } from '../lib/automation/categorize'
import { computeInsights } from '../lib/automation/insights'

const today = () => new Date().toISOString().slice(0, 10)

type Draft = Omit<Operation, 'id'>
const emptyDraft = (): Draft => ({
  date: today(),
  kind: 'income',
  amount: 0,
  counterparty: '',
  doc: '',
  note: '',
  taxable: true,
})

export function Money() {
  const { activeOrg, updateActiveOrg } = useOrg()
  const { ops, addOp, removeOp, updateOp } = useOps()
  const { docs, updateDoc } = useDocs()
  const { payments, updatePayment } = usePayments()
  const [draft, setDraft] = useState<Draft>(emptyDraft())

  // Удаление операции, связанной со счётом/платёжкой, должно снять у них статус «Оплачен»
  // и сбросить linkedOpId — иначе документ навсегда залипает «Оплачен» с битой ссылкой.
  const removeOpCascade = (opId: string) => {
    const d = docs.find((x) => x.linkedOpId === opId)
    if (d) updateDoc(d.id, { paymentStatus: 'unpaid', paidDate: undefined, linkedOpId: undefined })
    const p = payments.find((x) => x.linkedOpId === opId)
    if (p) updatePayment(p.id, { status: 'pending', paidDate: '', linkedOpId: undefined })
    removeOp(opId)
  }
  const [printKudir, setPrintKudir] = useState(false)
  const [applied, setApplied] = useState(false)

  // Фильтр по периоду для таблицы операций: весь год / квартал / месяц.
  const now = new Date()
  const [periodMode, setPeriodMode] = useState<'year' | 'quarter' | 'month'>('year')
  const [periodQuarter, setPeriodQuarter] = useState(Math.floor(now.getMonth() / 3) + 1) // 1..4
  const [periodMonth, setPeriodMonth] = useState(now.getMonth()) // 0..11

  // Редактирование операции (модалка со всеми полями).
  const [editDraft, setEditDraft] = useState<Operation | null>(null)

  const yearOps = ops
    .filter((o) => o.date.startsWith(String(activeOrg.year)))
    .sort((a, b) => b.date.localeCompare(a.date))

  let income = 0
  let expense = 0
  for (const o of yearOps) {
    if (!o.taxable) continue
    if (o.kind === 'income') income += o.amount
    else expense += o.amount
  }

  // P&L: доход/расход/прибыль по всем операциям (управленческий вид), помесячно.
  const monthly = Array.from({ length: 12 }, () => ({ inc: 0, exp: 0 }))
  let pnlInc = 0
  let pnlExp = 0
  for (const o of yearOps) {
    const m = Number(o.date.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue
    if (o.kind === 'income') {
      monthly[m].inc += o.amount
      pnlInc += o.amount
    } else {
      monthly[m].exp += o.amount
      pnlExp += o.amount
    }
  }
  const pnlProfit = pnlInc - pnlExp
  const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

  const exportPnl = () => {
    const rows = monthly
      .map((mm, i) => [MONTHS[i], mm.inc, mm.exp, mm.inc - mm.exp])
      .filter((row) => Number(row[1]) !== 0 || Number(row[2]) !== 0)
    rows.push(['Итого', pnlInc, pnlExp, pnlProfit])
    downloadCsv(`PnL_${activeOrg.year}.csv`, ['Месяц', 'Доход', 'Расход', 'Прибыль'], rows)
  }

  // Операции под выбранный период (для таблицы и её итогов).
  const viewOps = yearOps.filter((o) => {
    if (periodMode === 'year') return true
    const m = Number(o.date.slice(5, 7)) - 1
    if (periodMode === 'month') return m === periodMonth
    return Math.floor(m / 3) + 1 === periodQuarter
  })
  let viewInc = 0
  let viewExp = 0
  for (const o of viewOps) {
    if (o.kind === 'income') viewInc += o.amount
    else viewExp += o.amount
  }
  const periodLabel =
    periodMode === 'year'
      ? `за ${activeOrg.year} год`
      : periodMode === 'quarter'
        ? `за ${periodQuarter} квартал ${activeOrg.year}`
        : `за ${MONTHS[periodMonth]} ${activeOrg.year}`

  const saveEdit = () => {
    if (!editDraft) return
    const { id, ...patch } = editDraft
    updateOp(id, patch)
    setEditDraft(null)
  }

  // Автоматизация (полуавтомат, по умолчанию выключена — тумблеры в «Настройках»).
  const auto = getAutomationSettings()
  const suggestion = auto.autofill ? suggestForCounterparty(ops, draft.counterparty) : null
  const insights = auto.insights ? computeInsights(yearOps, docs, activeOrg) : []
  const applySuggestion = () => {
    if (!suggestion) return
    setDraft((d) => ({
      ...d,
      taxable: suggestion.taxable,
      note: suggestion.note ?? d.note,
      kind: suggestion.kind ?? d.kind,
    }))
  }

  const add = () => {
    if (draft.amount <= 0) return
    addOp(draft)
    setDraft({ ...emptyDraft(), kind: draft.kind })
    setApplied(false)
  }

  const applyToTaxes = () => {
    updateActiveOrg({ income, expenses: expense })
    setApplied(true)
  }

  const exportCsv = () => {
    const rows = yearOps.map((o) => [
      formatDate(o.date),
      o.kind === 'income' ? 'Приход' : 'Расход',
      o.amount,
      o.counterparty,
      o.doc,
      o.note,
      o.taxable ? 'да' : 'нет',
    ])
    downloadCsv(
      `Операции_${activeOrg.year}.csv`,
      ['Дата', 'Тип', 'Сумма', 'Контрагент', 'Документ', 'Описание', 'В налоге'],
      rows
    )
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const onImportFile = async (file: File) => {
    try {
      const text = await readBankStatement(file)
      const { ops: drafts, errors } = parse1CClientBankExchange(text, activeOrg.bankAccount)
      if (errors.length) {
        setImportMsg(errors.join(' '))
        return
      }
      // Авто-привязка приходов к неоплаченным исходящим счетам: по сумме И контрагенту.
      // Если на одну сумму несколько счетов и контрагент не разрешает однозначно — НЕ привязываем
      // (чтобы не пометить оплаченным чужой счёт), а сообщаем «отметьте вручную».
      const unpaid = docs.filter(
        (x) => x.direction === 'outgoing' && x.type === 'invoice' && x.paymentStatus !== 'paid' && !x.linkedOpId
      )
      const norm = (s: string) => (s || '').toLowerCase().replace(/["'«».,]/g, '').replace(/\s+/g, ' ').trim()
      const used = new Set<string>()
      let matched = 0
      let ambiguous = 0
      drafts.forEach((d) => {
        const opId = addOp(d)
        if (d.kind !== 'income') return
        const byAmount = unpaid.filter((x) => !used.has(x.id) && Math.abs(docTotals(x).subtotal - d.amount) < 0.01)
        if (byAmount.length === 0) return
        let pick: (typeof unpaid)[number] | undefined
        if (byAmount.length === 1) {
          pick = byAmount[0]
        } else {
          const dp = norm(d.counterparty)
          const byParty = dp
            ? byAmount.filter((x) => norm(x.buyer).includes(dp) || dp.includes(norm(x.buyer)))
            : []
          if (byParty.length === 1) pick = byParty[0]
        }
        if (pick) {
          used.add(pick.id)
          updateDoc(pick.id, { paymentStatus: 'paid', paidDate: d.date, linkedOpId: opId })
          matched++
        } else {
          ambiguous++
        }
      })
      const inc = drafts.filter((d) => d.kind === 'income').length
      setImportMsg(
        `Загружено операций: ${drafts.length} (приход ${inc}, расход ${drafts.length - inc})` +
          (matched > 0 ? `; привязано к счетам: ${matched} (отмечены оплаченными)` : '') +
          (ambiguous > 0 ? `; не привязано (несколько счетов на одну сумму): ${ambiguous} — отметьте вручную` : '') +
          '.'
      )
    } catch (e) {
      setImportMsg('Не удалось прочитать файл: ' + String(e instanceof Error ? e.message : e))
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{activeOrg.name}</div>
          <h1 className="text-2xl font-semibold text-ink">Деньги</h1>
          <p className="mt-1 text-sm text-muted">
            Доходы и расходы за {activeOrg.year} год. Формируют КУДиР и подставляются в расчёт налога.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.1c,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImportFile(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            Загрузить выписку
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            Экспорт в Excel
          </button>
          <button
            type="button"
            onClick={() => setPrintKudir(true)}
            className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            Печать КУДиР
          </button>
        </div>
      </header>

      {importMsg && (
        <div className="mb-5">
          <Note tone={importMsg.startsWith('Загружено') ? 'info' : 'warn'}>{importMsg}</Note>
        </div>
      )}

      {/* Инсайты (H2) — показываются только при включённом тумблере в «Настройках». */}
      {insights.length > 0 && (
        <Card title="Инсайты" className="mb-5">
          <ul className="space-y-2">
            {insights.map((ins) => (
              <li key={ins.id} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    ins.level === 'warn' ? 'bg-amber-500' : 'bg-brand-500'
                  }`}
                />
                <span>
                  <span className="font-medium text-ink">{ins.title}.</span>{' '}
                  <span className="text-muted">{ins.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Сводка */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm text-muted">Доходы (для налога)</div>
          <div className="tnum mt-1 text-2xl font-semibold text-ink">{formatRub(income)}</div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Расходы (для налога)</div>
          <div className="tnum mt-1 text-2xl font-semibold text-ink">{formatRub(expense)}</div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Операций за год</div>
          <div className="tnum mt-1 text-2xl font-semibold text-brand-600">{yearOps.length}</div>
        </Card>
      </div>

      {/* Отчёт о финансах (P&L) */}
      <Card
        title="Отчёт о финансах (P&L)"
        className="mb-5"
        right={
          <button
            type="button"
            onClick={exportPnl}
            className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            Экспорт в Excel
          </button>
        }
      >
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-sm text-muted">Доход за год</div>
            <div className="tnum mt-1 text-xl font-semibold text-ok">{formatRub(pnlInc)}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Расход за год</div>
            <div className="tnum mt-1 text-xl font-semibold text-ink">{formatRub(pnlExp)}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Прибыль</div>
            <div className={`tnum mt-1 text-xl font-semibold ${pnlProfit >= 0 ? 'text-ok' : 'text-danger'}`}>
              {formatRub(pnlProfit)}
            </div>
          </div>
        </div>
        {yearOps.length === 0 ? (
          <p className="text-sm text-muted">Добавьте операции — появится помесячная динамика.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Месяц</th>
                  <th className="py-2 pr-3 text-right font-medium">Доход</th>
                  <th className="py-2 pr-3 text-right font-medium">Расход</th>
                  <th className="py-2 text-right font-medium">Прибыль</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((mm, i) =>
                  mm.inc === 0 && mm.exp === 0 ? null : (
                    <tr key={i} className="border-b border-line/60">
                      <td className="py-2 pr-3 text-ink">{MONTHS[i]}</td>
                      <td className="tnum py-2 pr-3 text-right text-ok">{formatRub(mm.inc)}</td>
                      <td className="tnum py-2 pr-3 text-right">{formatRub(mm.exp)}</td>
                      <td className={`tnum py-2 text-right ${mm.inc - mm.exp >= 0 ? 'text-ink' : 'text-danger'}`}>
                        {formatRub(mm.inc - mm.exp)}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Добавить операцию */}
      <Card title="Добавить операцию" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Дата">
            <input
              type="date"
              className={inputClass}
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </Field>
          <Field label="Тип">
            <div className="grid grid-cols-2 gap-2">
              {(['income', 'expense'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDraft({ ...draft, kind: k })}
                  className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    draft.kind === k
                      ? 'border-brand-500 bg-brand-50 text-brand-600'
                      : 'border-line text-muted hover:border-slate-300'
                  }`}
                >
                  {k === 'income' ? 'Приход' : 'Расход'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Сумма" hint={formatRub(draft.amount)}>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Контрагент">
            <input
              className={inputClass}
              placeholder="ООО «Ромашка»"
              value={draft.counterparty}
              onChange={(e) => setDraft({ ...draft, counterparty: e.target.value })}
            />
          </Field>
          <Field label="Документ №">
            <input
              className={inputClass}
              placeholder="Счёт № 12"
              value={draft.doc}
              onChange={(e) => setDraft({ ...draft, doc: e.target.value })}
            />
          </Field>
          <Field label="Описание">
            <input
              className={inputClass}
              placeholder="Оплата услуг"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2.5 self-end pb-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line text-brand-600"
              checked={draft.taxable}
              onChange={(e) => setDraft({ ...draft, taxable: e.target.checked })}
            />
            <span className="text-sm text-ink">Учитывать в налоге</span>
          </label>
          <button
            type="button"
            onClick={add}
            className="flex items-center justify-center gap-1.5 self-end rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <IconPlus size={16} />
            Добавить
          </button>
        </div>
        {/* Подсказка заполнения (H1) — только при включённом тумблере; решает человек. */}
        {suggestion && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
            <span className="text-brand-700">
              Подсказка {suggestion.basis}:{' '}
              {suggestion.kind ? (suggestion.kind === 'income' ? 'приход, ' : 'расход, ') : ''}
              {suggestion.taxable ? 'учитывать в налоге' : 'не в налоге'}
              {suggestion.note ? `, «${suggestion.note}»` : ''}
            </span>
            <button
              type="button"
              onClick={applySuggestion}
              className="cursor-pointer rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-brand-700"
            >
              Применить
            </button>
          </div>
        )}
      </Card>

      {/* Список операций */}
      <Card
        title="Операции"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-line p-0.5">
              {(
                [
                  ['year', 'Год'],
                  ['quarter', 'Квартал'],
                  ['month', 'Месяц'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPeriodMode(m)}
                  className={`cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                    periodMode === m ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {periodMode === 'quarter' && (
              <select
                className="cursor-pointer rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
                value={periodQuarter}
                onChange={(e) => setPeriodQuarter(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    {q} квартал
                  </option>
                ))}
              </select>
            )}
            {periodMode === 'month' && (
              <select
                className="cursor-pointer rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(Number(e.target.value))}
              >
                {MONTHS.map((mn, i) => (
                  <option key={i} value={i}>
                    {mn}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      >
        {yearOps.length === 0 ? (
          <p className="text-sm text-muted">Пока нет операций за {activeOrg.year} год.</p>
        ) : viewOps.length === 0 ? (
          <p className="text-sm text-muted">Нет операций {periodLabel}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Дата</th>
                  <th className="py-2 pr-3 font-medium">Контрагент</th>
                  <th className="py-2 pr-3 font-medium">Тип операции / назначение</th>
                  <th className="py-2 pr-3 text-right font-medium">Приход</th>
                  <th className="py-2 pr-3 text-right font-medium">Расход</th>
                  <th className="py-2 pr-2 text-center font-medium">Налог</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {viewOps.map((o) => (
                  <tr key={o.id} className="border-b border-line/60 align-top">
                    <td className="tnum py-2 pr-3 text-muted">{formatDate(o.date)}</td>
                    <td className="py-2 pr-3 text-ink">{o.counterparty || '—'}</td>
                    <td className="py-2 pr-3 text-ink">
                      <span
                        className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                          o.kind === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {o.kind === 'income' ? 'Приход' : 'Расход'}
                      </span>
                      {o.note || (o.doc ? '' : '—')}
                      {o.doc && <span className="ml-1 text-xs text-slate-400">({o.doc})</span>}
                    </td>
                    <td className="tnum py-2 pr-3 text-right text-ok">
                      {o.kind === 'income' ? formatRub(o.amount) : ''}
                    </td>
                    <td className="tnum py-2 pr-3 text-right text-ink">
                      {o.kind === 'expense' ? formatRub(o.amount) : ''}
                    </td>
                    <td className="py-2 pr-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-line text-brand-600"
                        checked={o.taxable}
                        onChange={(e) => updateOp(o.id, { taxable: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditDraft({ ...o })}
                          className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-brand-600"
                        >
                          изменить
                        </button>
                        <button
                          type="button"
                          onClick={() => removeOpCascade(o.id)}
                          className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-danger"
                        >
                          удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line font-medium text-ink">
                  <td className="py-2 pr-3 text-right text-muted" colSpan={3}>
                    Итого {periodLabel}
                  </td>
                  <td className="tnum py-2 pr-3 text-right text-ok">{formatRub(viewInc)}</td>
                  <td className="tnum py-2 pr-3 text-right">{formatRub(viewExp)}</td>
                  <td className="py-2" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button
            type="button"
            onClick={applyToTaxes}
            className="cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Перенести в расчёт налогов
          </button>
          {applied && (
            <span className="text-sm text-ok">
              Доход {formatRub(income)} и расход {formatRub(expense)} перенесены в «Налоги» ✓
            </span>
          )}
        </div>
      </Card>

      <div className="mt-5">
        <Note>
          Операции хранятся локально в браузере (демо). Отметка «Учитывать в налоге» определяет,
          попадёт ли сумма в КУДиР и расчёт. Кнопка «Загрузить выписку» принимает файл формата
          1CClientBankExchange (выгрузка из интернет-банка) — приход/расход определяются по вашему
          расчётному счёту из «Реквизитов».
        </Note>
      </div>

      {printKudir && (
        <PrintModal title="КУДиР — предпросмотр" onClose={() => setPrintKudir(false)}>
          <KudirDoc org={activeOrg} ops={ops} />
        </PrintModal>
      )}

      {editDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditDraft(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold text-ink">Изменить операцию</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Дата">
                <input
                  type="date"
                  className={inputClass}
                  value={editDraft.date}
                  onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                />
              </Field>
              <Field label="Тип">
                <div className="grid grid-cols-2 gap-2">
                  {(['income', 'expense'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setEditDraft({ ...editDraft, kind: k })}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        editDraft.kind === k
                          ? 'border-brand-500 bg-brand-50 text-brand-600'
                          : 'border-line text-muted hover:border-slate-300'
                      }`}
                    >
                      {k === 'income' ? 'Приход' : 'Расход'}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Сумма" hint={formatRub(editDraft.amount)}>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={editDraft.amount}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, amount: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </Field>
              <Field label="Контрагент">
                <input
                  className={inputClass}
                  value={editDraft.counterparty}
                  onChange={(e) => setEditDraft({ ...editDraft, counterparty: e.target.value })}
                />
              </Field>
              <Field label="Документ №">
                <input
                  className={inputClass}
                  value={editDraft.doc}
                  onChange={(e) => setEditDraft({ ...editDraft, doc: e.target.value })}
                />
              </Field>
              <Field label="Назначение / описание">
                <input
                  className={inputClass}
                  value={editDraft.note}
                  onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })}
                />
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-brand-600"
                checked={editDraft.taxable}
                onChange={(e) => setEditDraft({ ...editDraft, taxable: e.target.checked })}
              />
              <span className="text-sm text-ink">Учитывать в налоге</span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditDraft(null)}
                className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
