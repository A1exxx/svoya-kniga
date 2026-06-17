/**
 * Строки книги продаж (раздел 9 декларации НДС) и книги покупок (раздел 8) — из документов.
 * Единый источник для печатной книги, разделов 8/9 декларации и XML, чтобы цифры совпадали.
 */
import { docTotals, DOC_TYPE_LABEL, type Doc } from '../state/docsStore'

export interface VatBookLine {
  num: number
  doc: string // «Счёт № 5»
  date: string // YYYY-MM-DD
  party: string // контрагент (покупатель/поставщик)
  withVat: number // стоимость с НДС
  rate: number // ставка, %
  vat: number // сумма НДС
  base: number // стоимость без НДС
}

function toLines(docs: Doc[]): VatBookLine[] {
  return docs
    .filter((d) => d.vatMode !== 'none')
    .map((d, i) => {
      const t = docTotals(d)
      return {
        num: i + 1,
        doc: `${DOC_TYPE_LABEL[d.type]} № ${d.number}`,
        date: d.date,
        party: d.buyer || '—',
        withVat: t.subtotal,
        rate: t.rate,
        vat: t.vat,
        base: t.subtotal - t.vat,
      }
    })
}

export interface VatBooks {
  sales: VatBookLine[] // раздел 9 — реализация (исходящие)
  purchases: VatBookLine[] // раздел 8 — приобретения (входящие)
}

export function buildVatBooks(docs: Doc[]): VatBooks {
  return {
    sales: toLines(docs.filter((d) => d.direction === 'outgoing')),
    purchases: toLines(docs.filter((d) => d.direction === 'incoming')),
  }
}

export function sumVat(lines: VatBookLine[]): { withVat: number; vat: number; base: number } {
  return {
    withVat: lines.reduce((s, l) => s + l.withVat, 0),
    vat: lines.reduce((s, l) => s + l.vat, 0),
    base: lines.reduce((s, l) => s + l.base, 0),
  }
}
