/**
 * Тесты базового расчёта ОСНО для ИП. Паритет с test_osno.py (Python).
 * НДФЛ — прогрессивная шкала (13% до 2.4 млн); проф.вычет = max(расходы, 20%);
 * НДС — общая ставка года (20% до 2026, 22% с 2026), в т.ч. в выручке.
 */
import { describe, expect, it } from 'vitest'
import { calcOsnoIp } from './osno.js'

describe('calcOsnoIp — проф.вычет 20% (расходы не подтверждены)', () => {
  it('2026: доход 3 млн, расходов нет → вычет 20%, база 2.4 млн, НДФЛ 312 000', () => {
    const r = calcOsnoIp(2026, 3_000_000, 0)
    expect(r.used_20pct).toBe(true)
    expect(r.professional_deduction.toNumber()).toBe(600_000)
    expect(r.ndfl_base.toNumber()).toBe(2_400_000)
    expect(r.ndfl.toNumber()).toBe(312_000)
    expect(r.vat_rate.toNumber()).toBe(22)
    // НДС в т.ч.: 3 000 000 − 3 000 000/1.22 = 540 983.61
    expect(r.vat.toNumber()).toBeCloseTo(540_983.61, 2)
    expect(r.total.toNumber()).toBeCloseTo(852_983.61, 2)
  })
})

describe('calcOsnoIp — документально подтверждённые расходы', () => {
  it('2026: доход 3 млн, расходы 1 млн → вычет 1 млн, база 2 млн, НДФЛ 260 000', () => {
    const r = calcOsnoIp(2026, 3_000_000, 1_000_000)
    expect(r.used_20pct).toBe(false)
    expect(r.professional_deduction.toNumber()).toBe(1_000_000)
    expect(r.ndfl_base.toNumber()).toBe(2_000_000)
    expect(r.ndfl.toNumber()).toBe(260_000)
  })

  it('расходы меньше 20% → берётся вычет 20% (выгоднее)', () => {
    const r = calcOsnoIp(2026, 1_000_000, 100_000)
    expect(r.used_20pct).toBe(true)
    expect(r.professional_deduction.toNumber()).toBe(200_000)
  })
})

describe('calcOsnoIp — НДС', () => {
  it('освобождение по ст.145 → НДС 0', () => {
    const r = calcOsnoIp(2026, 1_000_000, 0, { vatExempt: true })
    expect(r.vat.toNumber()).toBe(0)
    expect(r.ndfl_base.toNumber()).toBe(800_000)
    expect(r.ndfl.toNumber()).toBe(104_000)
  })

  it('2025: общая ставка НДС 20%', () => {
    const r = calcOsnoIp(2025, 1_220_000, 0)
    expect(r.vat_rate.toNumber()).toBe(20)
    // 1 220 000 − 1 220 000/1.20 = 203 333.33
    expect(r.vat.toNumber()).toBeCloseTo(203_333.33, 2)
  })
})

describe('calcOsnoIp — валидация', () => {
  it('отрицательный доход → ошибка', () => {
    expect(() => calcOsnoIp(2026, -1, 0)).toThrow()
  })
})
