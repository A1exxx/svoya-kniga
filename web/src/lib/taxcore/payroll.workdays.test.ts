/**
 * Тесты помесячной зарплаты по рабочим дням (производственный календарь) и monthFactors.
 * Полный месяц → полный оклад; неполный → пропорционально. Паритет с Python
 * (test_payroll_workdays.py). НДФЛ остаётся нарастающим итогом.
 */
import { describe, expect, it } from 'vitest'
import { calcSalary } from './payroll.js'
import { workdaysInMonth, WORKDAYS_BY_YEAR } from './money.js'

describe('workdaysInMonth — производственный календарь (сверено)', () => {
  it('июнь 2026 = 21 рабочий день', () => expect(workdaysInMonth(2026, 6)).toBe(21))
  it('январь 2026 = 15', () => expect(workdaysInMonth(2026, 1)).toBe(15))
  it('март 2025 = 21', () => expect(workdaysInMonth(2025, 3)).toBe(21))
  it('сумма за 2026 = 247', () =>
    expect(WORKDAYS_BY_YEAR[2026].reduce((a, b) => a + b, 0)).toBe(247))
  it('сумма за 2025 = 247', () =>
    expect(WORKDAYS_BY_YEAR[2025].reduce((a, b) => a + b, 0)).toBe(247))
})

describe('calcSalary monthFactors — пропорция по отработанным дням', () => {
  const base = calcSalary(2026, 30_000, { months: 12, msp: true })

  it('полные месяцы: июнь оклад 30 000, НДФЛ 3 900, на руки 26 100', () => {
    expect(base.months[5].gross.toNumber()).toBe(30_000)
    expect(base.months[5].ndfl.toNumber()).toBe(3_900)
    expect(base.months[5].net.toNumber()).toBe(26_100)
  })

  it('factors из одних единиц == без factors (регресс)', () => {
    const r = calcSalary(2026, 30_000, { months: 12, msp: true, monthFactors: Array(12).fill(1) })
    expect(r.gross_year.toNumber()).toBe(base.gross_year.toNumber())
    expect(r.ndfl_year.toNumber()).toBe(base.ndfl_year.toNumber())
  })

  it('июнь отработан наполовину → оклад 15 000, НДФЛ 1 950, годовой доход −15 000', () => {
    const f = Array(12).fill(1)
    f[5] = 0.5
    const r = calcSalary(2026, 30_000, { months: 12, msp: true, monthFactors: f })
    expect(r.months[5].gross.toNumber()).toBe(15_000)
    expect(r.months[5].ndfl.toNumber()).toBe(1_950)
    expect(r.months[5].net.toNumber()).toBe(13_050)
    expect(r.gross_year.toNumber()).toBe(base.gross_year.toNumber() - 15_000)
  })
})
