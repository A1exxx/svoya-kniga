import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import { docTotals, type Doc } from '../state/docsStore'
import { rublesToWords } from '../lib/numberToWords'

const r = (n: number) => formatRub(n, { kopecks: true })

/** Печатная форма счёта на оплату или акта выполненных работ. Продавец = организация. */
export function InvoiceDoc({ org, doc }: { org: Org; doc: Doc }) {
  const { subtotal, rate, vat } = docTotals(doc)
  const isInvoice = doc.type === 'invoice'
  const isAct = doc.type === 'act'
  const sellerLabel = isAct ? 'Исполнитель' : 'Поставщик'
  const buyerLabel = isAct ? 'Заказчик' : 'Покупатель'
  const TITLES: Record<Doc['type'], string> = {
    invoice: `Счёт на оплату № ${doc.number} от ${formatDate(doc.date)}`,
    act: `Акт № ${doc.number} от ${formatDate(doc.date)} выполненных работ (оказанных услуг)`,
    waybill: `Товарная накладная (ТОРГ-12) № ${doc.number} от ${formatDate(doc.date)}`,
    upd: `Универсальный передаточный документ (УПД) № ${doc.number} от ${formatDate(doc.date)}`,
    contract: `Договор № ${doc.number} от ${formatDate(doc.date)}`,
  }
  const title = TITLES[doc.type]
  const cell = 'border border-slate-400 px-1.5 py-1 align-top'
  const lbl = 'text-[10px] text-slate-500'

  return (
    <div>
      {org.logo && <img src={org.logo} alt="Логотип" className="mb-3 max-h-14 object-contain" />}

      {/* Банковские реквизиты получателя (как в классическом счёте) — только для счёта */}
      {isInvoice && (
        <table className="mb-3 w-full border-collapse text-[11px]">
          <tbody>
            <tr>
              <td className={cell} rowSpan={2}>
                <div className={lbl}>Банк получателя</div>
                <div className="font-medium">{org.bankName || '—'}</div>
              </td>
              <td className={`${cell} w-20`}>
                <div className={lbl}>БИК</div>
                <div className="tnum">{org.bik || '—'}</div>
              </td>
              <td className={`${cell} w-48`} rowSpan={2}>
                <div className={lbl}>Сч. №</div>
                <div className="tnum">{org.bankAccount || '—'}</div>
              </td>
            </tr>
            <tr>
              <td className={cell}>
                <div className={lbl}>Сч. № (корр.)</div>
                <div className="tnum text-slate-400">—</div>
              </td>
            </tr>
            <tr>
              <td className={cell} colSpan={2}>
                <div className={lbl}>Получатель — ИНН {org.inn || '—'}, КПП —</div>
                <div className="font-medium">{org.fio || org.name || '—'}</div>
              </td>
              <td className={cell}>
                <div className={lbl}>Сч. №</div>
                <div className="tnum">{org.bankAccount || '—'}</div>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="text-lg font-semibold">{title}</div>

      <table className="mt-4 w-full text-[12.5px]">
        <tbody>
          <tr className="align-top">
            <td className="w-28 py-1 text-slate-500">{sellerLabel}</td>
            <td className="py-1 font-medium">
              {org.fio || org.name || '—'}
              {org.inn && <>, ИНН {org.inn}</>}
              {org.address && <span className="font-normal text-slate-600">, {org.address}</span>}
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

      <div className="mt-3 text-[12.5px]">
        Всего наименований {doc.items.length}, на сумму {r(subtotal)}
        <div className="font-medium">{rublesToWords(subtotal)}</div>
      </div>

      {doc.note && <div className="mt-4 text-[12.5px] text-slate-600">{doc.note}</div>}

      {isInvoice && (
        <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          Внимание! Оплата данного счёта означает согласие с условиями поставки товара (оказания
          услуг). Счёт действителен в течение 5 банковских дней. Товар (услуга) отпускается по факту
          поступления денег на расчётный счёт получателя.
        </div>
      )}

      {!isInvoice && (
        <div className="mt-4 text-[12.5px]">
          Работы (услуги) выполнены полностью и в срок. Заказчик претензий по объёму, качеству и
          срокам не имеет.
        </div>
      )}

      {isInvoice ? (
        <div className="mt-10 text-[12.5px]">
          <div className="flex items-end gap-1.5">
            <span>Руководитель</span>
            {org.signature ? (
              <img src={org.signature} alt="Подпись" className="h-9 object-contain" />
            ) : (
              <span>______________</span>
            )}
            <span>/ {org.fio || org.name || '________'}</span>
            {org.stamp && <img src={org.stamp} alt="Печать" className="ml-4 h-16 object-contain" />}
          </div>
          <div className="mt-3 flex items-end gap-1.5">
            <span>Главный бухгалтер ______________ / {org.fio || org.name || '________'}</span>
          </div>
          {!org.stamp && <div className="mt-2 text-slate-400">М.П.</div>}
        </div>
      ) : (
        <div className="mt-10 flex justify-between text-[12.5px]">
          <div>
            <div className="flex items-end gap-1.5">
              <span>{sellerLabel}:</span>
              {org.signature ? (
                <img src={org.signature} alt="Подпись" className="h-9 object-contain" />
              ) : (
                <span>______________</span>
              )}
              <span>/ {org.fio || org.name}</span>
            </div>
            {org.stamp ? (
              <img src={org.stamp} alt="Печать" className="mt-1 h-16 object-contain" />
            ) : (
              <div className="mt-1 text-slate-400">М.П.</div>
            )}
          </div>
          <div>
            {buyerLabel}: ______________ / {doc.buyer || '________'}
            <div className="mt-1 text-slate-400">М.П.</div>
          </div>
        </div>
      )}

      <div className="mt-6 text-[11px] text-slate-400">
        Документ сформирован в «СвояКнига» {formatDate(new Date().toISOString().slice(0, 10))}.
        {org.usnObject && ' ИП на УСН — НДС не облагается, если не выбрана ставка.'}
      </div>
    </div>
  )
}
