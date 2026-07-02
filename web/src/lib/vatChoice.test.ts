/** Тесты сравнения ставок НДС на УСН (подсказка выбора 5/7/22). */
import { describe, expect, it } from 'vitest'
import { compareVatOptions } from './vatChoice'

describe('compareVatOptions (2026, общая 22%)', () => {
  it('без входного НДС выгоднее 5%', () => {
    const r = compareVatOptions(2026, 30_000_000, 0)
    expect(r.best.mode).toBe('rate5')
    // 30 000 000 × 5/105 = 1 428 571.43
    expect(r.options[0].vatDue).toBeCloseTo(1_428_571.43, 2)
    // 30 000 000 × 22/122 = 5 409 836.07
    expect(r.options[2].vatDue).toBeCloseTo(5_409_836.07, 2)
  })

  it('при большом входном НДС выгоднее общая 22%', () => {
    // Исходящий 22% = 5 409 836; входной 4 500 000 → к уплате 909 836 < 1 428 571 (5%).
    const r = compareVatOptions(2026, 30_000_000, 4_500_000)
    expect(r.best.mode).toBe('general')
    expect(r.best.vatDue).toBeCloseTo(909_836.07, 2)
  })

  it('вычет не делает НДС отрицательным', () => {
    const r = compareVatOptions(2026, 1_000_000, 10_000_000)
    expect(r.options[2].vatDue).toBe(0)
  })

  it('2025: общая ставка 20%', () => {
    const r = compareVatOptions(2025, 12_000_000, 0)
    expect(r.options[2].rate).toBe(20)
    // 12 000 000 × 20/120 = 2 000 000
    expect(r.options[2].vatDue).toBe(2_000_000)
  })
})
