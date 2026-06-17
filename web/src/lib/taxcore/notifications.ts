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
import { shiftToWorkday, dateToIso, makeDate, roundRub } from './money.js'
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
  // вторая половина — до 3 числа следующего месяца; декабрь (23–31) — последний рабочий день года.
  if (month === 12) {
    const d = makeDate(year, 12, 31)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
    return dateToIso(d)
  }
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
 * Разложить НДФЛ полупериода по ступеням прогрессии. Полоса кумулятивной базы [lo, hi]
 * может пересекать порог (2,4 млн и др.) — тогда часть налога идёт по 13%, часть по 15% и т.д.,
 * на РАЗНЫЕ КБК. Возвращаем по одной доле на каждую затронутую ступень.
 *
 * Итог привязан к точной сумме НДФЛ полупериода (`exactTotal` = advance_ndfl/settlement_ndfl
 * из payroll), поэтому суммарно инвариант «Σ == ndfl_year» держится копейка-в-копейку:
 * доли распределяются пропорционально, остаток округления вешается на крупнейшую ступень.
 */
function splitByTier(
  lo: Decimal,
  hi: Decimal,
  exactTotal: Decimal
): Array<{ ratePct: number; amount: Decimal }> {
  if (hi.lte(lo) || exactTotal.lte(0)) {
    return [{ ratePct: marginalNdflRatePct(hi), amount: exactTotal }]
  }
  const raw: Array<{ ratePct: number; tax: Decimal }> = []
  let lower = new Decimal(0)
  for (const [upper, rate] of NDFL_TIERS) {
    const segLo = Decimal.max(lo, lower)
    const segHi = upper === null ? hi : Decimal.min(hi, upper)
    const width = segHi.minus(segLo)
    if (width.gt(0)) raw.push({ ratePct: rate.times(100).toNumber(), tax: width.times(rate) })
    if (upper !== null) {
      lower = upper
      if (hi.lte(upper)) break
    }
  }
  if (raw.length <= 1) {
    return [{ ratePct: raw[0]?.ratePct ?? marginalNdflRatePct(hi), amount: exactTotal }]
  }
  const rawSum = raw.reduce((s, r) => s.plus(r.tax), new Decimal(0))
  const out = raw.map((r) => ({ ratePct: r.ratePct, amount: roundRub(exactTotal.times(r.tax).div(rawSum)) }))
  // Остаток от округления — на ступень с наибольшей долей (инвариант суммы точный).
  const assigned = out.reduce((s, r) => s.plus(r.amount), new Decimal(0))
  const residual = exactTotal.minus(assigned)
  if (!residual.isZero()) {
    let maxI = 0
    for (let i = 1; i < out.length; i++) if (out[i].amount.gt(out[maxI].amount)) maxI = i
    out[maxI].amount = out[maxI].amount.plus(residual)
  }
  return out
}

/**
 * Разбивка годового НДФЛ сотрудника по периодам уведомлений и КБК (ступеням).
 * Аванс (выплата ~25 числа) → 2-я половина месяца M; окончательный расчёт (выплата ~5–10 числа
 * след. месяца) → 1-я половина месяца M+1. Декабрьский расчёт остаётся в декабре (код 34/13).
 * В месяц пересечения порога ступени запись расщепляется на две (13%→КБК.., 15%→КБК..).
 * Инвариант: сумма amount по всем записям == ndfl_year (декомпозиция, не новый итог).
 */
export function ndflPeriodEntries(salary: SalaryResult): NdflPeriodEntry[] {
  const entries: NdflPeriodEntry[] = []
  const year = salary.year
  let cumTaxable = new Decimal(0) // кумулятивная база НДФЛ с начала года
  for (const m of salary.months) {
    const month = m.month
    // Аванс облагается без детского вычета (вычет применяется на расчёте, как в 1С).
    const advLo = cumTaxable
    const advHi = advLo.plus(m.advance_gross)
    // Расчётная часть — остаток базы месяца за вычетом детского вычета.
    const setLo = advHi
    let setHi = cumTaxable.plus(m.gross).minus(m.deduction_applied)
    if (setHi.lt(setLo)) setHi = setLo
    cumTaxable = Decimal.max(setHi, advHi)

    const sMonth = month === 12 ? 12 : month + 1
    const sHalf: 1 | 2 = month === 12 ? 2 : 1
    for (const part of splitByTier(advLo, advHi, m.advance_ndfl)) {
      entries.push({
        month,
        half: 2,
        period: periodCodeNdfl(month, 2),
        due: dueDateNdfl(year, month, 2),
        kind: 'advance',
        amount: part.amount.toNumber(),
        ratePct: part.ratePct,
      })
    }
    for (const part of splitByTier(setLo, setHi, m.settlement_ndfl)) {
      entries.push({
        month: sMonth,
        half: sHalf,
        period: periodCodeNdfl(sMonth, sHalf),
        due: dueDateNdfl(year, sMonth, sHalf),
        kind: 'settlement',
        amount: part.amount.toNumber(),
        ratePct: part.ratePct,
      })
    }
  }
  return entries
}

/** Сумма всех НДФЛ-записей за год (для сверки инварианта). */
export function ndflEntriesTotal(entries: NdflPeriodEntry[]): number {
  return entries.reduce((s, e) => new Decimal(s).plus(e.amount).toNumber(), 0)
}
