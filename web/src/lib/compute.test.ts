/** Тесты единого расчёта compute() — годовой и поквартальный режимы. */
import { describe, expect, it } from 'vitest'
import { compute } from './compute'
import type { Org } from '../state/orgStore'
import type { Operation } from '../state/opsStore'

function makeOrg(patch: Partial<Org> = {}): Org {
  return {
    id: 'test',
    name: 'ИП Тест',
    inn: '',
    ogrnip: '',
    fio: '',
    regDate: '',
    address: '',
    okved: '',
    bankAccount: '',
    bik: '',
    bankName: '',
    usnObject: 'income',
    regionalRate: null,
    hasEmployees: false,
    vat: false,
    year: 2026,
    income: 0,
    expenses: 0,
    ...patch,
  }
}

function op(date: string, amount: number, kind: 'income' | 'expense' = 'income'): Operation {
  return { id: date + amount, date, kind, amount, counterparty: '', doc: '', note: '', taxable: true }
}

describe('compute — годовой режим (нет операций)', () => {
  const r = compute(makeOrg({ income: 2_400_000 }))

  it('quarterly === false', () => {
    expect(r.quarterly).toBe(false)
  })

  it('один период', () => {
    expect(r.usn.periods.length).toBe(1)
  })

  it('налог за год 65 610 (144 000 − взносы 78 390)', () => {
    expect(r.usn.tax_year_final.toNumber()).toBe(65_610)
  })
})

describe('compute — поквартальный режим (из операций)', () => {
  const ops = [
    op('2026-02-10', 600_000),
    op('2026-05-10', 600_000),
    op('2026-08-10', 600_000),
    op('2026-11-10', 600_000),
  ]
  const r = compute(makeOrg(), ops)

  it('quarterly === true', () => {
    expect(r.quarterly).toBe(true)
  })

  it('4 периода (квартал/полугодие/9мес/год)', () => {
    expect(r.usn.periods.length).toBe(4)
  })

  it('разбивка по кварталам: 600 000 в каждом', () => {
    expect(r.byQuarter.map((q) => q.income)).toEqual([600_000, 600_000, 600_000, 600_000])
  })

  it('годовая база нарастающим = 2 400 000', () => {
    expect(r.usn.periods[3].tax_base_cumulative.toNumber()).toBe(2_400_000)
  })

  it('итоговый налог за год = 65 610 (как в годовом режиме)', () => {
    expect(r.usn.tax_year_final.toNumber()).toBe(65_610)
  })

  it('аванс за 1 квартал > 0', () => {
    expect(r.usn.periods[0].advance_due_this_period.toNumber()).toBeGreaterThan(0)
  })

  it('календарь: аванс Q1 заполнен суммой', () => {
    const q1 = r.calendar.find((e) => e.kind === 'payment' && e.title.includes('1 квартал'))
    expect(q1?.amount?.toNumber()).toBeGreaterThan(0)
  })
})

describe('compute — операции другого года игнорируются', () => {
  const r = compute(makeOrg({ year: 2026, income: 1_000_000 }), [op('2025-03-01', 999_999)])
  it('падает в годовой режим (op за 2025 не считается)', () => {
    expect(r.quarterly).toBe(false)
    expect(r.usn.periods[0].tax_base_cumulative.toNumber()).toBe(1_000_000)
  })
})
