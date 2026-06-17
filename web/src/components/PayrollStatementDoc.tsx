import { formatRub, formatDate } from '../lib/format'
import { payrollSummary } from '../lib/payrollSummary'
import type { Org } from '../state/orgStore'
import type { Employee } from '../state/employeesStore'

const r0 = (n: number) => formatRub(Math.round(n))

/** Расчётно-платёжная ведомость (упрощённый аналог Т-49) — начисления за месяц по штату. */
export function PayrollStatementDoc({ org, employees }: { org: Org; employees: Employee[] }) {
  const { rows, totals } = payrollSummary(org, employees)
  return (
    <div>
      <div className="text-center text-base font-semibold">Расчётно-платёжная ведомость</div>
      <div className="mt-1 text-center text-xs text-slate-500">
        {org.fio || org.name || '—'}{org.inn && `, ИНН ${org.inn}`} · начисления за месяц ({org.year})
      </div>
      <table className="mt-5 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-y border-slate-300 text-left">
            <th className="w-8 py-1.5 pr-2 font-semibold">№</th>
            <th className="py-1.5 pr-2 font-semibold">ФИО</th>
            <th className="py-1.5 pr-2 font-semibold">Должность</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Начислено</th>
            <th className="py-1.5 pr-2 text-right font-semibold">НДФЛ</th>
            <th className="py-1.5 pr-2 text-right font-semibold">К выплате</th>
            <th className="py-1.5 font-semibold">Подпись</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a, i) => (
            <tr key={a.e.id} className="border-b border-slate-200">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2">{a.e.fio || '—'}</td>
              <td className="py-1.5 pr-2">{a.e.position || '—'}</td>
              <td className="tnum py-1.5 pr-2 text-right">{r0(a.grossMonth)}</td>
              <td className="tnum py-1.5 pr-2 text-right">{r0(a.ndflMonth)}</td>
              <td className="tnum py-1.5 pr-2 text-right">{r0(a.netMonth)}</td>
              <td className="py-1.5 text-slate-300">__________</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-300 font-semibold">
            <td className="py-1.5 pr-2" colSpan={3}>
              Итого ({rows.length} чел.)
            </td>
            <td className="tnum py-1.5 pr-2 text-right">{r0(totals.grossMonth)}</td>
            <td className="tnum py-1.5 pr-2 text-right">{r0(totals.ndflMonth)}</td>
            <td className="tnum py-1.5 pr-2 text-right">{r0(totals.netMonth)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="mt-8 text-[13px]">Руководитель: ______________ / {org.fio || org.name}</div>
      <div className="mt-6 text-[11px] text-slate-400">
        Сформировано в «СвояКнига» {formatDate(new Date().toISOString().slice(0, 10))}. Демо-форма.
      </div>
    </div>
  )
}
