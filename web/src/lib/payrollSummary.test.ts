import { describe, expect, it } from 'vitest'
import { payrollSummary, employeeSalaryOptions, isActiveInYear } from './payrollSummary'
import { calcSalary } from './taxcore'
import type { Org } from '../state/orgStore'
import type { Employee } from '../state/employeesStore'

function org(p: Partial<Org> = {}): Org {
  return {
    id: 'o', name: 'ИП Тест', inn: '', ogrnip: '', fio: '', regDate: '', address: '', okved: '',
    oktmo: '', okpo: '', taxOfficeCode: '', phone: '', email: '', espOwner: '', espValidTo: '', ausn: false, tradeFee: false,
    bankAccount: '', bik: '', bankName: '', corrAccount: '', taxSystem: 'usn', usnObject: 'income', regionalRate: null,
    hasEmployees: true, vat: false, vatMode: 'auto', year: 2026, income: 0, expenses: 0, ...p,
  }
}

function emp(p: Partial<Employee>): Employee {
  return {
    id: Math.random().toString(36).slice(2),
    fio: 'Сотрудник',
    position: '',
    salary: 60000,
    children: 0,
    stazhYears: 5,
    hireDate: '',
    msp: true,
    ...p,
  }
}

describe('payrollSummary — агрегация по штату', () => {
  const o = org()
  const e1 = emp({ fio: 'Платьева', salary: 100_000, children: 0, msp: true })
  const e2 = emp({ fio: 'Логвина', salary: 60_000, children: 1, msp: true })
  const s = payrollSummary(o, [e1, e2])

  it('две строки, count 2', () => {
    expect(s.rows).toHaveLength(2)
    expect(s.count).toBe(2)
  })
  it('итог ФОТ = сумме окладов по каждому (calcSalary)', () => {
    const g1 = calcSalary(2026, 100_000, { children: 0, msp: true }).gross_year.toNumber()
    const g2 = calcSalary(2026, 60_000, { children: 1, msp: true }).gross_year.toNumber()
    expect(s.totals.grossYear).toBe(g1 + g2)
  })
  it('итог НДФЛ = сумме НДФЛ по каждому', () => {
    const n1 = calcSalary(2026, 100_000, { children: 0, msp: true }).ndfl_year.toNumber()
    const n2 = calcSalary(2026, 60_000, { children: 1, msp: true }).ndfl_year.toNumber()
    expect(s.totals.ndflYear).toBe(n1 + n2)
  })
  it('итог взносов > 0 и стоимость работодателя = ФОТ+взносы+травматизм', () => {
    expect(s.totals.vznosyYear).toBeGreaterThan(0)
    expect(s.totals.employerCostYear).toBe(
      s.totals.grossYear + s.totals.vznosyYear + s.totals.travmYear
    )
  })
})

describe('employeeSalaryOptions — % аванса → доля', () => {
  it('30% → 0.3', () =>
    expect(employeeSalaryOptions(emp({ advancePercent: 30 })).advancePercent).toBe(0.3))
  it('нет аванса → 0', () =>
    expect(employeeSalaryOptions(emp({})).advancePercent).toBe(0))
})

describe('isActiveInYear — уволенные исключаются', () => {
  it('без даты увольнения → активен', () =>
    expect(isActiveInYear(emp({}), 2026)).toBe(true))
  it('уволен в 2025 → не активен в 2026', () =>
    expect(isActiveInYear(emp({ dismissalDate: '2025-08-01' }), 2026)).toBe(false))
  it('уволен в 2026 → ещё активен в 2026', () =>
    expect(isActiveInYear(emp({ dismissalDate: '2026-08-01' }), 2026)).toBe(true))
  it('сводка исключает уволенного ранее', () => {
    const s = payrollSummary(org(), [emp({ salary: 50000 }), emp({ salary: 50000, dismissalDate: '2024-01-01' })])
    expect(s.count).toBe(1)
  })
})
