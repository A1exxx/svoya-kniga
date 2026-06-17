import { describe, expect, it } from 'vitest'
import {
  periodCodeNdfl,
  periodCodeContributions,
  periodCodeUsnAdvance,
  dueDateNdfl,
  dueDateContributions,
  ndflPeriodEntries,
  ndflEntriesTotal,
} from './notifications.js'
import { marginalNdflRatePct } from './notifications.js'
import { calcSalary } from './payroll.js'
import Decimal from 'decimal.js'

describe('periodCodeNdfl — коды по всем месяцам', () => {
  it('январь: 1-я половина 21/01, 2-я 21/11', () => {
    expect(periodCodeNdfl(1, 1)).toBe('21/01')
    expect(periodCodeNdfl(1, 2)).toBe('21/11')
  })
  it('февраль 2-я → 21/12, март 2-я → 21/13', () => {
    expect(periodCodeNdfl(2, 2)).toBe('21/12')
    expect(periodCodeNdfl(3, 2)).toBe('21/13')
  })
  it('апрель → 31/01, июль → 33/01, октябрь → 34/01', () => {
    expect(periodCodeNdfl(4, 1)).toBe('31/01')
    expect(periodCodeNdfl(7, 1)).toBe('33/01')
    expect(periodCodeNdfl(10, 1)).toBe('34/01')
  })
  it('декабрь 2-я половина → 34/13', () => {
    expect(periodCodeNdfl(12, 2)).toBe('34/13')
  })
})

describe('periodCodeContributions — 3-й месяц квартала пропускается', () => {
  it('январь/февраль есть, март нет', () => {
    expect(periodCodeContributions(1)).toBe('21/01')
    expect(periodCodeContributions(2)).toBe('21/02')
    expect(periodCodeContributions(3)).toBeNull()
  })
  it('все третьи месяцы кварталов → null', () => {
    expect(periodCodeContributions(6)).toBeNull()
    expect(periodCodeContributions(9)).toBeNull()
    expect(periodCodeContributions(12)).toBeNull()
  })
  it('апрель/май → 31/01, 31/02', () => {
    expect(periodCodeContributions(4)).toBe('31/01')
    expect(periodCodeContributions(5)).toBe('31/02')
  })
})

describe('periodCodeUsnAdvance', () => {
  it('кварталы → 34/01, 34/02, 34/03', () => {
    expect(periodCodeUsnAdvance(1)).toBe('34/01')
    expect(periodCodeUsnAdvance(2)).toBe('34/02')
    expect(periodCodeUsnAdvance(3)).toBe('34/03')
  })
})

describe('сроки подачи', () => {
  it('НДФЛ 1-я половина января → до 26 января 2026 (25-е вс → перенос)', () => {
    // 25.01.2026 — воскресенье, перенос на 26-е
    expect(dueDateNdfl(2026, 1, 1)).toBe('2026-01-26')
  })
  it('НДФЛ 2-я половина января → до 3 февраля', () => {
    expect(dueDateNdfl(2026, 1, 2)).toBe('2026-02-03')
  })
  it('взносы за январь → до 25 февраля', () => {
    expect(dueDateContributions(2026, 1)).toBe('2026-02-25')
  })
})

describe('marginalNdflRatePct — ступени по кумулятивному доходу', () => {
  it('до 2.4 млн → 13%', () => expect(marginalNdflRatePct(new Decimal(2_000_000))).toBe(13))
  it('2.4–5 млн → 15%', () => expect(marginalNdflRatePct(new Decimal(3_000_000))).toBe(15))
  it('5–20 млн → 18%', () => expect(marginalNdflRatePct(new Decimal(6_000_000))).toBe(18))
  it('свыше 50 млн → 22%', () => expect(marginalNdflRatePct(new Decimal(60_000_000))).toBe(22))
})

describe('ndflPeriodEntries — КБК по ступеням для высокого дохода', () => {
  const salary = calcSalary(2026, 250_000, { months: 12 }) // 3 млн/год → переход 13%→15%
  const entries = ndflPeriodEntries(salary)
  it('первый месяц — 13%', () => {
    expect(entries.find((e) => e.month === 1)?.ratePct).toBe(13)
  })
  it('есть записи со ставкой 15% (после перехода 2.4 млн)', () => {
    expect(entries.some((e) => e.ratePct === 15)).toBe(true)
  })
  it('инвариант годовой суммы сохраняется', () => {
    expect(ndflEntriesTotal(entries)).toBe(salary.ndfl_year.toNumber())
  })
})

describe('ndflPeriodEntries — инвариант годовой суммы', () => {
  it('сумма всех записей == ndfl_year (с авансом 30%)', () => {
    const salary = calcSalary(2026, 100_000, { advancePercent: 0.3, months: 12, msp: true })
    const entries = ndflPeriodEntries(salary)
    expect(ndflEntriesTotal(entries)).toBe(salary.ndfl_year.toNumber())
  })
  it('без аванса — settlement несёт весь НДФЛ, сумма == ndfl_year', () => {
    const salary = calcSalary(2026, 80_000, { months: 12 })
    const entries = ndflPeriodEntries(salary)
    expect(ndflEntriesTotal(entries)).toBe(salary.ndfl_year.toNumber())
    expect(entries.filter((e) => e.kind === 'advance').every((e) => e.amount === 0)).toBe(true)
  })
})

describe('ndflPeriodEntries — КБК на стыке ступеней разбивается верно', () => {
  // 250 000 × 12 = 3 млн/год: 2,4 млн по 13% (=312 000) + 0,6 млн по 15% (=90 000).
  const salary = calcSalary(2026, 250_000, { months: 12 })
  const entries = ndflPeriodEntries(salary)
  const sumAt = (rate: number) =>
    entries.filter((e) => e.ratePct === rate).reduce((s, e) => s + e.amount, 0)
  it('сумма по 13% == 312 000 (не уехала на 15%)', () => {
    expect(sumAt(13)).toBe(312_000)
  })
  it('сумма по 15% == 90 000', () => {
    expect(sumAt(15)).toBe(90_000)
  })
  it('итог по КБК сходится с ndfl_year', () => {
    expect(sumAt(13) + sumAt(15)).toBe(salary.ndfl_year.toNumber())
  })
})

describe('ndflPeriodEntries — тройное пересечение ступеней (13→15→18%)', () => {
  // 600 000 × 12 = 7,2 млн/год: 13% на 2,4 млн (=312 000), 15% на 2,6 млн (=390 000),
  // 18% на 2,2 млн (=396 000). Порог 5 млн пересекается в середине месяца — проверяем разбивку.
  const salary = calcSalary(2026, 600_000, { months: 12 })
  const entries = ndflPeriodEntries(salary)
  const sumAt = (rate: number) =>
    entries.filter((e) => e.ratePct === rate).reduce((s, e) => s + e.amount, 0)
  it('13% == 312 000', () => expect(sumAt(13)).toBe(312_000))
  it('15% == 390 000', () => expect(sumAt(15)).toBe(390_000))
  it('18% == 396 000', () => expect(sumAt(18)).toBe(396_000))
  it('сумма по КБК == ndfl_year', () => {
    expect(sumAt(13) + sumAt(15) + sumAt(18)).toBe(salary.ndfl_year.toNumber())
  })
})

describe('dueDateNdfl — декабрь, 2-я половина = последний рабочий день года', () => {
  it('2025: 31 декабря — нерабочий (перенос) → 30 декабря', () => {
    expect(dueDateNdfl(2025, 12, 2)).toBe('2025-12-30')
  })
  it('никогда не уезжает в следующий год', () => {
    for (const y of [2025, 2026, 2027, 2028, 2029, 2030]) {
      expect(dueDateNdfl(y, 12, 2).startsWith(String(y))).toBe(true)
    }
  })
})
