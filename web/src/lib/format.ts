/** Форматирование денег и дат для интерфейса. */

/** "2400000" -> "2 400 000 ₽"; с копейками при kopecks=true. */
export function formatRub(
  value: number | string | null | undefined,
  opts: { kopecks?: boolean; sign?: boolean } = {},
): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return '—'
  const hasFrac = Math.abs(n % 1) > 1e-9
  const useKopecks = opts.kopecks ?? hasFrac // по умолчанию копейки только при дробной части
  const fixed = useKopecks ? Math.abs(n).toFixed(2) : Math.round(Math.abs(n)).toString()
  const [int, frac] = fixed.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : ''
  return `${sign}${grouped}${frac ? ',' + frac : ''} ₽`
}

/** "2025-04-28" -> "28.04.2025". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

/** Короткий месяц+день для бейджей: "28.04". */
export function formatDayMonth(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  if (!m || !d) return iso
  return `${d}.${m}`
}
