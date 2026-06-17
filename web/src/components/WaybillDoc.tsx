import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import { docTotals, type Doc } from '../state/docsStore'
import { rublesToWords } from '../lib/numberToWords'

const r = (n: number) => formatRub(n, { kopecks: true })

/** Товарная накладная (ТОРГ-12): грузоотправитель/грузополучатель, позиции, «отпустил/принял». */
export function WaybillDoc({ org, doc }: { org: Org; doc: Doc }) {
  const { subtotal, rate, vat } = docTotals(doc)
  const seller = org.fio || org.name || '—'
  const totalQty = doc.items.reduce((s, it) => s + it.qty, 0)

  return (
    <div className="text-[12px]">
      {org.logo && <img src={org.logo} alt="Логотип" className="mb-2 max-h-12 object-contain" />}
      <div className="text-base font-semibold">
        Товарная накладная № {doc.number} от {formatDate(doc.date)}
      </div>
      <div className="mt-1 text-slate-500">Унифицированная форма ТОРГ-12</div>

      <table className="mt-4 w-full text-[12px]">
        <tbody>
          <tr className="align-top">
            <td className="w-40 py-1 text-slate-500">Грузоотправитель</td>
            <td className="py-1 font-medium">
              {seller}
              {org.inn && <>, ИНН {org.inn}</>}
              {org.address && <>, {org.address}</>}
            </td>
          </tr>
          <tr className="align-top">
            <td className="py-1 text-slate-500">Грузополучатель</td>
            <td className="py-1 font-medium">
              {doc.buyer || '—'}
              {doc.buyerDetails && <>, {doc.buyerDetails}</>}
            </td>
          </tr>
          <tr className="align-top">
            <td className="py-1 text-slate-500">Поставщик / Плательщик</td>
            <td className="py-1">{seller} / {doc.buyer || '—'}</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-4 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border border-slate-300 text-left">
            <th className="border border-slate-300 px-1.5 py-1 font-semibold">№</th>
            <th className="border border-slate-300 px-1.5 py-1 font-semibold">Товар</th>
            <th className="border border-slate-300 px-1.5 py-1 text-right font-semibold">Кол-во</th>
            <th className="border border-slate-300 px-1.5 py-1 text-right font-semibold">Цена</th>
            <th className="border border-slate-300 px-1.5 py-1 text-right font-semibold">Сумма без НДС</th>
            <th className="border border-slate-300 px-1.5 py-1 text-right font-semibold">Ставка НДС</th>
            <th className="border border-slate-300 px-1.5 py-1 text-right font-semibold">Сумма с НДС</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it, i) => {
            const sum = it.qty * it.price
            const itVat = rate > 0 ? sum - sum / (1 + rate / 100) : 0
            return (
              <tr key={i} className="border border-slate-300 align-top">
                <td className="border border-slate-300 px-1.5 py-1">{i + 1}</td>
                <td className="border border-slate-300 px-1.5 py-1">{it.name || '—'}</td>
                <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{it.qty}</td>
                <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(it.price)}</td>
                <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(sum - itVat)}</td>
                <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{rate > 0 ? `${rate}%` : 'Без НДС'}</td>
                <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(sum)}</td>
              </tr>
            )
          })}
          <tr className="border border-slate-300 font-semibold">
            <td className="border border-slate-300 px-1.5 py-1" colSpan={2}>Итого</td>
            <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{totalQty}</td>
            <td className="border border-slate-300" />
            <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(subtotal - vat)}</td>
            <td className="border border-slate-300" />
            <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(subtotal)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3">
        Всего мест {doc.items.length}, на сумму <b>{r(subtotal)}</b>
        <div className="font-medium">{rublesToWords(subtotal)}</div>
        <div className="text-slate-600">{rate > 0 ? `В том числе НДС ${rate}%: ${r(vat)}` : 'Без НДС'}</div>
      </div>

      <div className="mt-8 flex justify-between gap-8 text-[12px]">
        <div className="flex-1">
          <div>Отпустил груз:</div>
          <div className="mt-6 flex items-end gap-1.5">
            {org.signature ? (
              <img src={org.signature} alt="Подпись" className="h-8 object-contain" />
            ) : (
              <span>______________</span>
            )}
            <span>/ {seller}</span>
          </div>
          {org.stamp ? (
            <img src={org.stamp} alt="Печать" className="mt-1 h-14 object-contain" />
          ) : (
            <div className="mt-1 text-slate-400">М.П.</div>
          )}
        </div>
        <div className="flex-1">
          <div>Груз получил:</div>
          <div className="mt-6">______________ / {doc.buyer || '________'}</div>
          <div className="mt-1 text-slate-400">М.П.</div>
        </div>
      </div>

      <div className="mt-6 text-[11px] text-slate-400">
        Сформировано в «СвояКнига» {formatDate(new Date().toISOString().slice(0, 10))}.
      </div>
    </div>
  )
}
