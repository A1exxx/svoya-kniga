import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import type { Operation } from '../state/opsStore'

/** Печатная Книга учёта доходов и расходов (КУДиР), Раздел I — из операций за год. */
export function KudirDoc({ org, ops }: { org: Org; ops: Operation[] }) {
  const rows = ops
    .filter((o) => o.taxable && o.date.startsWith(String(org.year)))
    .sort((a, b) => a.date.localeCompare(b.date))

  let totalIncome = 0
  let totalExpense = 0
  for (const o of rows) {
    if (o.kind === 'income') totalIncome += o.amount
    else totalExpense += o.amount
  }

  return (
    <div>
      <div className="text-center">
        <div className="text-base font-semibold">
          Книга учёта доходов и расходов организаций и индивидуальных предпринимателей,
          применяющих упрощённую систему налогообложения
        </div>
        <div className="mt-1 text-xs text-slate-500">за {org.year} год · Раздел I. Доходы и расходы</div>
      </div>

      <table className="mt-4 w-full text-[12px]">
        <tbody>
          <tr>
            <td className="py-0.5 text-slate-500">Налогоплательщик</td>
            <td className="py-0.5 text-right font-medium">{org.fio || org.name || '—'}</td>
          </tr>
          <tr>
            <td className="py-0.5 text-slate-500">ИНН</td>
            <td className="py-0.5 text-right font-medium">{org.inn || '—'}</td>
          </tr>
          <tr>
            <td className="py-0.5 text-slate-500">Объект налогообложения</td>
            <td className="py-0.5 text-right font-medium">
              {org.usnObject === 'income' ? 'Доходы' : 'Доходы, уменьшенные на расходы'}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-slate-300 text-left">
            <th className="w-8 py-1.5 pr-2 font-semibold">№</th>
            <th className="w-20 py-1.5 pr-2 font-semibold">Дата</th>
            <th className="w-28 py-1.5 pr-2 font-semibold">Документ</th>
            <th className="py-1.5 pr-2 font-semibold">Содержание операции</th>
            <th className="w-28 py-1.5 pr-2 text-right font-semibold">Доходы</th>
            <th className="w-28 py-1.5 text-right font-semibold">Расходы</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-slate-400">
                Нет операций за {org.year} год. Добавьте их в разделе «Деньги».
              </td>
            </tr>
          )}
          {rows.map((o, i) => (
            <tr key={o.id} className="border-b border-slate-200 align-top">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2">{formatDate(o.date)}</td>
              <td className="py-1.5 pr-2">{o.doc || '—'}</td>
              <td className="py-1.5 pr-2">
                {[o.counterparty, o.note].filter(Boolean).join(' · ') || '—'}
              </td>
              <td className="tnum py-1.5 pr-2 text-right">
                {o.kind === 'income' ? formatRub(o.amount, { kopecks: true }) : ''}
              </td>
              <td className="tnum py-1.5 text-right">
                {o.kind === 'expense' ? formatRub(o.amount, { kopecks: true }) : ''}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-400 font-semibold">
            <td colSpan={4} className="py-2">Итого за год</td>
            <td className="tnum py-2 pr-2 text-right">{formatRub(totalIncome, { kopecks: true })}</td>
            <td className="tnum py-2 text-right">{formatRub(totalExpense, { kopecks: true })}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-6 text-xs text-slate-500">
        Сформировано: {formatDate(new Date().toISOString().slice(0, 10))}. Книга формируется
        автоматически из операций раздела «Деньги». По итогам года распечатать, пронумеровать и
        прошнуровать; хранить 5 лет.
      </div>
    </div>
  )
}
