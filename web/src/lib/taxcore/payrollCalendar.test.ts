import { describe, it, expect } from 'vitest'
import { usnCalendar } from './ens'

describe('usnCalendar: зарплатные обязанности при наличии штата', () => {
  const titlesNoEmp = usnCalendar(2026, undefined, undefined, { hasEmployees: false }).map((e) => e.title)
  const withEmp = usnCalendar(2026, undefined, undefined, { hasEmployees: true })
  const titles = withEmp.map((e) => e.title)

  it('без сотрудников зарплатных задач нет', () => {
    expect(titlesNoEmp.some((t) => t.includes('Персонифицированные'))).toBe(false)
    expect(titlesNoEmp.some((t) => t.includes('травматизм'))).toBe(false)
  })

  it('добавляет ежемесячные перссведения за каждый месяц', () => {
    const pers = titles.filter((t) => t.startsWith('Персонифицированные сведения'))
    expect(pers).toHaveLength(12)
    expect(titles).toContain('Персонифицированные сведения за январь')
    expect(titles).toContain('Персонифицированные сведения за декабрь')
  })

  it('добавляет ежемесячные НДФЛ+взносы (ЕНП) и травматизм', () => {
    expect(titles.filter((t) => t.startsWith('НДФЛ и страховые взносы за работников'))).toHaveLength(12)
    expect(titles.filter((t) => t.startsWith('Взносы на травматизм'))).toHaveLength(12)
  })

  it('добавляет поквартальные 6-НДФЛ / РСВ / ЕФС-1 + годовые', () => {
    expect(titles).toContain('6-НДФЛ за 1 квартал')
    expect(titles).toContain('6-НДФЛ за полугодие')
    expect(titles).toContain('6-НДФЛ за 9 месяцев')
    expect(titles).toContain('6-НДФЛ за год')
    expect(titles).toContain('РСВ за 1 квартал')
    expect(titles).toContain('ЕФС-1 (раздел 2) за полугодие')
  })

  it('события отсортированы по дате (due возрастает)', () => {
    const dues = withEmp.map((e) => e.due)
    const sorted = [...dues].sort((a, b) => a.localeCompare(b))
    expect(dues).toEqual(sorted)
  })

  it('перссведения за январь имеют срок до 25 февраля', () => {
    const jan = withEmp.find((e) => e.title === 'Персонифицированные сведения за январь')
    expect(jan?.due).toBe('2026-02-25')
  })
})
