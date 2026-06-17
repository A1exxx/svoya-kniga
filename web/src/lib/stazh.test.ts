import { describe, expect, it } from 'vitest'
import { computeStazh, stazhYearsFromHire, formatStazh } from './stazh'

describe('computeStazh', () => {
  it('ровно N лет (день в день)', () => {
    expect(computeStazh('2021-06-17', '2026-06-17')).toEqual({ years: 5, months: 0, totalMonths: 60 })
  })
  it('5 лет 3 мес — коэффициент 0.8', () => {
    const s = computeStazh('2021-03-15', '2026-06-17')
    expect(s).toEqual({ years: 5, months: 3, totalMonths: 63 })
  })
  it('день месяца не наступил → на месяц меньше (критичный край 4 г 11 мес, коэф 0.6)', () => {
    const s = computeStazh('2021-06-20', '2026-06-17')
    expect(s).toEqual({ years: 4, months: 11, totalMonths: 59 })
  })
  it('прежний стаж в месяцах добавляется через границу года', () => {
    // база 5 л 3 мес = 63 мес, +10 мес = 73 мес = 6 л 1 мес
    expect(computeStazh('2021-03-15', '2026-06-17', 10)).toEqual({
      years: 6,
      months: 1,
      totalMonths: 73,
    })
  })
  it('пустая дата → null', () => expect(computeStazh('', '2026-06-17')).toBeNull())
  it('некорректная дата → null', () => expect(computeStazh('не дата', '2026-06-17')).toBeNull())
  it('дата приёма в будущем → null', () =>
    expect(computeStazh('2027-01-01', '2026-06-17')).toBeNull())
  it('меньше месяца → 0 мес', () =>
    expect(computeStazh('2026-06-01', '2026-06-17')).toEqual({ years: 0, months: 0, totalMonths: 0 }))
})

describe('stazhYearsFromHire — флип коэффициента на крае 5 лет', () => {
  it('5 лет 3 мес → 5 (коэф 0.8)', () =>
    expect(stazhYearsFromHire('2021-03-15', '2026-06-17')).toBe(5))
  it('4 г 11 мес → 4 (коэф 0.6)', () =>
    expect(stazhYearsFromHire('2021-06-20', '2026-06-17')).toBe(4))
  it('нет даты → null (fallback на ручной стаж)', () =>
    expect(stazhYearsFromHire('', '2026-06-17')).toBeNull())
})

describe('formatStazh', () => {
  it('5 лет 3 мес', () =>
    expect(formatStazh({ years: 5, months: 3, totalMonths: 63 })).toBe('5 лет 3 мес'))
  it('1 год', () => expect(formatStazh({ years: 1, months: 0, totalMonths: 12 })).toBe('1 год'))
  it('2 года 1 мес', () =>
    expect(formatStazh({ years: 2, months: 1, totalMonths: 25 })).toBe('2 года 1 мес'))
  it('0 мес', () => expect(formatStazh({ years: 0, months: 0, totalMonths: 0 })).toBe('0 мес'))
  it('null → тире', () => expect(formatStazh(null)).toBe('—'))
})
