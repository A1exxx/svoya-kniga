/** Тесты авто-аудита качества учёта клиента. */
import { describe, expect, it } from 'vitest'
import { auditClient } from './clientAudit'
import type { Org } from '../state/orgStore'
import type { Operation } from '../state/opsStore'
import type { Doc } from '../state/docsStore'
import type { Employee } from '../state/employeesStore'

function org(p: Partial<Org> = {}): Org {
  return {
    id: 'o', name: 'ИП Тест', inn: '360403769236', ogrnip: '', fio: 'Тестов Тест', regDate: '2020-01-01',
    address: '', okved: '', oktmo: '45382000', okpo: '', taxOfficeCode: '3604', phone: '', email: '',
    espOwner: '', espValidTo: '', ausn: false, tradeFee: false,
    bankAccount: '40802810...', bik: '044525225', bankName: '', corrAccount: '', taxSystem: 'usn',
    usnObject: 'income', regionalRate: null, hasEmployees: false, vat: false, vatMode: 'auto',
    year: 2026, income: 1_000_000, expenses: 0, openingBalance: 0, assignee: '', ...p,
  }
}
const op = (date: string, amount: number, kind: 'income' | 'expense' = 'income', doc = 'акт'): Operation =>
  ({ id: date + amount, date, kind, amount, counterparty: '', doc, note: '', taxable: true })
const emp = (p: Partial<Employee>): Employee =>
  ({ id: 'e', fio: 'Иванов Иван', position: '', salary: 30000, children: 0, stazhYears: 0, hireDate: '', msp: true, ...p }) as Employee
const inv = (number: string, date: string, paid = true): Doc =>
  ({ id: number, type: 'invoice', direction: 'outgoing', number, date, buyer: '', buyerDetails: '',
    items: [], vatMode: 'none', note: '', paymentStatus: paid ? 'paid' : 'unpaid' }) as Doc

const TODAY = new Date('2026-06-20')

describe('auditClient — чистый клиент', () => {
  it('заполненный ИП без проблем → 0 находок', () => {
    expect(auditClient(org(), [op('2026-05-01', 1000), op('2026-02-01', 500)], [], [], TODAY)).toEqual([])
  })
})

describe('auditClient — реквизиты', () => {
  it('нет ИНН и ОКТМО → две ошибки', () => {
    const found = auditClient(org({ inn: '', oktmo: '' }), [op('2026-05-01', 1)], [], [], TODAY)
    expect(found.filter((i) => i.level === 'error').length).toBe(2)
  })
})

describe('auditClient — сотрудники', () => {
  it('сотрудники есть, флаг выключен → ошибка (вычет 50%)', () => {
    const found = auditClient(org({ hasEmployees: false }), [op('2026-06-01', 1)], [], [emp({ snils: '123', inn: '1' })], TODAY)
    expect(found.some((i) => i.level === 'error' && i.text.includes('50%'))).toBe(true)
  })
  it('сотрудник без СНИЛС → ошибка про перссведения', () => {
    const found = auditClient(org({ hasEmployees: true }), [op('2026-06-01', 1)], [], [emp({ inn: '1' })], TODAY)
    expect(found.some((i) => i.text.includes('СНИЛС'))).toBe(true)
  })
})

describe('auditClient — НДС-порог', () => {
  it('доход 25 млн (порог 2026 = 20 млн), НДС выключен → ошибка', () => {
    const found = auditClient(org({ income: 25_000_000 }), [], [], [], TODAY)
    expect(found.some((i) => i.level === 'error' && i.text.includes('НДС'))).toBe(true)
  })
})

describe('auditClient — счета', () => {
  it('пропуск в нумерации (1,2,4) → предупреждение с № 3', () => {
    const found = auditClient(org(), [op('2026-06-01', 1)], [inv('1', '2026-01-10'), inv('2', '2026-02-10'), inv('4', '2026-03-10')], [], TODAY)
    expect(found.some((i) => i.text.includes('№ 3'))).toBe(true)
  })
  it('неоплаченный счёт старше 30 дней → предупреждение', () => {
    const found = auditClient(org(), [op('2026-06-01', 1)], [inv('1', '2026-01-10', false)], [], TODAY)
    expect(found.some((i) => i.text.includes('старше 30 дней'))).toBe(true)
  })
})

describe('auditClient — пустой квартал', () => {
  it('операции есть в году, но не в текущем квартале → предупреждение', () => {
    const found = auditClient(org(), [op('2026-01-15', 1000)], [], [], TODAY)
    expect(found.some((i) => i.text.includes('текущий квартал'))).toBe(true)
  })
})

describe('auditClient — расходы без документа (Д−Р)', () => {
  it('считает расходы без основания', () => {
    const found = auditClient(
      org({ usnObject: 'income_minus' }),
      [op('2026-06-01', 100, 'expense', ''), op('2026-06-02', 200, 'expense', '')],
      [], [], TODAY
    )
    expect(found.some((i) => i.text.includes('без документа-основания: 2'))).toBe(true)
  })
})
