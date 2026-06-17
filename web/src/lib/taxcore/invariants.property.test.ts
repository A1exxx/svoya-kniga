/**
 * Property-тесты (fast-check) на ключевые инварианты расчётов — ловят регрессии на
 * случайных входных данных, а не только на фиксированных сценариях.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { calcSalary, calcVatUsn, ndflPeriodEntries, ndflEntriesTotal } from './index.js'

describe('Инвариант НДФЛ: аванс + расчёт == месячный НДФЛ (любой оклад/аванс)', () => {
  it('держится на случайных данных', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3_000_000 }),
        fc.integer({ min: 0, max: 100 }),
        (gross, advPct) => {
          const r = calcSalary(2026, gross, { advancePercent: advPct / 100, months: 12 })
          for (const m of r.months) {
            expect(m.advance_ndfl.plus(m.settlement_ndfl).toNumber()).toBe(m.ndfl.toNumber())
            expect(m.advance_gross.plus(m.settlement_gross).toNumber()).toBe(m.gross.toNumber())
            expect(m.advance_ndfl.toNumber()).toBeGreaterThanOrEqual(0)
            expect(m.settlement_ndfl.toNumber()).toBeGreaterThanOrEqual(0)
          }
        }
      ),
      { numRuns: 200 }
    )
  })
})

describe('Инвариант уведомлений: сумма НДФЛ-строк за год == ndfl_year', () => {
  it('держится на случайных данных', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3_000_000 }),
        fc.integer({ min: 0, max: 100 }),
        (gross, advPct) => {
          const r = calcSalary(2026, gross, { advancePercent: advPct / 100, months: 12 })
          expect(ndflEntriesTotal(ndflPeriodEntries(r))).toBe(r.ndfl_year.toNumber())
        }
      ),
      { numRuns: 200 }
    )
  })
})

describe('Инвариант НДС: база + налог == выручка (с НДС), налог ≥ 0', () => {
  it('держится для 2026 (ставка 22% и спец-ставки)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 600_000_000 }), (income) => {
        for (const mode of ['auto', 'general', 'none'] as const) {
          const r = calcVatUsn(2026, income, { mode, incomeIncludesVat: true })
          expect(r.vat.toNumber()).toBeGreaterThanOrEqual(0)
          if (!r.exempt && r.mode !== 'usn_lost') {
            // База и налог округляются независимо — допускаем расхождение ≤ 1 ₽.
            const diff = Math.abs(r.base.plus(r.vat).toNumber() - Math.round(income))
            expect(diff).toBeLessThanOrEqual(1)
          }
        }
      }),
      { numRuns: 200 }
    )
  })
})
