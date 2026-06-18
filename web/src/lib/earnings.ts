/**
 * Заработок сотрудника по годам ПО МЕСЯЦАМ → базы для отпускных и больничных.
 *
 * Оклад мог меняться в середине года, поэтому храним по 12 месяцев (январь..декабрь) на каждый год.
 * Больничный — от заработка за 2 предыдущих календарных года (ст. 14 ФЗ № 255-ФЗ).
 * Отпускные — от заработка за расчётный период (приближённо последний полный год).
 */

/** 12 значений: январь..декабрь. Неполный массив допустим (недостающие = 0). */
export type MonthEarnings = number[]
/** Канонический тип хранения (Employee.earningsByYear). */
export type EarningsByYear = Record<number, MonthEarnings>
/** Входной тип функций — терпим к легаси-числу (одно значение на год) и к массиву месяцев. */
export type EarningsInput = Record<number, number | number[]>

/** Сумма заработка за год. Терпимо к легаси-числу (одно значение на год) и неполному массиву. */
export function yearTotal(v: number | number[] | undefined | null): number {
  if (v == null) return 0
  if (Array.isArray(v)) return v.reduce((s, x) => s + (Number(x) || 0), 0)
  return Number(v) || 0
}

/** Базы для больничного: заработок за 2 предыдущих года относительно года страхового случая. */
export function sickBases(
  earnings: EarningsInput | undefined,
  year: number
): { e1: number; e2: number } {
  const e = earnings ?? {}
  return { e1: yearTotal(e[year - 1]), e2: yearTotal(e[year - 2]) }
}

/**
 * База для отпускных (приближение): заработок за последний полный год до asOfYear.
 * Берём asOfYear-1, если есть, иначе ближайший более ранний год с данными, иначе 0.
 */
export function vacationBase12m(earnings: EarningsInput | undefined, asOfYear: number): number {
  const e = earnings ?? {}
  if (e[asOfYear - 1] != null) return yearTotal(e[asOfYear - 1])
  const earlier = Object.keys(e)
    .map(Number)
    .filter((y) => y < asOfYear)
    .sort((a, b) => b - a)
  return earlier.length ? yearTotal(e[earlier[0]]) : 0
}
