import { describe, expect, it } from 'vitest'
import { suggestForCounterparty } from './categorize'
import { computeInsights } from './insights'
import type { Operation } from '../../state/opsStore'
import type { Doc } from '../../state/docsStore'
import type { Org } from '../../state/orgStore'

const op = (o: Partial<Operation>): Operation => ({
  id: Math.random().toString(36),
  date: '2026-02-10',
  kind: 'income',
  amount: 10000,
  counterparty: '',
  doc: '',
  note: '',
  taxable: true,
  ...o,
})

const org = (o: Partial<Org> = {}): Org =>
  ({ year: 2026, usnObject: 'income', income: 0, expenses: 0, ...o }) as unknown as Org

const invoice = (o: Partial<Doc>): Doc =>
  ({
    id: Math.random().toString(36),
    type: 'invoice',
    direction: 'outgoing',
    number: '1',
    date: '2026-02-01',
    buyer: 'ООО Покупатель',
    buyerDetails: '',
    items: [{ id: '1', name: 'Услуга', qty: 1, price: 10000 }],
    vatMode: 'none',
    note: '',
    paymentStatus: 'unpaid',
    ...o,
  }) as unknown as Doc

describe('suggestForCounterparty — подсказка по истории', () => {
  const ops = [
    op({ counterparty: 'ООО «Ромашка»', taxable: true, note: 'Услуги', kind: 'income' }),
    op({ counterparty: 'ООО Ромашка', taxable: true, note: 'Услуги', kind: 'income' }),
  ]
  it('предлагает taxable/note/kind по истории', () => {
    const s = suggestForCounterparty(ops, 'ооо ромашка')
    expect(s).not.toBeNull()
    expect(s!.taxable).toBe(true)
    expect(s!.note).toBe('Услуги')
    expect(s!.kind).toBe('income')
    expect(s!.count).toBe(2)
  })
  it('нет истории → null', () => {
    expect(suggestForCounterparty(ops, 'ООО Неизвестный')).toBeNull()
  })
  it('слишком короткое имя → null', () => {
    expect(suggestForCounterparty(ops, 'ИП')).toBeNull()
  })
  it('расход с большинством → kind expense', () => {
    const ex = [op({ counterparty: 'Аренда ООО', kind: 'expense', taxable: false })]
    const s = suggestForCounterparty(ex, 'аренда ооо')
    expect(s!.kind).toBe('expense')
    expect(s!.taxable).toBe(false)
  })
})

describe('computeInsights — аномалии и прогноз', () => {
  const TODAY = new Date(2026, 5, 15) // 15 июня 2026 (6 мес прошло)

  it('находит дубли операций', () => {
    const dup = { date: '2026-03-03', amount: 5000, counterparty: 'X', kind: 'income' as const }
    const ins = computeInsights([op(dup), op(dup)], [], org(), TODAY)
    expect(ins.some((i) => i.id === 'dups')).toBe(true)
  })

  it('расход без документа — только для «доходы−расходы»', () => {
    const ex = op({ kind: 'expense', taxable: true, doc: '', amount: 7000 })
    expect(computeInsights([ex], [], org({ usnObject: 'income_minus' }), TODAY).some((i) => i.id === 'nodoc')).toBe(true)
    expect(computeInsights([ex], [], org({ usnObject: 'income' }), TODAY).some((i) => i.id === 'nodoc')).toBe(false)
  })

  it('видит дебиторку (неоплаченный исходящий счёт)', () => {
    const ins = computeInsights([], [invoice({ paymentStatus: 'unpaid' })], org(), TODAY)
    expect(ins.some((i) => i.id === 'debt')).toBe(true)
  })

  it('даёт прогноз дохода при наличии данных в текущем году', () => {
    const ins = computeInsights([op({ date: '2026-01-15', amount: 100000, kind: 'income' })], [], org(), TODAY)
    expect(ins.some((i) => i.id === 'forecast')).toBe(true)
  })

  it('нет данных → нет инсайтов', () => {
    expect(computeInsights([], [], org(), TODAY)).toHaveLength(0)
  })
})
