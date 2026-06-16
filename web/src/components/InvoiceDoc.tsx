import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import { docTotals, type Doc } from '../state/docsStore'

const r = (n: number) => formatRub(n, { kopecks: true })

/** Печатная форма счёта на оплату или акта выполненных работ. Продавец = организация. */
export function InvoiceDoc({ org, doc }: { org: Org; doc: Doc }) {
  const { subtotal, rate, vat } = docTotals(doc)
  const isInvoice = doc.type === 'invoice'
  const sellerLabel = isInvoice ? 'Поставщик' : 'Исполнитель'
  const buyerLabel = isInvoice ? 'Покупатель' : 'Заказчик'
  const title = isInvoice
    ? `Счёт на оплату № ${doc.number} от ${formatDate(doc.date)}`
    : `Акт № ${doc.number} от ${formatDate(doc.date)} выполненных работ (оказанных услуг)`

  return (
    <div>
      <div className="text-lg font-semibold">{title}</div>

      <table className="mt-4 w-full text-[12.5px]">
        <tbody>
          <tr className="align-top">
            <td className="w-28 py-1 text-slate-500">{sellerLabel}</td>
            <td className="py-1 font-medium">
              {org.fio || org.name || '—'}
              {org.inn && <>, ИНН {org.inn}</>}
              {isInvoice && (org.bankAccount || org.bankName || org.bik) && (
                <div className="font-normal text-slate-600">
                  {org.bankName && <>Банк: {org.bankName}. </>}
                  {org.bankAccount && <>Р/с: {org.bankAccount}. </>}
                  {org.bik && <>БИК: {org.bik}.</>}
                </div>
              )}
            </td>
          </tr>
          <tr className="align-top">
            <td className="py-1 text-slate-500">{buyerLabel}</td>
            <td className="py-1 font-medium">
              {doc.buyer || '—'}
              {doc.buyerDetails && <div className="font-normal text-slate-600">{doc.buyerDetails}</div>}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="mt-5 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-y border-slate-300 text-left">
            <th className="w-8 py-1.5 pr-2 font-semibold">№</th>
            <th className="py-1.5 pr-2 font-semibold">Наименование</th>
            <th className="w-16 py-1.5 pr-2 text-right font-semibold">Кол-во</th>
            <th className="w-28 py-1.5 pr-2 text-right font-semibold">Цена</th>
            <th className="w-32 py-1.5 text-right font-semibold">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it, i) => (
            <tr key={i} className="border-b border-slate-200 align-top">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2">{it.name || '—'}</td>
              <td className="tnum py-1.5 pr-2 text-right">{it.qty}</td>
              <td className="tnum py-1.5 pr-2 text-right">{r(it.price)}</td>
              <td className="tnum py-1.5 text-right">{r(it.qty * it.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-col items-end gap-0.5 text-[12.5px]">
        <div>
          Итого: <span className="tnum font-semibold">{r(subtotal)}</span>
        </div>
        <div className="text-slate-600">
          {rate > 0 ? (
            <>
              В том числе НДС {rate}%: <span className="tnum">{r(vat)}</span>
            </>
          ) : (
            <>Без НДС</>
          )}
        </div>
        <div className="mt-1 text-sm">
          Всего к оплате: <span className="tnum font-semibold">{r(subtotal)}</span>
        </div>
      </div>

      {doc.note && <div className="mt-4 text-[12.5px] text-slate-600">{doc.note}</div>}

      {!isInvoice && (
        <div className="mt-4 text-[12.5px]">
          Работы (услуги) выполнены полностью и в срок. Заказчик претензий по объёму, качеству и
          срокам не имеет.
        </div>
      )}

      <div className="mt-10 flex justify-between text-[12.5px]">
        <div>
          {sellerLabel}: ______________ / {org.fio || org.name}
          <div className="mt-1 text-slate-400">М.П.</div>
        </div>
        {!isInvoice && (
          <div>
            {buyerLabel}: ______________ / {doc.buyer || '________'}
            <div className="mt-1 text-slate-400">М.П.</div>
          </div>
        )}
      </div>

      <div className="mt-6 text-[11px] text-slate-400">
        Документ сформирован в «СвояКнига» {formatDate(new Date().toISOString().slice(0, 10))}.
        {org.usnObject && ' ИП на УСН — НДС не облагается, если не выбрана ставка.'}
      </div>
    </div>
  )
}
