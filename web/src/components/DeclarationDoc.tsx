import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import type { Computed } from '../lib/compute'

const v = (d: number | { toNumber: () => number } | null | undefined) =>
  formatRub(d == null ? null : typeof d === 'number' ? d : d.toNumber())

function Line({ code, label, value }: { code: string; label: string; value: string }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="w-16 py-1.5 align-top font-mono text-xs text-slate-500">{code}</td>
      <td className="py-1.5 pr-3 align-top">{label}</td>
      <td className="tnum w-40 py-1.5 text-right align-top font-medium">{value}</td>
    </tr>
  )
}

/** Печатный предпросмотр декларации по УСН (КНД 1152017), заполненный из расчёта. */
export function DeclarationDoc({ org, computed }: { org: Org; computed: Computed }) {
  const isIncome = org.usnObject === 'income'
  const period = computed.usn.periods[0]
  const taxName =
    isIncome
      ? 'Раздел 2.1.1. Расчёт налога (объект «Доходы»)'
      : 'Раздел 2.2. Расчёт налога (объект «Доходы минус расходы»)'

  return (
    <div>
      <div className="text-center">
        <div className="text-base font-semibold">
          Налоговая декларация по налогу, уплачиваемому в связи с применением
          упрощённой системы налогообложения
        </div>
        <div className="mt-1 text-xs text-slate-500">Форма по КНД 1152017</div>
      </div>

      <table className="mt-5 w-full text-[13px]">
        <tbody>
          <tr>
            <td className="py-1 text-slate-500">Налоговый период (год)</td>
            <td className="py-1 text-right font-medium">{org.year}</td>
          </tr>
          <tr>
            <td className="py-1 text-slate-500">Налогоплательщик</td>
            <td className="py-1 text-right font-medium">{org.fio || org.name || '—'}</td>
          </tr>
          <tr>
            <td className="py-1 text-slate-500">ИНН</td>
            <td className="py-1 text-right font-medium">{org.inn || '—'}</td>
          </tr>
          <tr>
            <td className="py-1 text-slate-500">Объект налогообложения</td>
            <td className="py-1 text-right font-medium">
              {isIncome ? 'Доходы' : 'Доходы, уменьшенные на расходы'}
            </td>
          </tr>
          <tr>
            <td className="py-1 text-slate-500">Ставка налога</td>
            <td className="py-1 text-right font-medium">{computed.usn.rate.times(100).toNumber()}%</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-6 mb-2 font-semibold">{taxName}</div>
      <table className="w-full">
        <tbody>
          {isIncome ? (
            <>
              <Line code="113" label="Сумма полученных доходов за налоговый период" value={v(period.tax_base_cumulative)} />
              <Line code="123" label="Ставка налога (%)" value={`${computed.usn.rate.times(100).toNumber()}`} />
              <Line code="133" label="Сумма исчисленного налога за год" value={v(period.tax_before_deduction_cumulative)} />
              <Line code="143" label="Сумма страховых взносов, уменьшающая налог" value={v(period.deduction_cumulative)} />
            </>
          ) : (
            <>
              <Line code="213" label="Сумма полученных доходов за налоговый период" value={v(org.income)} />
              <Line code="223" label="Сумма произведённых расходов" value={v(org.expenses)} />
              <Line code="243" label="Налоговая база (доходы − расходы)" value={v(period.tax_base_cumulative)} />
              <Line code="273" label="Сумма исчисленного налога" value={v(computed.usn.tax_year_computed)} />
              <Line code="280" label="Сумма минимального налога (1% от доходов)" value={v(computed.usn.min_tax)} />
            </>
          )}
        </tbody>
      </table>

      <div className="mt-6 mb-2 font-semibold">
        {isIncome ? 'Раздел 1.1. Сумма налога к уплате' : 'Раздел 1.2. Сумма налога к уплате'}
      </div>
      <table className="w-full">
        <tbody>
          <Line code="100" label="Сумма налога, подлежащая уплате за налоговый период" value={v(computed.usn.tax_year_final)} />
          {computed.usn.year_overpayment.toNumber() > 0 && (
            <Line code="110" label="Сумма налога к уменьшению (переплата)" value={v(computed.usn.year_overpayment)} />
          )}
        </tbody>
      </table>

      <div className="mt-8 flex items-end justify-between text-xs text-slate-500">
        <div>
          Дата формирования: {formatDate(new Date().toISOString().slice(0, 10))}
          <br />
          Подпись: ______________ / {org.fio || org.name}
        </div>
        <div className="max-w-[60%] text-right">
          Предпросмотр (демо-режим). Годовые показатели заполнены автоматически из расчёта;
          поквартальные суммы — при поквартальном учёте. Перед подачей сверьте с бухгалтером.
        </div>
      </div>
    </div>
  )
}
