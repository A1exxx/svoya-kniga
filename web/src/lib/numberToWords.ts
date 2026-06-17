/** Сумма прописью на русском (рубли + копейки) — для счетов и актов. */

const ONES = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const TEENS = [
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать',
]
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

/** Выбор словоформы по числу: 1 рубль / 2 рубля / 5 рублей. */
export function plural(n: number, one: string, few: string, many: string): string {
  const n100 = Math.abs(n) % 100
  const n10 = n100 % 10
  if (n100 >= 11 && n100 <= 14) return many
  if (n10 === 1) return one
  if (n10 >= 2 && n10 <= 4) return few
  return many
}

/** Группа 0–999 в слова. `feminine` — для тысяч (одна, две). */
function group(n: number, feminine: boolean): string {
  const parts: string[] = []
  parts.push(HUNDREDS[Math.floor(n / 100)])
  const rem = n % 100
  if (rem >= 10 && rem <= 19) {
    parts.push(TEENS[rem - 10])
  } else {
    parts.push(TENS[Math.floor(rem / 10)])
    parts.push((feminine ? ONES_F : ONES)[rem % 10])
  }
  return parts.filter(Boolean).join(' ')
}

const SCALES: { fem: boolean; one: string; few: string; many: string }[] = [
  { fem: false, one: '', few: '', many: '' }, // единицы
  { fem: true, one: 'тысяча', few: 'тысячи', many: 'тысяч' },
  { fem: false, one: 'миллион', few: 'миллиона', many: 'миллионов' },
  { fem: false, one: 'миллиард', few: 'миллиарда', many: 'миллиардов' },
  { fem: false, one: 'триллион', few: 'триллиона', many: 'триллионов' },
]

/** Целое число в слова (по-русски). */
export function intToWords(num: number): string {
  if (num === 0) return 'ноль'
  let n = Math.floor(Math.abs(num))
  const groups: number[] = []
  while (n > 0) {
    groups.push(n % 1000)
    n = Math.floor(n / 1000)
  }
  const out: string[] = []
  for (let g = groups.length - 1; g >= 0; g--) {
    const val = groups[g]
    if (val === 0) continue
    const sc = SCALES[g]
    out.push(group(val, sc.fem))
    if (g > 0) out.push(plural(val, sc.one, sc.few, sc.many))
  }
  return out.filter(Boolean).join(' ')
}

/**
 * Сумма прописью: «Сто двадцать три рубля 45 копеек» (с заглавной буквы).
 * Копейки — цифрами в 2 знака (как принято в первичке).
 */
export function rublesToWords(amount: number): string {
  const abs = Math.abs(amount)
  const rub = Math.floor(abs)
  const kop = Math.round((abs - rub) * 100)
  // граничный случай: округление дало 100 копеек
  const rubFixed = kop === 100 ? rub + 1 : rub
  const kopFixed = kop === 100 ? 0 : kop
  const words = intToWords(rubFixed)
  const cap = words.charAt(0).toUpperCase() + words.slice(1)
  const rubUnit = plural(rubFixed, 'рубль', 'рубля', 'рублей')
  const kopUnit = plural(kopFixed, 'копейка', 'копейки', 'копеек')
  return `${cap} ${rubUnit} ${String(kopFixed).padStart(2, '0')} ${kopUnit}`
}
