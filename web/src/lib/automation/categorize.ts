/**
 * H1 — подсказка заполнения операции по ИСТОРИИ контрагента.
 * Полуавтомат: возвращает предложение (учитывать в налоге / описание / тип), которое UI
 * показывает кнопкой «Применить». Сама ничего не меняет. Учится только на прошлых операциях.
 */
import type { Operation } from '../../state/opsStore'

export interface OpSuggestion {
  taxable: boolean
  note: string | null
  kind: 'income' | 'expense' | null
  count: number
  basis: string
}

const norm = (s: string) =>
  (s || '').toLowerCase().replace(/["'«».,]/g, '').replace(/\s+/g, ' ').trim()

/** Предложение по контрагенту на основе прошлых операций (или null, если истории нет). */
export function suggestForCounterparty(ops: Operation[], counterparty: string): OpSuggestion | null {
  const key = norm(counterparty)
  if (key.length < 3) return null
  const past = ops.filter((o) => norm(o.counterparty) === key)
  if (past.length === 0) return null

  // «Учитывать в налоге» — по большинству прошлых (≥50% → да).
  const taxableYes = past.filter((o) => o.taxable).length
  const taxable = taxableYes * 2 >= past.length

  // Самое частое непустое описание.
  const noteCounts = new Map<string, number>()
  for (const o of past) {
    const n = o.note?.trim()
    if (n) noteCounts.set(n, (noteCounts.get(n) ?? 0) + 1)
  }
  let note: string | null = null
  let bestNote = 0
  for (const [n, c] of noteCounts) {
    if (c > bestNote) {
      bestNote = c
      note = n
    }
  }

  // Тип операции — по большинству (при равенстве не навязываем).
  const inc = past.filter((o) => o.kind === 'income').length
  const kind: 'income' | 'expense' | null =
    inc * 2 === past.length ? null : inc * 2 > past.length ? 'income' : 'expense'

  return { taxable, note, kind, count: past.length, basis: `по истории контрагента (${past.length})` }
}
