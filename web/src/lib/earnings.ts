/**
 * Заработок сотрудника по годам → базы для отпускных и больничных.
 *
 * Больничный считается от заработка за 2 предыдущих календарных года (ст. 14 ФЗ № 255-ФЗ).
 * Отпускные — от заработка за расчётный период (приближённо берём последний полный год;
 * точный период 12 мес. бухгалтер может скорректировать вручную в поле базы).
 */

export type EarningsByYear = Record<number, number>

/** Базы для больничного: заработок за 2 предыдущих года относительно года страхового случая. */
export function sickBases(earnings: EarningsByYear | undefined, year: number): { e1: number; e2: number } {
  const e = earnings ?? {}
  return { e1: e[year - 1] ?? 0, e2: e[year - 2] ?? 0 }
}

/**
 * База для отпускных (приближение): заработок за последний полный год до asOfYear.
 * Берём asOfYear-1, если есть, иначе ближайший более ранний год с данными, иначе 0.
 * Это документированное приближение — поле в UI остаётся редактируемым.
 */
export function vacationBase12m(earnings: EarningsByYear | undefined, asOfYear: number): number {
  const e = earnings ?? {}
  if (e[asOfYear - 1] != null) return e[asOfYear - 1]
  const earlier = Object.keys(e)
    .map(Number)
    .filter((y) => y < asOfYear)
    .sort((a, b) => b - a)
  return earlier.length ? e[earlier[0]] : 0
}
