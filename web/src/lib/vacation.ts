/**
 * Помощники по отпуску: длительность периода и накопленные дни отпуска.
 * Отпускные считаются в taxcore (calcVacation); здесь — даты и накопление.
 */

/** Календарных дней в периоде [from, to] включительно (0 при некорректном). */
export function periodDays(from: string, to: string): number {
  const a = Date.parse(from)
  const b = Date.parse(to)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

/**
 * Для каждого дня больничного с даты `from` — число календарных дней в его месяце
 * (для МРОТ-пола пособия по ст. 6.1 ФЗ № 255-ФЗ при переходе через границу месяца).
 */
export function sickDayFloors(from: string, days: number): number[] {
  const [y, m, d] = (from || '').split('-').map(Number)
  if (!y || !m || !d || days <= 0) return []
  const out: number[] = []
  for (let i = 0; i < days; i++) {
    const dt = new Date(y, m - 1, d + i)
    out.push(new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate())
  }
  return out
}

/** Полных месяцев работы с даты приёма по asOf (за полный год = 12). */
export function monthsWorked(hireDate: string, asOf: Date): number {
  if (!hireDate) return 0
  const h = new Date(hireDate + 'T00:00:00')
  if (isNaN(h.getTime()) || h > asOf) return 0
  let m = (asOf.getFullYear() - h.getFullYear()) * 12 + (asOf.getMonth() - h.getMonth())
  if (asOf.getDate() < h.getDate()) m -= 1
  return Math.max(0, m)
}

/**
 * Накоплено дней отпуска: 28 дней/год (2,33 дн/мес) пропорционально отработанным месяцам
 * с даты приёма, минус уже использованные дни оплачиваемого отпуска. Округление вниз.
 */
export function accruedVacationDays(hireDate: string, asOf: Date, usedDays = 0): number {
  const months = monthsWorked(hireDate, asOf)
  const accrued = Math.floor((28 / 12) * months)
  return Math.max(0, accrued - Math.max(0, usedDays))
}
