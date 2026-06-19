import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import { docTotals, type Doc } from '../state/docsStore'
import { rublesToWords } from '../lib/numberToWords'
import { paymentQrPayload, paymentQrSvg } from '../lib/paymentQr'

const r = (n: number) => formatRub(n, { kopecks: true })

/** «Логвина Ирина Анатольевна» → «Логвина И.А.» — для расшифровки подписи. */
function shortName(fio: string, fallback: string): string {
  const parts = (fio || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return fallback
  const [last, first, patr] = parts
  let s = last
  if (first) s += ' ' + first[0] + '.'
  if (patr) s += patr[0] + '.'
  return s
}

/**
 * Печатная форма счёта на оплату / акта / накладной / УПД. Продавец = организация.
 * Счёт сделан по образцу Контур.Эльбы: шапка продавца, банковский бокс с корр.счётом,
 * QR-код для оплаты, колонка «Ед.», итоги «Итого к оплате → в т.ч. НДС → прописью».
 */
export function InvoiceDoc({ org, doc }: { org: Org; doc: Doc }) {
  const { subtotal, rate, vat } = docTotals(doc)
  const hasVat = rate > 0
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
  const itemsHeader = isInvoice
    ? 'Товары (работы, услуги)'
    : isAct
      ? 'Наименование работ, услуг'
      : 'Наименование'
  const cell = 'border border-slate-400 px-1.5 py-1 align-top'
  const lbl = 'text-[10px] text-slate-500'
  const sellerShort = shortName(org.fio, org.name || '________')

  // QR оплаты по ГОСТ Р 56042 — только для счёта и при заполненных реквизитах.
  const qrSvg = isInvoice
    ? paymentQrSvg(
        paymentQrPayload(org, {
          sum: subtotal,
          purpose:
            `Оплата по счёту № ${doc.number} от ${formatDate(doc.date)}` +
            (hasVat ? `, в т.ч. НДС ${rate}%` : ', без НДС'),
        })
      )
    : null

  return (
    <div>
      {org.logo && <img src={org.logo} alt="Логотип" className="mb-3 max-h-14 object-contain" />}

      {/* Шапка продавца (ИП + адрес + телефон + e-mail) — как в образце Эльбы, для счёта */}
      {isInvoice && (org.fio || org.name) && (
        <div className="mb-3">
          <div className="font-semibold">{org.fio || org.name}</div>
          {org.address && <div className="text-[11px] text-slate-600">{org.address}</div>}
          {(org.phone || org.email) && (
            <div className="text-[11px] text-slate-600">
              {org.phone && <>Телефон: {org.phone}</>}
              {org.phone && org.email ? '   ' : ''}
              {org.email && <>Эл.почта: {org.email}</>}
            </div>
          )}
        </div>
      )}

      {/* Банковский бокс получателя: корр.счёт банка + расчётный счёт получателя (для счёта) */}
      {isInvoice && (
        <table className="mb-4 w-full border-collapse text-[11px]">
          <tbody>
            <tr>
              <td className={cell} rowSpan={2}>
                <div>{org.bankName || '—'}</div>
                <div className={lbl}>Банк получателя</div>
              </td>
              <td className={`${cell} w-[42%]`}>
                <span className={lbl}>БИК </span>
                <span className="tnum">{org.bik || '—'}</span>
              </td>
            </tr>
            <tr>
              <td className={cell}>
                <span className={lbl}>Сч. № </span>
                <span className={`tnum ${org.corrAccount ? '' : 'text-slate-400'}`}>
                  {org.corrAccount || '—'}
                </span>
              </td>
            </tr>
            <tr>
              <td className={cell}>
                <span className={lbl}>ИНН </span>
                <span className="tnum">{org.inn || '—'}</span>
                <span className={lbl}>  КПП </span>—
              </td>
              <td className={cell}>
                <span className={lbl}>Сч. № </span>
                <span className="tnum">{org.bankAccount || '—'}</span>
              </td>
            </tr>
            <tr>
              <td className={cell}>
                <div className="font-medium">{org.fio || org.name || '—'}</div>
                <div className={lbl}>Получатель</div>
              </td>
              <td className={cell}></td>
            </tr>
          </tbody>
        </table>
      )}

      {/* Заголовок + QR справа (для счёта) */}
      {isInvoice ? (
        <div className="flex items-start justify-between gap-4">
          <div className="text-lg font-semibold">{title}</div>
          {qrSvg && (
            <div className="flex shrink-0 items-start gap-2">
              <div className="h-[88px] w-[88px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="w-24 text-[10px] leading-tight text-slate-600">
                <div className="font-semibold text-ink">QR-код для оплаты</div>
                Отсканируйте код с помощью банковского приложения
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-lg font-semibold">{title}</div>
      )}

      {/* Поставщик / Покупатель */}
      <table className="mt-4 w-full text-[12.5px]">
        <tbody>
          <tr className="align-top">
            <td className="w-28 py-1 text-slate-500">{sellerLabel}:</td>
            <td className="py-1 font-medium">
              {org.fio || org.name || '—'}
              {org.inn && <>, ИНН {org.inn}</>}
              {org.address && <span className="font-normal text-slate-600">, {org.address}</span>}
            </td>
          </tr>
          <tr className="align-top">
            <td className="py-1 text-slate-500">{buyerLabel}:</td>
            <td className="py-1 font-medium">
              {doc.buyer || '—'}
              {doc.buyerDetails && <div className="font-normal text-slate-600">{doc.buyerDetails}</div>}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Таблица позиций — № / Наименование / Кол-во / Ед. / Цена / Сумма (как в образце) */}
      <table className="mt-5 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-y border-slate-300 text-left">
            <th className="w-8 py-1.5 pr-2 font-semibold">№</th>
            <th className="py-1.5 pr-2 font-semibold">{itemsHeader}</th>
            <th className="w-14 py-1.5 pr-2 text-right font-semibold">Кол-во</th>
            <th className="w-12 py-1.5 pr-2 text-center font-semibold">Ед.</th>
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
              <td className="py-1.5 pr-2 text-center text-slate-600">{it.unit || 'шт'}</td>
              <td className="tnum py-1.5 pr-2 text-right">{r(it.price)}</td>
              <td className="tnum py-1.5 text-right">{r(it.qty * it.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Итоги — формат образца: «Итого к оплате» → «В том числе НДС» */}
      <div className="mt-3 flex flex-col items-end gap-0.5 text-[12.5px]">
        <div>
          Итого к оплате: <span className="tnum font-semibold">{r(subtotal)}</span>
        </div>
        {hasVat ? (
          <div className="text-slate-600">
            В том числе НДС {rate}%: <span className="tnum">{r(vat)}</span>
          </div>
        ) : (
          <div className="text-slate-600">Без НДС</div>
        )}
      </div>

      <div className="mt-2 text-[12.5px]">
        Всего наименований {doc.items.length}, на сумму {r(subtotal)}.
        <div className="font-medium">Всего к оплате: {rublesToWords(subtotal)}</div>
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

      {/* Подпись: для счёта — одна строка «Поставщик / должность / подпись / расшифровка» (как в образце) */}
      {isInvoice ? (
        <div className="mt-12 text-[12.5px]">
          <div className="flex items-end gap-4">
            <span className="pb-4 text-slate-600">{sellerLabel}</span>
            <div className="grid flex-1 grid-cols-[1fr_140px_140px] gap-4">
              <div className="text-center">
                <div className="border-b border-slate-400 pb-0.5">Индивидуальный предприниматель</div>
                <div className={lbl}>должность</div>
              </div>
              <div className="text-center">
                <div className="flex h-7 items-end justify-center border-b border-slate-400">
                  {org.signature && <img src={org.signature} alt="Подпись" className="h-8 object-contain" />}
                </div>
                <div className={lbl}>подпись</div>
              </div>
              <div className="text-center">
                <div className="border-b border-slate-400 pb-0.5">{sellerShort}</div>
                <div className={lbl}>расшифровка подписи</div>
              </div>
            </div>
          </div>
          {org.stamp && <img src={org.stamp} alt="Печать" className="mt-1 h-16 object-contain" />}
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
              <span>/ {sellerShort}</span>
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
        {!hasVat && ' Без НДС (ИП на УСН, ставка НДС не выбрана).'}
      </div>
    </div>
  )
}
