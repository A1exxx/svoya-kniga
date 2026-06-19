import { describe, it, expect } from 'vitest'
import { calcVatUsn, calcVacation, calcSickLeave, usnCalendar } from './taxcore'
import { monthFactorsFor } from './payrollSummary'
import { unionWorkdaysInMonth, workdaysInMonthByWeekday } from './vacation'
import type { Employee } from '../state/employeesStore'

const emp = (over: Partial<Employee> = {}): Employee =>
  ({
    id: 'e',
    fio: 'Тест',
    position: '',
    salary: 60000,
    children: 0,
    stazhYears: 5,
    hireDate: '',
    msp: true,
    ...over,
  }) as Employee

describe('НДС: исчисленный output_vat отделён от НДС к уплате', () => {
  it('входящий НДС больше исходящего → vat=0, но output_vat = реальный исчисленный', () => {
    const r = calcVatUsn(2025, 100_000_000, { mode: 'general', inputVat: 30_000_000 })
    expect(r.vat.toNumber()).toBe(0)
    expect(r.output_vat.toNumber()).toBeGreaterThan(15_000_000)
  })
  it('без вычета (спец-ставка) output_vat == vat', () => {
    const r = calcVatUsn(2025, 100_000_000, { mode: 'rate5' })
    expect(r.output_vat.toNumber()).toBeCloseTo(r.vat.toNumber(), 2)
  })
})

describe('Отпускные: НДФЛ с кумулятивной базой', () => {
  it('маржинальный НДФЛ за порогом 2,4 млн выше, чем с нуля', () => {
    const lo = calcVacation(2025, 1_200_000, 14, 0)
    const hi = calcVacation(2025, 1_200_000, 14, 2_400_000)
    expect(hi.ndfl.toNumber()).toBeGreaterThan(lo.ndfl.toNumber())
  })
})

describe('Больничный: стаж <6 мес — потолок МРОТ', () => {
  it('при высоком заработке пособие с потолком ниже обычного', () => {
    const normal = calcSickLeave(2025, 2_000_000, 2_000_000, 3, 10, 3, 31)
    const capped = calcSickLeave(2025, 2_000_000, 2_000_000, 3, 10, 3, 31, undefined, true)
    expect(capped.total.toNumber()).toBeLessThan(normal.total.toNumber())
  })
})

describe('monthFactorsFor — единый расчёт факторов месяца', () => {
  it('полный месяц больничного (авто) → фактор 0 (нет фантомного дня)', () => {
    const e = emp({
      autoSickVacation: true,
      sickLeaves: [{ id: 's', from: '2025-02-01', to: '2025-02-28' }],
    })
    expect(monthFactorsFor(e, 2025)[1]).toBe(0)
  })
  it('без авто-учёта и без данных → все факторы 1', () => {
    expect(monthFactorsFor(emp(), 2025).every((x) => x === 1)).toBe(true)
  })
})

describe('Дедупликация пересекающихся периодов отсутствия', () => {
  it('пересечение больничного и отпуска считается один раз', () => {
    const a = [{ from: '2026-02-02', to: '2026-02-06' }] // пн–пт = 5
    const b = [{ from: '2026-02-04', to: '2026-02-10' }] // пересекается, +9,10
    const union = unionWorkdaysInMonth([a, b], 2026, 1)
    expect(union).toBe(7) // 2,3,4,5,6,9,10
    expect(union).toBeLessThanOrEqual(workdaysInMonthByWeekday(2026, 1))
  })
})

describe('НДС-календарь: уплата тремя долями', () => {
  it('по 3 платежа на квартал (1/3, 2/3, 3/3)', () => {
    const titles = usnCalendar(2026, undefined, undefined, { vat: true }).map((e) => e.title)
    expect(titles).toContain('Уплата НДС за 1 квартал — 1/3')
    expect(titles).toContain('Уплата НДС за 1 квартал — 2/3')
    expect(titles).toContain('Уплата НДС за 1 квартал — 3/3')
  })
})
