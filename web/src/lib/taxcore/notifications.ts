/**
 * Уведомления об исчисленных суммах налогов/взносов (КНД 1110355).
 *
 * НДФЛ — дважды в месяц (период 1–22 → уведомление до 25; период 23–конец → до 3 числа след.).
 * Страховые взносы за работников — ежемесячно, КРОМЕ 3-го месяца квартала (там данные из РСВ).
 * Авансы УСН — Q1/полугодие/9 мес (уведомление до 25 апреля/июля/октября).
 *
 * Коды периода: ПП/ММ, где ПП = квартал (21/31/33/34), ММ = 01..03 (1–22) или 11..13 (23–конец).
 */
import Decimal from 'decimal.js'
import { shiftToWorkday, dateToIso, makeDate } from './money.js'
import { NDFL_TIERS, type SalaryResult } from './payroll.js'

/** Предельная (маржинальная) ставка НДФЛ, % при кумулятивной базе с начала года. */
export function marginalNdflRatePct(cumBase: Decimal): number {
  for (const [upper, rate] of NDFL_TIERS) {
    if (upper === null || cumBase.lte(upper)) return rate.times(100).toNumber()
  }
  return NDFL_TIERS[NDFL_TIERS.length - 1][1].times(100).toNumber()
}

/** Префикс квартала по месяцу (1–12). */
function quarterPrefix(month: number): number {
  return [21, 21, 21, 31, 31, 31, 33, 33, 33, 34, 34, 34][month - 1]
}
function monthInQuarter(month: number): number {
  return ((month - 1) % 3) + 1
}

/** Код периода НДФЛ: half 1 → первая половина (01..03), half 2 → вторая (11..13). */
export function periodCodeNdfl(month: number, half: 1 | 2): string {
  const mm = (half === 1 ? 0 : 10) + monthInQuarter(month)
  return `${quarterPrefix(month)}/${String(mm).padStart(2, '0')}`
}

/** Код периода для взносов: только 1-й и 2-й месяцы квартала; 3-й → null (данные из РСВ). */
export function periodCodeContributions(month: number): string | null {
  const miq = monthInQuarter(month)
  if (miq === 3) return null
  return `${quarterPrefix(month)}/0${miq}`
}

/** Код периода для авансов УСН: квартал 1/2/3 → 34/01, 34/02, 34/03. */
export function periodCodeUsnAdvance(quarter: 1 | 2 | 3): string {
  return `34/0${quarter}`
}

/** Срок подачи уведомления по НДФЛ (ISO). */
export function dueDateNdfl(year: number, month: number, half: 1 | 2): string {
  if (half === 1) return dateToIso(shiftToWorkday(makeDate(year, month, 25)))
  // вторая половина — до 3 числа следующего месяца; декабрь — до конца года
  if (month === 12) return dateToIso(makeDate(year, 12, 31))
  return dateToIso(shiftToWorkday(makeDate(year, month + 1, 3)))
}

/** Срок подачи уведомления по взносам за месяц (до 25 числа следующего месяца). */
export function dueDateContributions(year: number, month: number): string {
  const m = month === 12 ? 1 : month + 1
  const y = month === 12 ? year + 1 : year
  return dateToIso(shiftToWorkday(makeDate(y, m, 25)))
}

/** Срок уведомления по авансу УСН (25 апреля/июля/октября). */
export function dueDateUsnAdvance(year: number, quarter: 1 | 2 | 3): string {
  const month = [4, 7, 10][quarter - 1]
  return dateToIso(shiftToWorkday(makeDate(year, month, 25)))
}

export interface NdflPeriodEntry {
  month: number
  half: 1 | 2
  period: string
  due: string
  kind: 'advance' | 'settlement'
  amount: number
  /** Маржинальная ставка НДФЛ для этого месяца (определяет КБК): 13/15/18/20/22. */
  ratePct: number
}

/**
 * Разбивка годового НДФЛ сотрудника по периодам уведомлений.
 * Аванс (выплата ~25 числа) → 2-я половина месяца M; окончательный расчёт (выплата ~5–10 числа
 * след. месяца) → 1-я половина месяца M+1. Декабрьский расчёт остаётся в декабре (код 34/13).
 * Инвариант: сумма amount по всем записям == ndfl_year (декомпозиция, не новый итог).
 */
export function ndflPeriodEntries(salary: SalaryResult): NdflPeriodEntry[] {
  const entries: NdflPeriodEntry[] = []
  const year = salary.year
  let cumTaxable = new Decimal(0)
  for (const m of salary.months) {
    const month = m.month
    cumTaxable = cumTaxable.plus(m.gross).minus(m.deduction_applied)
    const ratePct = marginalNdflRatePct(cumTaxable)
    entries.push({
      month,
      half: 2,
      period: periodCodeNdfl(month, 2),
      due: dueDateNdfl(year, month, 2),
      kind: 'advance',
      amount: m.advance_ndfl.toNumber(),
      ratePct,
    })
    // Окончательный расчёт попадает в 1-ю половину следующего месяца (декабрь — остаётся в году).
    const sMonth = month === 12 ? 12 : month + 1
    const sHalf: 1 | 2 = month === 12 ? 2 : 1
    entries.push({
      month: sMonth,
      half: sHalf,
      period: periodCodeNdfl(sMonth, sHalf),
      due: dueDateNdfl(year, sMonth, sHalf),
      kind: 'settlement',
      amount: m.settlement_ndfl.toNumber(),
      ratePct,
    })
  }
  return entries
}

/** Сумма всех НДФЛ-записей за год (для сверки инварианта). */
export function ndflEntriesTotal(entries: NdflPeriodEntry[]): number {
  return entries.reduce((s, e) => new Decimal(s).plus(e.amount).toNumber(), 0)
}
