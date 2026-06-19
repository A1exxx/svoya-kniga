import { describe, expect, it } from 'vitest'
import { orgDisplayName, isPlaceholderName, requisitesComplete, requisitesProgress } from './orgDisplay'
import type { Org } from '../state/orgStore'

function org(p: Partial<Org>): Org {
  return {
    id: 'x',
    name: '',
    inn: '',
    ogrnip: '',
    fio: '',
    regDate: '',
    address: '',
    okved: '',
    oktmo: '',
    okpo: '',
    taxOfficeCode: '',
    phone: '',
    espOwner: '',
    espValidTo: '',
    ausn: false,
    tradeFee: false,
    bankAccount: '',
    bik: '',
    bankName: '',
    corrAccount: '',
    taxSystem: 'usn',
    usnObject: 'income',
    regionalRate: null,
    hasEmployees: false,
    vat: false,
    vatMode: 'auto',
    year: 2026,
    income: 0,
    expenses: 0,
    ...p,
  }
}

describe('orgDisplayName', () => {
  it('возвращает заданное краткое название', () =>
    expect(orgDisplayName({ name: 'ИП Иванов', fio: 'Иванов И.И.', inn: '1' })).toBe('ИП Иванов'))
  it('пустое имя → ИП {ФИО}', () =>
    expect(orgDisplayName({ name: '', fio: 'Логвина Ирина Анатольевна', inn: '1' })).toBe(
      'ИП Логвина Ирина Анатольевна'
    ))
  it('плейсхолдер «Новый ИП» → ИП {ФИО}', () =>
    expect(orgDisplayName({ name: 'Новый ИП', fio: 'Платьева Оксана', inn: '1' })).toBe(
      'ИП Платьева Оксана'
    ))
  it('не дублирует «ИП», если ФИО уже начинается с него', () =>
    expect(orgDisplayName({ name: '', fio: 'ИП Сидоров', inn: '1' })).toBe('ИП Сидоров'))
  it('нет ФИО → ИП {ИНН}', () =>
    expect(orgDisplayName({ name: '', fio: '', inn: '772233445566' })).toBe('ИП 772233445566'))
  it('ничего нет → Без названия', () =>
    expect(orgDisplayName({ name: '', fio: '', inn: '' })).toBe('Без названия'))
})

describe('isPlaceholderName', () => {
  it('пустое/Новый ИП/Демонстрация → true', () => {
    expect(isPlaceholderName('')).toBe(true)
    expect(isPlaceholderName('Новый ИП')).toBe(true)
    expect(isPlaceholderName('ИП Демонстрация')).toBe(true)
  })
  it('реальное имя → false', () => expect(isPlaceholderName('ИП Иванов')).toBe(false))
})

describe('requisitesProgress / requisitesComplete', () => {
  it('пустые реквизиты → 0 из 6, не complete', () => {
    const p = requisitesProgress(org({}))
    expect(p.filled).toBe(0)
    expect(p.total).toBe(6)
    expect(requisitesComplete(org({}))).toBe(false)
  })
  it('все ключевые поля заполнены → complete', () => {
    const full = org({
      fio: 'Иванов И.И.',
      inn: '772233445566',
      ogrnip: '312345678901234',
      regDate: '2021-03-01',
      address: 'г. Москва',
      okved: '62.01',
    })
    expect(requisitesComplete(full)).toBe(true)
    expect(requisitesProgress(full).missing).toEqual([])
  })
  it('частично заполнено → перечисляет недостающее', () => {
    const p = requisitesProgress(org({ fio: 'Иванов', inn: '1' }))
    expect(p.filled).toBe(2)
    expect(p.missing).toContain('ОГРНИП')
  })
})
