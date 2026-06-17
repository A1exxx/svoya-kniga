/**
 * Тесты разбивки зарплаты на аванс и окончательный расчёт с отдельным НДФЛ.
 * Ключевой инвариант: ndfl === advance_ndfl + settlement_ndfl (декомпозиция, не новый итог).
 * Эталон совпадает с Python (test_payroll_advance.py).
 */
import { describe, expect, it } from 'vitest'
import { calcSalary } from './payroll.js'

describe('calcSalary — аванс 30% от 100 000', () => {
  const r = calcSalary(2026, 100_000, { advancePercent: 0.3, months: 1, msp: true })
  const m = r.months[0]

  it('аванс gross = 30 000', () => expect(m.advance_gross.toNumber()).toBe(30_000))
  it('НДФЛ с аванса = 3 900 (13% от 30 000)', () =>
    expect(m.advance_ndfl.toNumber()).toBe(3_900))
  it('аванс на руки = 26 100', () => expect(m.advance_net.toNumber()).toBe(26_100))
  it('расчёт gross = 70 000', () => expect(m.settlement_gross.toNumber()).toBe(70_000))
  it('НДФЛ с расчёта = 9 100', () => expect(m.settlement_ndfl.toNumber()).toBe(9_100))
  it('расчёт на руки = 60 900', () => expect(m.settlement_net.toNumber()).toBe(60_900))
  it('ИНВАРИАНТ: аванс-НДФЛ + расчёт-НДФЛ == месячный НДФЛ (13 000)', () => {
    expect(m.advance_ndfl.plus(m.settlement_ndfl).toNumber()).toBe(m.ndfl.toNumber())
    expect(m.ndfl.toNumber()).toBe(13_000)
  })
  it('аванс на руки + расчёт на руки == net', () =>
    expect(m.advance_net.plus(m.settlement_net).toNumber()).toBe(m.net.toNumber()))
})

describe('calcSalary — оклад 250 000, аванс 40%, через порог 2.4 млн', () => {
  const r = calcSalary(2026, 250_000, { advancePercent: 0.4, months: 12, msp: true })

  it('годовой НДФЛ не изменился: 402 000 (3 млн: 2.4М×13% + 0.6М×15%)', () =>
    expect(r.ndfl_year.toNumber()).toBe(402_000))
  it('сумма годовых аванс+расчёт НДФЛ == годовой НДФЛ', () =>
    expect(r.advance_ndfl_year.plus(r.settlement_ndfl_year).toNumber()).toBe(
      r.ndfl_year.toNumber()
    ))
  it('инвариант выполняется в КАЖДОМ месяце (включая месяц перехода ступени)', () => {
    for (const m of r.months) {
      expect(m.advance_ndfl.plus(m.settlement_ndfl).toNumber()).toBe(m.ndfl.toNumber())
      expect(m.advance_gross.plus(m.settlement_gross).toNumber()).toBe(m.gross.toNumber())
    }
  })
})

describe('calcSalary — advancePercent 0 → прежнее поведение (регресс)', () => {
  const r = calcSalary(2026, 100_000, { advancePercent: 0, months: 12, msp: true })
  it('аванс пустой во всех месяцах', () => {
    for (const m of r.months) {
      expect(m.advance_gross.toNumber()).toBe(0)
      expect(m.advance_ndfl.toNumber()).toBe(0)
      expect(m.settlement_ndfl.toNumber()).toBe(m.ndfl.toNumber())
    }
  })
  it('без опции advancePercent — тоже пусто (дефолт)', () => {
    const r2 = calcSalary(2026, 100_000, { months: 1 })
    expect(r2.months[0].advance_gross.toNumber()).toBe(0)
    expect(r2.months[0].settlement_ndfl.toNumber()).toBe(r2.months[0].ndfl.toNumber())
  })
})

describe('calcSalary — аванс + детский вычет одновременно (ранее непокрытый угол)', () => {
  // Вычет применяется на этапе расчёта (как 1С), не на авансе. Инвариант и годовой итог
  // не должны измениться от наличия аванса.
  const withAdv = calcSalary(2026, 250_000, { advancePercent: 0.3, children: 2, months: 12 })
  const noAdv = calcSalary(2026, 250_000, { advancePercent: 0, children: 2, months: 12 })

  it('инвариант аванс+расчёт==НДФЛ в каждом месяце', () => {
    for (const m of withAdv.months) {
      expect(m.advance_ndfl.plus(m.settlement_ndfl).toNumber()).toBe(m.ndfl.toNumber())
    }
  })
  it('годовой НДФЛ не зависит от наличия аванса (вычет не двоится)', () => {
    expect(withAdv.ndfl_year.toNumber()).toBe(noAdv.ndfl_year.toNumber())
  })
  it('детский вычет применён (НДФЛ меньше, чем без детей)', () => {
    const noKids = calcSalary(2026, 250_000, { advancePercent: 0.3, children: 0, months: 12 })
    expect(withAdv.ndfl_year.toNumber()).toBeLessThan(noKids.ndfl_year.toNumber())
  })
})
