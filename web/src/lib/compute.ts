/** Единая точка расчёта — используется и экраном «Налоги», и «Дашбордом». */
import { calcContributions, usnCalendar, usnQuick } from './taxcore'
import type { TaxInputs } from '../state/store'

export function compute(inp: TaxInputs) {
  const contr = calcContributions(inp.year, inp.income, inp.expenses, inp.usnObject)
  // Для «Доходы» к вычету принимаем взносы (фикс + 1%); для «Доходы−расходы» — 0
  // (там взносы учтены в расходах). Для ИП с работниками вычет ограничивается 50% внутри calcUsn.
  const deduct = inp.usnObject === 'income' ? contr.total : 0
  const usn = usnQuick(inp.year, inp.usnObject, inp.income, {
    expenses: inp.expenses,
    contributionsToDeduct: deduct,
    hasEmployees: inp.hasEmployees,
  })
  const calendar = usnCalendar(inp.year, usn, contr)
  return { contr, usn, calendar }
}

export type Computed = ReturnType<typeof compute>
