/** Единая точка расчёта по организации — используется экранами «Налоги», «Дашборд», «Отчётность».
 *
 * Если за год есть операции в «Деньгах» — считаем ПОКВАРТАЛЬНО нарастающим итогом
 * (как Эльба): доходы/расходы группируются по кварталам, авансы — за каждый период.
 * Иначе — годовой расчёт из ручных доходов/расходов на экране «Налоги».
 *
 * ВАЖНО: суммы агрегируются в Decimal (decimal.js), а не в JS-number, чтобы копейки
 * из операций не накапливали float-погрешность и не сбивали округление налога.
 */
import Decimal from 'decimal.js'
import { calcContributions, usnCalendar, usnQuick, calcUsn, toDecimal, type PeriodData } from './taxcore'
import type { Org } from '../state/orgStore'
import type { Operation } from '../state/opsStore'

const QUARTER_LABELS = ['1 квартал', 'полугодие', '9 месяцев', 'год']

export interface QuarterAgg {
  label: string
  income: number
  expense: number
}

function cumulative(a: Decimal[]): Decimal[] {
  const r = [...a]
  for (let i = 1; i < r.length; i++) r[i] = r[i].plus(r[i - 1])
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

  // --- Поквартальный режим (есть операции): нарастающим итогом, всё в Decimal ---
  const inc = [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(0)]
  const exp = [new Decimal(0), new Decimal(0), new Decimal(0), new Decimal(0)]
  for (const o of yearOps) {
    const q = Math.floor((Number(o.date.slice(5, 7)) - 1) / 3)
    if (q < 0 || q > 3) continue
    if (o.kind === 'income') inc[q] = inc[q].plus(toDecimal(o.amount))
    else exp[q] = exp[q].plus(toDecimal(o.amount))
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
  const totalDeduct = org.usnObject === 'income' ? contr.total : new Decimal(0)
  const dedCum = [totalDeduct.div(4), totalDeduct.div(2), totalDeduct.times(3).div(4), totalDeduct]

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
    income: inc[i].toNumber(),
    expense: exp[i].toNumber(),
  }))
  return { contr, usn, calendar, quarterly: true, byQuarter }
}

export type Computed = ReturnType<typeof compute>
