/** Тест декларации УСН: критический случай «доходы−расходы» с минимальным налогом. */
import { describe, expect, it } from 'vitest'
import { declarationUsnXml } from './declarationXml'
import { compute } from './compute'
import type { Org } from '../state/orgStore'

function makeOrg(patch: Partial<Org> = {}): Org {
  return {
    id: 'test', name: 'ИП Тест', inn: '', ogrnip: '', fio: '', regDate: '', address: '', okved: '',
    oktmo: '', okpo: '', taxOfficeCode: '', phone: '', espOwner: '', espValidTo: '', ausn: false, tradeFee: false,
    bankAccount: '', bik: '', bankName: '', corrAccount: '', taxSystem: 'usn', usnObject: 'income', regionalRate: null,
    hasEmployees: false, vat: false, vatMode: 'auto', year: 2026, income: 0, expenses: 0, ...patch,
  }
}

describe('declarationUsnXml — Д-Р с минимальным налогом (без задвоения)', () => {
  // Доход 5 млн, расходы 4.9 млн → база 100к, налог 15% = 15 000; мин. налог 1% = 50 000 > 15 000.
  const org = makeOrg({ usnObject: 'income_minus', income: 5_000_000, expenses: 4_900_000 })
  const xml = declarationUsnXml(org, compute(org))

  it('минимальный налог стоит в строке 120 (50 000)', () => {
    expect(xml).toContain('КодСтр="120" Знач="50000"')
  })

  it('строка 100 (обычный налог) НЕ выводится — нет двойного обязательства', () => {
    expect(xml).not.toContain('КодСтр="100"')
  })

  it('минимальный налог (280) присутствует в разделе 2.2', () => {
    expect(xml).toContain('КодСтр="280" Знач="50000"')
  })
})

describe('declarationUsnXml — доходы 6%: строка 100, нет 120', () => {
  const org = makeOrg({ usnObject: 'income', income: 2_400_000 })
  const xml = declarationUsnXml(org, compute(org))

  it('обычный налог в строке 100 (65 610)', () => {
    expect(xml).toContain('КодСтр="100" Знач="65610"')
  })

  it('строка 120 (мин. налог) НЕ выводится для объекта «доходы»', () => {
    expect(xml).not.toContain('КодСтр="120"')
  })
})
