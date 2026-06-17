/**
 * Расчёт страхового стажа по дате приёма на работу.
 *
 * Страховой стаж определяет коэффициент больничного (до 5 лет — 60%, 5–8 — 80%,
 * ≥8 — 100%), поэтому это селектор коэффициента, а не денежная формула —
 * реализуем только на TS (calc_sick_leave уже принимает stazh_years).
 *
 * Календарная математика: полные годы и месяцы от даты приёма до даты «на момент».
 * Если день месяца ещё не наступил — месяц не засчитывается (как в кадровом учёте).
 */

interface Ymd {
  y: number
  m: number // 1..12
  d: number
}

function parseYmd(s: string | undefined | null): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? '').trim())
  if (!m) return null
  const y = +m[1]
  const mo = +m[2]
  const d = +m[3]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

function todayYmd(): Ymd {
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
}

/** a < b по календарю (год-месяц-день). */
function isBefore(a: Ymd, b: Ymd): boolean {
  if (a.y !== b.y) return a.y < b.y
  if (a.m !== b.m) return a.m < b.m
  return a.d < b.d
}

export interface Stazh {
  years: number
  months: number
  totalMonths: number
}

/**
 * Полный стаж от даты приёма (hireDate, YYYY-MM-DD) до asOf (по умолчанию — сегодня),
 * плюс опциональный прежний стаж в месяцах (priorMonths).
 * Возвращает null, если дата приёма пустая/некорректная или в будущем.
 */
export function computeStazh(hireDate: string, asOf?: string, priorMonths = 0): Stazh | null {
  const hire = parseYmd(hireDate)
  if (!hire) return null
  const now = asOf ? parseYmd(asOf) : todayYmd()
  if (!now) return null
  if (isBefore(now, hire)) return null // дата приёма в будущем

  let years = now.y - hire.y
  let months = now.m - hire.m
  if (now.d < hire.d) months -= 1 // день месяца ещё не наступил
  if (months < 0) {
    years -= 1
    months += 12
  }

  const prior = Math.max(0, Math.round(priorMonths))
  const total = years * 12 + months + prior
  return { years: Math.floor(total / 12), months: total % 12, totalMonths: total }
}

/**
 * Эффективное число полных лет стажа для коэффициента больничного.
 * Возвращает null, если дату приёма посчитать нельзя (тогда берём ручной stazhYears).
 */
export function stazhYearsFromHire(
  hireDate: string,
  asOf?: string,
  priorMonths = 0
): number | null {
  const s = computeStazh(hireDate, asOf, priorMonths)
  return s ? s.years : null
}

function pluralYears(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'год'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'года'
  return 'лет'
}

/** «5 лет 3 мес», «1 год», «0 мес». */
export function formatStazh(s: Stazh | null): string {
  if (!s) return '—'
  const parts: string[] = []
  if (s.years > 0) parts.push(`${s.years} ${pluralYears(s.years)}`)
  if (s.months > 0 || s.years === 0) parts.push(`${s.months} мес`)
  return parts.join(' ')
}
