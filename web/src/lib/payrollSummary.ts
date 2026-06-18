/**
 * Агрегация зарплаты по всему штату — единый источник для «Сводки по штату»,
 * расчётно-платёжной ведомости и отчётов за сотрудников (6-НДФЛ/РСВ/ЕФС-1/перс.сведения).
 */
import { calcSalary, workdaysInMonth, type CalcSalaryOptions } from './taxcore'
import type { Org } from '../state/orgStore'
import type { Employee } from '../state/employeesStore'

export interface EmployeeAgg {
  e: Employee
  grossYear: number
  ndflYear: number
  advanceNdflYear: number
  settlementNdflYear: number
  vznosyYear: number
  travmYear: number
  employerCostYear: number
  netYear: number
  grossMonth: number
  ndflMonth: number
  netMonth: number
  advanceMonth: number
  settlementMonth: number
}

export type SummaryTotals = Omit<EmployeeAgg, 'e'>

export interface PayrollSummary {
  rows: EmployeeAgg[]
  totals: SummaryTotals
  count: number
}

/**
 * Опции calcSalary из карточки сотрудника (единый источник: оклад, дети, МСП, аванс).
 * Если передан `year` и у сотрудника заданы отработанные дни по месяцам — пробрасываем
 * monthFactors, чтобы отчёты/сводка считали так же, как вкладка «Зарплата» (помесячно по
 * рабочим дням), а не полную проекцию 12×оклад.
 */
export function employeeSalaryOptions(e: Employee, year?: number): CalcSalaryOptions {
  const wd = year != null ? e.workedDaysByYear?.[year] : undefined
  const monthFactors = wd
    ? Array.from({ length: 12 }, (_, i) => {
        const n = workdaysInMonth(year as number, i + 1)
        const d = wd[i]
        return d == null || !n ? 1 : Math.min(Math.max(d, 0), n) / n
      })
    : undefined
  return {
    children: e.children,
    msp: e.msp,
    advancePercent: (e.advancePercent ?? 0) / 100, // в карточке хранится в %, calcSalary ждёт долю
    advanceDay: e.advanceDay,
    monthFactors,
  }
}

/** Считается ли сотрудник работающим в расчётном году (уволенные до года исключаются). */
export function isActiveInYear(e: Employee, year: number): boolean {
  if (!e.dismissalDate) return true
  const dy = Number(e.dismissalDate.slice(0, 4))
  return Number.isFinite(dy) ? dy >= year : true
}

const EMPTY: SummaryTotals = {
  grossYear: 0,
  ndflYear: 0,
  advanceNdflYear: 0,
  settlementNdflYear: 0,
  vznosyYear: 0,
  travmYear: 0,
  employerCostYear: 0,
  netYear: 0,
  grossMonth: 0,
  ndflMonth: 0,
  netMonth: 0,
  advanceMonth: 0,
  settlementMonth: 0,
}

export function payrollSummary(
  org: Org,
  employees: Employee[],
  opts: { includeDismissed?: boolean } = {}
): PayrollSummary {
  const list = opts.includeDismissed
    ? employees
    : employees.filter((e) => isActiveInYear(e, org.year))

  const rows: EmployeeAgg[] = list.map((e) => {
    const agg: EmployeeAgg = { e, ...EMPTY }
    try {
      const c = calcSalary(org.year, e.salary, employeeSalaryOptions(e, org.year))
      agg.grossYear = c.gross_year.toNumber()
      agg.ndflYear = c.ndfl_year.toNumber()
      agg.advanceNdflYear = c.advance_ndfl_year.toNumber()
      agg.settlementNdflYear = c.settlement_ndfl_year.toNumber()
      agg.vznosyYear = c.vznosy_year.toNumber()
      agg.travmYear = c.travmatizm_year.toNumber()
      agg.employerCostYear = c.employer_cost_year.toNumber()
      agg.netYear = c.net_year.toNumber()
      const m0 = c.months[0]
      if (m0) {
        agg.grossMonth = m0.gross.toNumber()
        agg.ndflMonth = m0.ndfl.toNumber()
        agg.netMonth = m0.net.toNumber()
        agg.advanceMonth = m0.advance_net.toNumber()
        agg.settlementMonth = m0.settlement_net.toNumber()
      }
    } catch {
      /* сотрудник с некорректными данными — пропускаем в суммах */
    }
    return agg
  })

  const sum = (f: (a: EmployeeAgg) => number) => rows.reduce((s, a) => s + f(a), 0)
  const totals: SummaryTotals = {
    grossYear: sum((a) => a.grossYear),
    ndflYear: sum((a) => a.ndflYear),
    advanceNdflYear: sum((a) => a.advanceNdflYear),
    settlementNdflYear: sum((a) => a.settlementNdflYear),
    vznosyYear: sum((a) => a.vznosyYear),
    travmYear: sum((a) => a.travmYear),
    employerCostYear: sum((a) => a.employerCostYear),
    netYear: sum((a) => a.netYear),
    grossMonth: sum((a) => a.grossMonth),
    ndflMonth: sum((a) => a.ndflMonth),
    netMonth: sum((a) => a.netMonth),
    advanceMonth: sum((a) => a.advanceMonth),
    settlementMonth: sum((a) => a.settlementMonth),
  }

  return { rows, totals, count: rows.length }
}
