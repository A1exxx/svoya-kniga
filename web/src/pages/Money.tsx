import { useState } from 'react'
import { useOrg } from '../state/orgStore'
import { useOps, type Operation } from '../state/opsStore'
import { formatRub, formatDate } from '../lib/format'
import { Card, Field, Note, inputClass } from '../components/ui'
import { IconPlus } from '../components/icons'
import { PrintModal } from '../components/PrintModal'
import { KudirDoc } from '../components/KudirDoc'

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
        <button
          type="button"
          onClick={() => setPrintKudir(true)}
          className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          Печать КУДиР
        </button>
      </header>

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
          попадёт ли сумма в КУДиР и расчёт. Загрузка банковской выписки появится позже.
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
