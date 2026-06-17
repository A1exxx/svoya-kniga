import { describe, expect, it } from 'vitest'
import { sickBases, vacationBase12m } from './earnings'

describe('sickBases', () => {
  it('берёт два предыдущих года', () => {
    const e = { 2023: 300_000, 2024: 350_000, 2025: 400_000 }
    expect(sickBases(e, 2026)).toEqual({ e1: 400_000, e2: 350_000 })
  })
  it('недостающие годы → 0', () => {
    expect(sickBases({ 2025: 400_000 }, 2026)).toEqual({ e1: 400_000, e2: 0 })
    expect(sickBases({}, 2026)).toEqual({ e1: 0, e2: 0 })
    expect(sickBases(undefined, 2026)).toEqual({ e1: 0, e2: 0 })
  })
})

describe('vacationBase12m', () => {
  it('последний полный год (asOf-1)', () =>
    expect(vacationBase12m({ 2024: 300_000, 2025: 360_000 }, 2026)).toBe(360_000))
  it('пропуск года → ближайший более ранний', () =>
    expect(vacationBase12m({ 2023: 300_000 }, 2026)).toBe(300_000))
  it('нет данных → 0', () => expect(vacationBase12m({}, 2026)).toBe(0))
  it('будущие годы игнорируются', () =>
    expect(vacationBase12m({ 2026: 500_000, 2024: 300_000 }, 2026)).toBe(300_000))
})
