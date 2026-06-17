import { useRef, useState } from 'react'
import { useOrg } from '../state/orgStore'
import { useOps, type Operation } from '../state/opsStore'
import { useDocs, docTotals } from '../state/docsStore'
import { formatRub, formatDate } from '../lib/format'
import { Card, Field, Note, inputClass } from '../components/ui'
import { IconPlus } from '../components/icons'
import { PrintModal } from '../components/PrintModal'
import { KudirDoc } from '../components/KudirDoc'
import { parse1CClientBankExchange, readBankStatement } from '../lib/bankImport'
import { downloadCsv } from '../lib/download'

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
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [printKudir, setPrintKudir] = useState(false)
  const [applied, setApplied] = useState(false)

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
      </Card>

      {/* Список операций */}
      <Card title="Операции">
        {yearOps.length === 0 ? (
          <p className="text-sm text-muted">Пока нет операций за {activeOrg.year} год.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Дата</th>
                  <th className="py-2 pr-3 font-medium">Контрагент / описание</th>
                  <th className="py-2 pr-3 text-right font-medium">Приход</th>
                  <th className="py-2 pr-3 text-right font-medium">Расход</th>
                  <th className="py-2 pr-2 text-center font-medium">Налог</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {yearOps.map((o) => (
                  <tr key={o.id} className="border-b border-line/60 align-top">
                    <td className="tnum py-2 pr-3 text-muted">{formatDate(o.date)}</td>
                    <td className="py-2 pr-3 text-ink">
                      {[o.counterparty, o.note].filter(Boolean).join(' · ') || '—'}
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
                      <button
                        type="button"
                        onClick={() => removeOp(o.id)}
                        className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-danger"
                      >
                        удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
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
    </div>
  )
}
