/** Единая точка расчёта по организации — используется экранами «Налоги» и «Дашборд». */
import { calcContributions, usnCalendar, usnQuick } from './taxcore'
import type { Org } from '../state/orgStore'

export function compute(org: Org) {
  const rate = org.regionalRate != null ? org.regionalRate / 100 : undefined
  const contr = calcContributions(org.year, org.income, org.expenses, org.usnObject)
  // Для «Доходы» к вычету принимаем взносы (фикс + 1%); для «Доходы−расходы» — 0
  // (там взносы учтены в расходах). Для ИП с работниками вычет ограничивается 50% внутри calcUsn.
  const deduct = org.usnObject === 'income' ? contr.total : 0
  const usn = usnQuick(org.year, org.usnObject, org.income, {
    expenses: org.expenses,
    contributionsToDeduct: deduct,
    hasEmployees: org.hasEmployees,
    rate,
  })
  const calendar = usnCalendar(org.year, usn, contr)
  return { contr, usn, calendar }
}

export type Computed = ReturnType<typeof compute>
