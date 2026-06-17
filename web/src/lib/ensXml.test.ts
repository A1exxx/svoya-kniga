import { describe, expect, it } from 'vitest'
import { notificationXml, ensNotificationXml } from './ensXml'
import { compute } from './compute'
import type { Org } from '../state/orgStore'

const org = (p: Partial<Org> = {}): Org =>
  ({
    id: 't',
    name: 'ИП Тест',
    inn: '500100732259',
    ogrnip: '',
    fio: 'Иванов Иван',
    regDate: '',
    address: '',
    okved: '',
    oktmo: '45000000',
    bankAccount: '',
    bik: '',
    bankName: '',
    usnObject: 'income',
    regionalRate: null,
    hasEmployees: false,
    vat: false,
    vatMode: 'auto',
    year: 2026,
    income: 2_400_000,
    expenses: 0,
    ...p,
  }) as Org

describe('notificationXml — мультистрочное уведомление КНД 1110355', () => {
  const xml = notificationXml(org(), [
    { kbk: '18210102010011000110', oktmo: '45000000', period: '21/01', year: 2026, amount: 5000, title: 'НДФЛ' },
    { kbk: '18210201000011000160', oktmo: '45000000', period: '21/02', year: 2026, amount: 3000, title: 'Взносы' },
  ])
  it('форма КНД 1110355', () => expect(xml).toContain('КНД="1110355"'))
  it('две строки обязательств', () => expect((xml.match(/СведОбяз/g) || []).length).toBe(2))
  it('содержит КБК НДФЛ и сумму', () => {
    expect(xml).toContain('18210102010011000110')
    expect(xml).toContain('Сумма="5000"')
  })
})

describe('ensNotificationXml — годовой режим не подставляет ошибочный код 34/03', () => {
  const o = org({ income: 2_400_000 })
  const xml = ensNotificationXml(o, compute(o))
  it('нет строки с периодом 34/03 для годового налога (его заменяет декларация)', () => {
    expect(xml).not.toContain('Период="34/03"')
  })
})
