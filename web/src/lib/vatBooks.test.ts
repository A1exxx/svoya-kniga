import { describe, expect, it } from 'vitest'
import { buildVatBooks } from './vatBooks'
import type { Doc } from '../state/docsStore'

const doc = (o: Partial<Doc>): Doc =>
  ({
    id: Math.random().toString(36),
    type: 'invoice',
    direction: 'outgoing',
    number: '1',
    date: '2026-02-01',
    buyer: 'Контрагент',
    buyerDetails: '',
    items: [{ id: '1', name: 'Услуга', qty: 1, price: 12000 }],
    vatMode: '20',
    note: '',
    paymentStatus: 'paid',
    ...o,
  }) as unknown as Doc

describe('buildVatBooks — фильтр по периоду (исправление рассинхрона с разделом 3)', () => {
  const docs = [
    doc({ date: '2025-12-31', direction: 'outgoing' }), // прошлый год — НЕ должен попасть
    doc({ date: '2026-02-01', direction: 'outgoing' }), // Q1 2026
    doc({ date: '2026-08-10', direction: 'outgoing' }), // Q3 2026
    doc({ date: '2026-03-05', direction: 'incoming' }), // покупки Q1 2026
    doc({ date: '2026-01-01', direction: 'outgoing', vatMode: 'none' }), // без НДС — не в книгу
  ]

  it('берёт только документы указанного года', () => {
    const b = buildVatBooks(docs, 2026)
    expect(b.sales).toHaveLength(2) // два исходящих с НДС за 2026 (2025 отфильтрован)
    expect(b.purchases).toHaveLength(1)
  })

  it('документ прошлого года не попадает в книгу продаж', () => {
    const b = buildVatBooks(docs, 2026)
    expect(b.sales.every((l) => l.date.startsWith('2026'))).toBe(true)
  })

  it('фильтр по кварталу сужает до квартала', () => {
    const b = buildVatBooks(docs, 2026, 1)
    expect(b.sales).toHaveLength(1) // только Q1 (февраль)
    expect(b.purchases).toHaveLength(1) // март — Q1
  })

  it('другой год — пусто', () => {
    expect(buildVatBooks(docs, 2024).sales).toHaveLength(0)
  })
})
