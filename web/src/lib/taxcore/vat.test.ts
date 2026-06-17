/**
 * Тесты НДС для УСН. Пороги и общая ставка зависят от года:
 *   2025 — освобождение ≤60 млн, общая 20% (ФЗ № 176-ФЗ);
 *   2026 — освобождение ≤20 млн, общая 22% (ФЗ № 425-ФЗ).
 * Эталон совпадает с test_vat.py (Python).
 */
import { describe, expect, it } from 'vitest'
import { calcVatUsn } from './vat.js'
import { getParams } from './params.js'

describe('НДС-параметры по годам', () => {
  it('2025: порог 60 млн, общая 20%', () => {
    const p = getParams(2025)
    expect(p.vat_exempt_threshold.toNumber()).toBe(60_000_000)
    expect(p.vat_general_rate.toNumber()).toBe(20)
  })
  it('2026: порог 20 млн, общая 22% (ФЗ-425)', () => {
    const p = getParams(2026)
    expect(p.vat_exempt_threshold.toNumber()).toBe(20_000_000)
    expect(p.vat_general_rate.toNumber()).toBe(22)
  })
})

describe('calcVatUsn — освобождение', () => {
  it('2025: доход 50 млн → освобождение, НДС 0', () => {
    const r = calcVatUsn(2025, 50_000_000)
    expect(r.exempt).toBe(true)
    expect(r.obligated).toBe(false)
    expect(r.vat.toNumber()).toBe(0)
  })
  it('2025: ровно 60 млн → ещё освобождение', () => {
    expect(calcVatUsn(2025, 60_000_000).exempt).toBe(true)
  })
  it('2026: 15 млн → освобождение (порог 20 млн)', () => {
    expect(calcVatUsn(2026, 15_000_000).exempt).toBe(true)
  })
  it('2026: 25 млн → уже плательщик (порог снижен до 20 млн)', () => {
    const r = calcVatUsn(2026, 25_000_000, { mode: 'auto' })
    expect(r.exempt).toBe(false)
    expect(r.rate.toNumber()).toBe(5)
  })
  it('режим none при доходе 100 млн → НДС 0', () => {
    const r = calcVatUsn(2026, 100_000_000, { mode: 'none' })
    expect(r.vat.toNumber()).toBe(0)
    expect(r.mode).toBe('none')
  })
})

describe('calcVatUsn — спец-ставки 5/7', () => {
  it('100 млн с НДС, авто → 5%, НДС 4 761 905', () => {
    const r = calcVatUsn(2026, 100_000_000, { mode: 'auto', incomeIncludesVat: true })
    expect(r.rate.toNumber()).toBe(5)
    expect(r.mode).toBe('rate5')
    expect(r.vat.toNumber()).toBe(4_761_905)
    expect(r.base.toNumber()).toBe(95_238_095)
  })
  it('100 млн без НДС → НДС 5% сверху = 5 000 000', () => {
    const r = calcVatUsn(2026, 100_000_000, { mode: 'auto', incomeIncludesVat: false })
    expect(r.vat.toNumber()).toBe(5_000_000)
  })
  it('300 млн авто → 7% (выше границы 5%)', () => {
    const r = calcVatUsn(2026, 300_000_000, { mode: 'auto', incomeIncludesVat: true })
    expect(r.rate.toNumber()).toBe(7)
    expect(r.mode).toBe('rate7')
  })
})

describe('calcVatUsn — общая ставка по году', () => {
  it('2025 general → 20%, вычет 5 млн (НДС 11 666 667)', () => {
    const r = calcVatUsn(2025, 100_000_000, {
      mode: 'general',
      incomeIncludesVat: true,
      inputVat: 5_000_000,
    })
    expect(r.rate.toNumber()).toBe(20)
    expect(r.vat.toNumber()).toBe(11_666_667)
    expect(r.input_vat_deducted.toNumber()).toBe(5_000_000)
  })
  it('2026 general → 22% (НДС 18 032 787 без вычета)', () => {
    const r = calcVatUsn(2026, 100_000_000, { mode: 'general', incomeIncludesVat: true })
    expect(r.rate.toNumber()).toBe(22)
    expect(r.base.toNumber()).toBe(81_967_213)
    expect(r.vat.toNumber()).toBe(18_032_787)
  })
  it('алиас general20 = общая ставка года (2026 → 22%)', () => {
    expect(calcVatUsn(2026, 100_000_000, { mode: 'general20' }).rate.toNumber()).toBe(22)
  })
  it('ставка 10% (льготные товары) — с вычетом', () => {
    const r = calcVatUsn(2026, 110_000_000, { mode: 'rate10', incomeIncludesVat: true })
    expect(r.rate.toNumber()).toBe(10)
    expect(r.vat.toNumber()).toBe(10_000_000)
  })
  it('вычет больше исходящего → НДС 0 (не отрицательный)', () => {
    const r = calcVatUsn(2025, 70_000_000, {
      mode: 'general',
      incomeIncludesVat: true,
      inputVat: 50_000_000,
    })
    expect(r.vat.toNumber()).toBe(0)
  })
})

describe('calcVatUsn — прочее', () => {
  it('прошлый год 80 млн → обязанность по НДС', () => {
    const r = calcVatUsn(2025, 40_000_000, { priorYearIncome: 80_000_000, mode: 'auto' })
    expect(r.obligated).toBe(true)
    expect(r.rate.toNumber()).toBe(5)
  })
  it('отрицательный доход → ошибка', () => {
    expect(() => calcVatUsn(2026, -1)).toThrow()
  })
  it('2025: доход >450 млн → УСН утрачена (usn_lost)', () => {
    const r = calcVatUsn(2025, 500_000_000, { mode: 'auto' })
    expect(r.mode).toBe('usn_lost')
    expect(r.vat.toNumber()).toBe(0)
  })
  it('ручной 5% при доходе ниже порога → освобождение', () => {
    expect(calcVatUsn(2025, 50_000_000, { mode: 'rate5' }).exempt).toBe(true)
  })
  it('ручной 5% при доходе 300 млн → ставка по закону 7% (не занижается)', () => {
    expect(calcVatUsn(2026, 300_000_000, { mode: 'rate5' }).rate.toNumber()).toBe(7)
  })
})
