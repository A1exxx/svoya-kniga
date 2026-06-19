import { describe, it, expect } from 'vitest'
import { workdaysOfPeriodsInMonth } from './vacation'

describe('workdaysOfPeriodsInMonth — рабочие дни отсутствия (больничный/отпуск б/о) в месяце', () => {
  it('новогодние каникулы → 0 рабочих дней в январе', () => {
    // 2026-01-01..09: всё праздники или выходные → 0.
    expect(workdaysOfPeriodsInMonth([{ from: '2026-01-01', to: '2026-01-09' }], 2026, 0)).toBe(0)
  })

  it('обычная рабочая неделя пн–пт → 5', () => {
    // 2026-02-02 (пн) .. 2026-02-06 (пт), праздников нет.
    expect(workdaysOfPeriodsInMonth([{ from: '2026-02-02', to: '2026-02-06' }], 2026, 1)).toBe(5)
  })

  it('выходные не считаются', () => {
    // 2026-02-07 (сб) .. 2026-02-08 (вс) → 0.
    expect(workdaysOfPeriodsInMonth([{ from: '2026-02-07', to: '2026-02-08' }], 2026, 1)).toBe(0)
  })

  it('праздник (23 февраля) не считается рабочим', () => {
    expect(workdaysOfPeriodsInMonth([{ from: '2026-02-23', to: '2026-02-23' }], 2026, 1)).toBe(0)
  })

  it('период учитывается только в своём месяце (фильтр по месяцу)', () => {
    // Февральский период не даёт дней в январе.
    expect(workdaysOfPeriodsInMonth([{ from: '2026-02-02', to: '2026-02-06' }], 2026, 0)).toBe(0)
  })

  it('переход через границу месяца считается по каждому месяцу отдельно', () => {
    const periods = [{ from: '2026-02-27', to: '2026-03-03' }]
    // Февраль: 27 (пт) = 1 рабочий (28 сб). Март: 1 (вс), 2 (пн), 3 (вт) = 2 рабочих.
    expect(workdaysOfPeriodsInMonth(periods, 2026, 1)).toBe(1)
    expect(workdaysOfPeriodsInMonth(periods, 2026, 2)).toBe(2)
  })

  it('несколько периодов суммируются', () => {
    const periods = [
      { from: '2026-02-02', to: '2026-02-03' }, // пн, вт = 2
      { from: '2026-02-05', to: '2026-02-05' }, // чт = 1
    ]
    expect(workdaysOfPeriodsInMonth(periods, 2026, 1)).toBe(3)
  })

  it('некорректный период (to < from) → 0', () => {
    expect(workdaysOfPeriodsInMonth([{ from: '2026-02-10', to: '2026-02-01' }], 2026, 1)).toBe(0)
  })
})
