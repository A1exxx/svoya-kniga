import { describe, expect, it } from 'vitest'
import { shiftToWorkday, shiftToWorkdayBack, makeDate, dateToIso } from './money.js'

describe('shiftToWorkday — учитывает производственный календарь (праздники)', () => {
  it('1 января 2026 → первый рабочий день 12 января (каникулы 1–9 + выходные 10–11)', () => {
    expect(dateToIso(shiftToWorkday(makeDate(2026, 1, 1)))).toBe('2026-01-12')
  })
  it('1 мая 2025 → 5 мая (1–2 праздники, 3–4 выходные)', () => {
    expect(dateToIso(shiftToWorkday(makeDate(2025, 5, 1)))).toBe('2025-05-05')
  })
  it('обычный рабочий день не сдвигается', () => {
    expect(dateToIso(shiftToWorkday(makeDate(2026, 4, 15)))).toBe('2026-04-15')
  })
})

describe('shiftToWorkdayBack — последний рабочий день назад', () => {
  it('31 декабря 2025 (нерабочий, перенос) → 30 декабря', () => {
    expect(dateToIso(shiftToWorkdayBack(makeDate(2025, 12, 31)))).toBe('2025-12-30')
  })
  it('рабочий день назад не сдвигается', () => {
    expect(dateToIso(shiftToWorkdayBack(makeDate(2026, 6, 10)))).toBe('2026-06-10')
  })
})
