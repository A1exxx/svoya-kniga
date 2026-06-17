/** Единая точка расчёта по организации — используется экранами «Налоги», «Дашборд», «Отчётность».
 *
 * Если за год есть операции в «Деньгах» — считаем ПОКВАРТАЛЬНО нарастающим итогом
 * (как Эльба): доходы/расходы группируются по кварталам, авансы — за каждый период.
 * Иначе — годовой расчёт из ручных доходов/расходов на экране «Налоги».
 */
import { calcContributions, usnCalendar, usnQuick, calcUsn, type PeriodData } from './taxcore'
import type { Org } from '../state/orgStore'
import type { Operation } from '../state/opsStore'

const QUARTER_LABELS = ['1 квартал', 'полугодие', '9 месяцев', 'год']

export interface QuarterAgg {
  label: string
  income: number
  expense: number
}

function cumulative(a: number[]): number[] {
  const r = [...a]
  for (let i = 1; i < r.length; i++) r[i] += r[i - 1]
  return r
}

export function compute(org: Org, ops: Operation[] = []) {
  const rate = org.regionalRate != null ? org.regionalRate / 100 : undefined
  const yearOps = ops.filter((o) => o.taxable && o.date.startsWith(String(org.year)))

  // --- Годовой режим (нет операций): из ручных доходов/расходов ---
  if (yearOps.length === 0) {
    const contr = calcContributions(org.year, org.income, org.expenses, org.usnObject, {
      regDate: org.regDate || undefined,
    })
    const deduct = org.usnObject === 'income' ? contr.total : 0
    const usn = usnQuick(org.year, org.usnObject, org.income, {
      expenses: org.expenses,
      contributionsToDeduct: deduct,
      hasEmployees: org.hasEmployees,
      rate,
    })
    const calendar = usnCalendar(org.year, usn, contr)
    return { contr, usn, calendar, quarterly: false, byQuarter: [] as QuarterAgg[] }
  }

  // --- Поквартальный режим (есть операции): нарастающим итогом ---
  const inc = [0, 0, 0, 0]
  const exp = [0, 0, 0, 0]
  for (const o of yearOps) {
    const q = Math.floor((Number(o.date.slice(5, 7)) - 1) / 3)
    if (q < 0 || q > 3) continue
    if (o.kind === 'income') inc[q] += o.amount
    else exp[q] += o.amount
  }
  const incCum = cumulative(inc)
  const expCum = cumulative(exp)
  const annualIncome = incCum[3]
  const annualExpense = expCum[3]

  const contr = calcContributions(org.year, annualIncome, annualExpense, org.usnObject, {
    regDate: org.regDate || undefined,
  })
  // Взносы к вычету (для «доходы») считаем уплаченными равномерно по кварталам —
  // это и рекомендует Эльба для равномерного уменьшения авансов.
  const totalDeduct = org.usnObject === 'income' ? contr.total.toNumber() : 0
  const dedCum = [0.25, 0.5, 0.75, 1].map((k) => totalDeduct * k)

  const periods: PeriodData[] = [0, 1, 2, 3].map((i) => ({
    label: QUARTER_LABELS[i],
    income_cumulative: incCum[i],
    expenses_cumulative: expCum[i],
    contributions_to_deduct_cumulative: dedCum[i],
  }))

  const usn = calcUsn(org.year, org.usnObject, periods, org.hasEmployees, rate)
  const calendar = usnCalendar(org.year, usn, contr)
  const byQuarter: QuarterAgg[] = [0, 1, 2, 3].map((i) => ({
    label: `${i + 1} кв`,
    income: inc[i],
    expense: exp[i],
  }))
  return { contr, usn, calendar, quarterly: true, byQuarter }
}

export type Computed = ReturnType<typeof compute>
