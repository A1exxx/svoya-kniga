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

/** Печатный предпросмотр декларации по УСН (КНД 1152017), заполненный из расчёта.
 *  При поквартальном расчёте (из «Денег») заполняются все строки по периодам. */
export function DeclarationDoc({ org, computed }: { org: Org; computed: Computed }) {
  const isIncome = org.usnObject === 'income'
  const periods = computed.usn.periods
  const quarterly = periods.length === 4
  const yearP = periods[periods.length - 1] // годовой (последний) период
  const ratePct = computed.usn.rate.times(100).toNumber()
  // Минимальный налог (Д-Р) больше расчётного → к уплате идёт минимальный (строка 120).
  const minApplied = !isIncome && computed.usn.min_tax.gt(computed.usn.tax_year_computed)

  // Доходы/расходы за год — из операций (если поквартально) или ручные.
  const annualIncome = quarterly
    ? computed.byQuarter.reduce((s, q) => s + q.income, 0)
    : org.income
  const annualExpense = quarterly
    ? computed.byQuarter.reduce((s, q) => s + q.expense, 0)
    : org.expenses

  // Значение строки периода i (или «—», если периода нет).
  const pv = (i: number, fn: (p: (typeof periods)[number]) => { toNumber: () => number }) =>
    periods[i] ? v(fn(periods[i])) : '—'

  const taxName = isIncome
    ? 'Раздел 2.1.1. Расчёт налога (объект «Доходы»)'
    : 'Раздел 2.2. Расчёт налога (объект «Доходы минус расходы»)'

  return (
    <div>
      <div className="text-center">
        <div className="text-base font-semibold">
          Налоговая декларация по налогу, уплачиваемому в связи с применением упрощённой системы
          налогообложения
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
            <td className="py-1 text-right font-medium">{ratePct}%</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-6 mb-2 font-semibold">{taxName}</div>
      <table className="w-full">
        <tbody>
          {isIncome ? (
            quarterly ? (
              <>
                <Line code="110" label="Доходы за 1 квартал" value={pv(0, (p) => p.tax_base_cumulative)} />
                <Line code="111" label="Доходы за полугодие" value={pv(1, (p) => p.tax_base_cumulative)} />
                <Line code="112" label="Доходы за 9 месяцев" value={pv(2, (p) => p.tax_base_cumulative)} />
                <Line code="113" label="Доходы за год" value={pv(3, (p) => p.tax_base_cumulative)} />
                <Line code="120–123" label="Ставка налога (%)" value={`${ratePct}`} />
                <Line code="130" label="Налог за 1 квартал" value={pv(0, (p) => p.tax_before_deduction_cumulative)} />
                <Line code="131" label="Налог за полугодие" value={pv(1, (p) => p.tax_before_deduction_cumulative)} />
                <Line code="132" label="Налог за 9 месяцев" value={pv(2, (p) => p.tax_before_deduction_cumulative)} />
                <Line code="133" label="Налог за год" value={pv(3, (p) => p.tax_before_deduction_cumulative)} />
                <Line code="140" label="Взносы, уменьшающие налог, за 1 квартал" value={pv(0, (p) => p.deduction_cumulative)} />
                <Line code="141" label="…за полугодие" value={pv(1, (p) => p.deduction_cumulative)} />
                <Line code="142" label="…за 9 месяцев" value={pv(2, (p) => p.deduction_cumulative)} />
                <Line code="143" label="…за год" value={pv(3, (p) => p.deduction_cumulative)} />
              </>
            ) : (
              <>
                <Line code="113" label="Сумма полученных доходов за налоговый период" value={v(yearP.tax_base_cumulative)} />
                <Line code="123" label="Ставка налога (%)" value={`${ratePct}`} />
                <Line code="133" label="Сумма исчисленного налога за год" value={v(yearP.tax_before_deduction_cumulative)} />
                <Line code="143" label="Сумма страховых взносов, уменьшающая налог" value={v(yearP.deduction_cumulative)} />
              </>
            )
          ) : (
            <>
              <Line code="213" label="Сумма полученных доходов за налоговый период" value={v(annualIncome)} />
              <Line code="223" label="Сумма произведённых расходов" value={v(annualExpense)} />
              <Line code="243" label="Налоговая база (доходы − расходы)" value={v(yearP.tax_base_cumulative)} />
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
          {quarterly ? (
            <>
              <Line code="020" label="Аванс к уплате за 1 квартал" value={pv(0, (p) => p.advance_due_this_period)} />
              <Line code="040" label="Аванс к уплате за полугодие" value={pv(1, (p) => p.advance_due_this_period)} />
              {periods[1].overpayment_this_period.toNumber() > 0 && (
                <Line code="050" label="Аванс к уменьшению за полугодие" value={pv(1, (p) => p.overpayment_this_period)} />
              )}
              <Line code="070" label="Аванс к уплате за 9 месяцев" value={pv(2, (p) => p.advance_due_this_period)} />
              {periods[2].overpayment_this_period.toNumber() > 0 && (
                <Line code="080" label="Аванс к уменьшению за 9 месяцев" value={pv(2, (p) => p.overpayment_this_period)} />
              )}
              {minApplied ? (
                <Line code="120" label="Минимальный налог к уплате за год" value={v(computed.usn.year_payment_due)} />
              ) : (
                <Line code="100" label="Налог к доплате за год" value={v(computed.usn.year_payment_due)} />
              )}
              {computed.usn.year_overpayment.toNumber() > 0 && (
                <Line code="110" label="Налог к уменьшению за год" value={v(computed.usn.year_overpayment)} />
              )}
            </>
          ) : minApplied ? (
            <>
              <Line code="120" label="Сумма минимального налога к уплате" value={v(computed.usn.year_payment_due)} />
              {computed.usn.year_overpayment.toNumber() > 0 && (
                <Line code="110" label="Сумма налога к уменьшению (переплата)" value={v(computed.usn.year_overpayment)} />
              )}
            </>
          ) : (
            <>
              <Line code="100" label="Сумма налога, подлежащая уплате за налоговый период" value={v(computed.usn.year_payment_due)} />
              {computed.usn.year_overpayment.toNumber() > 0 && (
                <Line code="110" label="Сумма налога к уменьшению (переплата)" value={v(computed.usn.year_overpayment)} />
              )}
            </>
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
          Предпросмотр (демо-режим).{' '}
          {quarterly
            ? 'Поквартальные суммы заполнены из операций в «Деньгах».'
            : 'Годовые показатели заполнены из расчёта; поквартальные — при учёте операций.'}{' '}
          Перед подачей сверьте с бухгалтером.
        </div>
      </div>
    </div>
  )
}
