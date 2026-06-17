/**
 * Валидация российских реквизитов с контрольными суммами.
 * Каждая функция возвращает `null`, если значение пустое или КОРРЕКТНОЕ,
 * иначе — строку с ошибкой (для подсказки под полем). Пустое поле не считается ошибкой
 * (поля не обязательны), но даёт «чистоту данных» при заполнении.
 */

const digits = (s: string) => (s || '').replace(/\D/g, '')

/** ИНН: 10 знаков (организация) или 12 (ИП/физлицо) с проверкой контрольных цифр. */
export function validateInn(value: string): string | null {
  const inn = digits(value)
  if (inn.length === 0) return null
  if (inn.length !== 10 && inn.length !== 12) return 'ИНН: 10 цифр (организация) или 12 (ИП)'
  const d = inn.split('').map(Number)
  const csum = (weights: number[]) =>
    (weights.reduce((s, w, i) => s + w * d[i], 0) % 11) % 10
  if (inn.length === 10) {
    return csum([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9] ? null : 'ИНН: неверная контрольная цифра'
  }
  const c11 = csum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
  const c12 = csum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
  return c11 === d[10] && c12 === d[11] ? null : 'ИНН: неверные контрольные цифры'
}

/** ОКТМО: 8 или 11 цифр. */
export function validateOktmo(value: string): string | null {
  const o = digits(value)
  if (o.length === 0) return null
  return o.length === 8 || o.length === 11 ? null : 'ОКТМО: 8 или 11 цифр'
}

/** КПП: 9 знаков (для ИП — пусто). */
export function validateKpp(value: string): string | null {
  const v = (value || '').trim()
  if (v.length === 0) return null
  return /^\d{4}[\dA-Z]{2}\d{3}$/.test(v) ? null : 'КПП: 9 знаков'
}

/** СНИЛС: 11 цифр с проверкой контрольного числа. */
export function validateSnils(value: string): string | null {
  const s = digits(value)
  if (s.length === 0) return null
  if (s.length !== 11) return 'СНИЛС: 11 цифр'
  const d = s.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 9; i++) sum += d[i] * (9 - i)
  let control = sum % 101
  if (control === 100) control = 0
  if (sum < 100) control = sum
  else if (sum === 100 || sum === 101) control = 0
  const given = d[9] * 10 + d[10]
  return control === given ? null : 'СНИЛС: неверная контрольная сумма'
}

/** ОГРНИП: 15 цифр (лёгкая проверка длины + контрольная цифра). */
export function validateOgrnip(value: string): string | null {
  const o = digits(value)
  if (o.length === 0) return null
  if (o.length !== 15) return 'ОГРНИП: 15 цифр'
  const base = BigInt(o.slice(0, 14))
  const control = Number(base % 13n) % 10
  return control === Number(o[14]) ? null : 'ОГРНИП: неверная контрольная цифра'
}
