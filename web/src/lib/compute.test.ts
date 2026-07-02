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
    oktmo: '',
    bankAccount: '',
    bik: '',
    bankName: '',
    corrAccount: '',
    taxSystem: 'usn',
    usnObject: 'income',
    okpo: '', taxOfficeCode: '', phone: '', email: '', espOwner: '', espValidTo: '', ausn: false, tradeFee: false, regionalRate: null,
    hasEmployees: false,
    vat: false,
    vatMode: 'auto',
    year: 2026,
    income: 0,
    expenses: 0,
    openingBalance: 0,
    assignee: '',
    ...patch,
  }
}

function op(date: string, amount: number, kind: 'income' | 'expense' = 'income'): Operation {
  return { id: date + amount, date, kind, amount, counterparty: '', doc: '', note: '', taxable: true }
}

describe('compute — календарь НДС за все 4 квартала (при vat=true)', () => {
  const r = compute(makeOrg({ vat: true, vatMode: 'general', income: 30_000_000 }))
  const vatDecl = r.calendar.filter((e) => e.title.includes('Декларация по НДС'))
  it('4 декларации НДС (Q1–Q4), а не только Q4', () => expect(vatDecl.length).toBe(4))
  it('есть уплата НДС за 1 квартал', () =>
    expect(r.calendar.some((e) => e.title.includes('Уплата НДС за 1 квартал'))).toBe(true))
})

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

describe('compute — точность (decimal-агрегация, без float-дрейфа)', () => {
  it('0.1 + 0.2 = 0.3 ровно (а не 0.30000000000000004)', () => {
    const r = compute(makeOrg(), [op('2026-02-01', 0.1), op('2026-02-02', 0.2)])
    expect(r.byQuarter[0].income).toBe(0.3)
  })

  it('копеечные суммы суммируются точно по кварталам', () => {
    const r = compute(makeOrg(), [
      op('2026-02-01', 100_000.1),
      op('2026-02-02', 100_000.2),
      op('2026-05-01', 0.3),
    ])
    expect(r.byQuarter[0].income).toBe(200_000.3)
    expect(r.byQuarter[1].income).toBe(0.3)
    expect(r.usn.periods[3].tax_base_cumulative.toNumber()).toBe(200_001) // 200000.6 → round 200001
  })
})
