import { formatRub, formatDate } from '../lib/format'
import { docTotals, DOC_TYPE_LABEL, type Doc } from '../state/docsStore'
import type { Org } from '../state/orgStore'

const r = (n: number) => formatRub(n, { kopecks: true })

/** Книга покупок — входящие документы с НДС (входной НДС к вычету при общей ставке). */
export function PurchaseBookDoc({ org, docs }: { org: Org; docs: Doc[] }) {
  const rows = docs
    .filter((d) => d.direction === 'incoming' && d.vatMode !== 'none' && d.date.startsWith(String(org.year)))
    .map((d) => ({ d, t: docTotals(d) }))
  const totalWithVat = rows.reduce((s, x) => s + x.t.subtotal, 0)
  const totalVat = rows.reduce((s, x) => s + x.t.vat, 0)

  return (
    <div>
      <div className="text-center text-base font-semibold">Книга покупок</div>
      <div className="mt-1 text-center text-xs text-slate-500">
        {org.fio || org.name || '—'}{org.inn && `, ИНН ${org.inn}`} · {org.year} год
      </div>
      {rows.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">
          Нет входящих документов со ставкой НДС. Заносите счета/акты от поставщиков с НДС во вкладке
          «Документы → Входящие» — входной НДС попадёт в книгу покупок и (для общей ставки) к вычету.
        </p>
      ) : (
        <table className="mt-5 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-slate-300 text-left">
              <th className="w-8 py-1.5 pr-2 font-semibold">№</th>
              <th className="py-1.5 pr-2 font-semibold">Документ</th>
              <th className="py-1.5 pr-2 font-semibold">Дата</th>
              <th className="py-1.5 pr-2 font-semibold">Поставщик</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Стоимость с НДС</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Ставка</th>
              <th className="py-1.5 text-right font-semibold">НДС к вычету</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ d, t }, i) => (
              <tr key={d.id} className="border-b border-slate-200 align-top">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="py-1.5 pr-2">{DOC_TYPE_LABEL[d.type]} № {d.number}</td>
                <td className="tnum py-1.5 pr-2">{formatDate(d.date)}</td>
                <td className="py-1.5 pr-2">{d.buyer || '—'}</td>
                <td className="tnum py-1.5 pr-2 text-right">{r(t.subtotal)}</td>
                <td className="tnum py-1.5 pr-2 text-right">{t.rate}%</td>
                <td className="tnum py-1.5 text-right">{r(t.vat)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-1.5 pr-2" colSpan={4}>Итого</td>
              <td className="tnum py-1.5 pr-2 text-right">{r(totalWithVat)}</td>
              <td />
              <td className="tnum py-1.5 text-right">{r(totalVat)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="mt-6 text-[11px] text-slate-400">
        Сформировано в «СвояКнига» {formatDate(new Date().toISOString().slice(0, 10))}. Входной НДС
        принимается к вычету только при общей ставке (20/22/10%); на спец-ставках 5/7% вычета нет.
      </div>
    </div>
  )
}
