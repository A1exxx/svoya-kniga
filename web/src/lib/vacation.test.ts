import { describe, expect, it } from 'vitest'
import { periodDays, monthsWorked, accruedVacationDays } from './vacation'

describe('periodDays', () => {
  it('считает дни включительно', () => expect(periodDays('2026-06-01', '2026-06-14')).toBe(14))
  it('один день = 1', () => expect(periodDays('2026-06-01', '2026-06-01')).toBe(1))
  it('обратный/пустой период → 0', () => {
    expect(periodDays('2026-06-10', '2026-06-01')).toBe(0)
    expect(periodDays('', '2026-06-01')).toBe(0)
  })
})

describe('monthsWorked / accruedVacationDays', () => {
  it('ровно год работы = 12 месяцев', () =>
    expect(monthsWorked('2025-06-18', new Date('2026-06-18T00:00:00'))).toBe(12))
  it('за полный год накоплено 28 дней отпуска', () =>
    expect(accruedVacationDays('2025-06-18', new Date('2026-06-18T00:00:00'))).toBe(28))
  it('минус использованные дни', () =>
    expect(accruedVacationDays('2025-06-18', new Date('2026-06-18T00:00:00'), 14)).toBe(14))
  it('нет даты приёма → 0', () => expect(accruedVacationDays('', new Date())).toBe(0))
  it('будущая дата приёма → 0', () =>
    expect(accruedVacationDays('2030-01-01', new Date('2026-06-18T00:00:00'))).toBe(0))
})
