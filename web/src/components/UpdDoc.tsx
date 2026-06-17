import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import { docTotals, type Doc } from '../state/docsStore'
import { rublesToWords } from '../lib/numberToWords'

const r = (n: number) => formatRub(n, { kopecks: true })

/** Универсальный передаточный документ (УПД), статус 1 — счёт-фактура + передаточный акт. */
export function UpdDoc({ org, doc }: { org: Org; doc: Doc }) {
  const { subtotal, rate, vat } = docTotals(doc)
  const seller = org.fio || org.name || '—'
  const hasVat = rate > 0

  return (
    <div className="text-[12px]">
      <div className="flex items-start justify-between">
        <div className="text-base font-semibold">
          Универсальный передаточный документ № {doc.number} от {formatDate(doc.date)}
        </div>
        <div className="rounded border border-slate-400 px-2 py-1 text-center text-[11px]">
          Статус: <b>1</b>
          <div className="text-slate-500">счёт-фактура + передача</div>
        </div>
      </div>

      <table className="mt-4 w-full text-[12px]">
        <tbody>
          <tr className="align-top">
            <td className="w-40 py-1 text-slate-500">Продавец</td>
            <td className="py-1 font-medium">
              {seller}
              {org.inn && <>, ИНН {org.inn}</>}
              {org.address && <>, {org.address}</>}
            </td>
          </tr>
          <tr className="align-top">
            <td className="py-1 text-slate-500">Покупатель</td>
            <td className="py-1 font-medium">
              {doc.buyer || '—'}
              {doc.buyerDetails && <>, {doc.buyerDetails}</>}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="mt-4 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="text-left">
            <th className="border border-slate-300 px-1.5 py-1 font-semibold">№</th>
            <th className="border border-slate-300 px-1.5 py-1 font-semibold">Наименование</th>
            <th className="border border-slate-300 px-1.5 py-1 text-right font-semibold">Кол-во</th>
            <th className="border border-slate-300 px-1.5 py-1 text-right font-semibold">Цена без НДС</th>
            <th className="border border-slate-300 px-1.5 py-1 text-right font-semibold">Стоимость без НДС</th>
            <th className="border border-slate-300 px-1.5 py-1 text-right font-semibold">Ставка</th>
            <th className="border border-slate-300 px-1.5 py-1 text-right font-semibold">Сумма НДС</th>
            <th className="border border-slate-300 px-1.5 py-1 text-right font-semibold">Стоимость с НДС</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it, i) => {
            const sum = it.qty * it.price
            const itVat = hasVat ? sum - sum / (1 + rate / 100) : 0
            const net = sum - itVat
            const priceNet = it.qty ? net / it.qty : 0
            return (
              <tr key={i} className="align-top">
                <td className="border border-slate-300 px-1.5 py-1">{i + 1}</td>
                <td className="border border-slate-300 px-1.5 py-1">{it.name || '—'}</td>
                <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{it.qty}</td>
                <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(priceNet)}</td>
                <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(net)}</td>
                <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{hasVat ? `${rate}%` : 'Без НДС'}</td>
                <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(itVat)}</td>
                <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(sum)}</td>
              </tr>
            )
          })}
          <tr className="font-semibold">
            <td className="border border-slate-300 px-1.5 py-1" colSpan={4}>Всего к оплате</td>
            <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(subtotal - vat)}</td>
            <td className="border border-slate-300" />
            <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(vat)}</td>
            <td className="tnum border border-slate-300 px-1.5 py-1 text-right">{r(subtotal)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3">
        Всего к оплате <b>{r(subtotal)}</b> ({rublesToWords(subtotal)}).{' '}
        {hasVat ? `В том числе НДС ${rate}%: ${r(vat)}.` : 'Без НДС.'}
      </div>

      <div className="mt-8 flex justify-between gap-8 text-[12px]">
        <div className="flex-1">
          <div>Товар (услугу) передал:</div>
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
          <div>Товар (услугу) получил:</div>
          <div className="mt-6">______________ / {doc.buyer || '________'}</div>
          <div className="mt-1 text-slate-400">М.П.</div>
        </div>
      </div>

      <div className="mt-6 text-[11px] text-slate-400">
        Сформировано в «СвояКнига» {formatDate(new Date().toISOString().slice(0, 10))}. УПД статус 1 —
        одновременно счёт-фактура и передаточный документ.
      </div>
    </div>
  )
}
