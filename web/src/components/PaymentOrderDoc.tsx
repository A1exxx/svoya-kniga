import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import { rublesToWords } from '../lib/numberToWords'
import type { Payment } from '../state/paymentsStore'

const r = (n: number) => formatRub(n, { kopecks: true })

/** КБК единого налогового платежа (ЕНП) — поле 104 при пополнении ЕНС. */
const ENP_KBK = '18201061201010000510'

/**
 * Печатная форма платёжного поручения (форма 0401060 по ОКУД).
 * Плательщик = организация (ИП), получатель — из платёжки. Для ЕНС показываем
 * бюджетные поля (статус 101, КБК 104, ОКТМО 105 и т.д.).
 */
export function PaymentOrderDoc({ org, payment }: { org: Org; payment: Payment }) {
  const isEns = payment.kind === 'ens'
  const cell = 'border border-slate-400 px-1.5 py-1 align-top'
  const lbl = 'text-[10px] text-slate-500'

  return (
    <div className="text-[12px]">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div>
            Поступ. в банк плат. <span className="text-slate-400">_____________</span>
          </div>
          <div>
            Списано со сч. плат. <span className="text-slate-400">_____________</span>
          </div>
        </div>
        <div className="border border-slate-400 px-3 py-1 text-center">
          <div className={lbl}>0401060</div>
        </div>
      </div>

      <div className="mb-2 flex items-end gap-4">
        <div className="text-base font-semibold">ПЛАТЁЖНОЕ ПОРУЧЕНИЕ № {payment.number || '—'}</div>
        <div>{formatDate(payment.date)}</div>
        <div className="ml-auto flex items-end gap-1">
          <span className={lbl}>Вид платежа</span>
          <span className="min-w-24 border-b border-slate-400">&nbsp;</span>
        </div>
      </div>

      {/* Сумма прописью + цифрами */}
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td className={`${cell} w-24`}>
              <div className={lbl}>Сумма прописью</div>
            </td>
            <td className={cell} colSpan={3}>
              <div className="font-medium">{rublesToWords(payment.amount)}</div>
            </td>
          </tr>
          <tr>
            <td className={cell}>
              <div className={lbl}>ИНН {org.inn || '—'}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>КПП —</div>
            </td>
            <td className={`${cell} w-28`}>
              <div className={lbl}>Сумма</div>
            </td>
            <td className={`${cell} w-44`}>
              <div className="tnum font-semibold">{r(payment.amount)}</div>
            </td>
          </tr>
          <tr>
            <td className={cell} colSpan={2} rowSpan={2}>
              <div className={lbl}>Плательщик</div>
              <div className="font-medium">{org.fio || org.name || '—'}</div>
            </td>
            <td className={`${cell} w-24`}>
              <div className={lbl}>Сч. №</div>
            </td>
            <td className={cell}>
              <div className="tnum">{org.bankAccount || '—'}</div>
            </td>
          </tr>
          <tr>
            <td className={cell}>
              <div className={lbl}>БИК</div>
              <div className="tnum">{org.bik || '—'}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>Сч. № (корр.)</div>
              <div className="tnum text-slate-400">—</div>
            </td>
          </tr>
          <tr>
            <td className={cell} colSpan={2}>
              <div className={lbl}>Банк плательщика</div>
              <div>{org.bankName || '—'}</div>
            </td>
            <td className={cell} colSpan={2}></td>
          </tr>
          <tr>
            <td className={cell} colSpan={2}>
              <div className={lbl}>Банк получателя</div>
              <div>{payment.payeeBank || '—'}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>БИК</div>
              <div className="tnum">{payment.payeeBik || '—'}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>Сч. № (корр.)</div>
              <div className="tnum text-slate-400">—</div>
            </td>
          </tr>
          <tr>
            <td className={cell}>
              <div className={lbl}>ИНН {payment.payeeInn || '—'}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>КПП {payment.payeeKpp || '—'}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>Сч. №</div>
            </td>
            <td className={cell}>
              <div className="tnum">{payment.payeeAccount || '—'}</div>
            </td>
          </tr>
          <tr>
            <td className={cell} colSpan={2}>
              <div className={lbl}>Получатель</div>
              <div className="font-medium">{payment.payeeName || '—'}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>Вид оп.</div>
              <div>01</div>
            </td>
            <td className={cell}>
              <div className={lbl}>Очер. плат.</div>
              <div>{isEns ? '5' : '5'}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Бюджетные поля для ЕНС (поля 101–110) */}
      {isEns && (
        <table className="mt-1 w-full border-collapse">
          <tbody>
            <tr className="text-center">
              {[
                ['101', '01'],
                ['104 (КБК)', ENP_KBK],
                ['105 (ОКТМО)', '0'],
                ['106', '0'],
                ['107', '0'],
                ['108', '0'],
                ['109', '0'],
              ].map(([f, v]) => (
                <td key={f} className={cell}>
                  <div className={lbl}>{f}</div>
                  <div className="tnum text-[11px]">{v}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {/* Назначение платежа */}
      <table className="mt-1 w-full border-collapse">
        <tbody>
          <tr>
            <td className={cell}>
              <div className={lbl}>Назначение платежа</div>
              <div className="min-h-[2.5rem]">{payment.purpose || '—'}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div>Подписи</div>
          <div className="mt-3 flex items-end gap-1.5">
            {org.signature ? (
              <img src={org.signature} alt="Подпись" className="h-9 object-contain" />
            ) : (
              <span>______________</span>
            )}
          </div>
          {org.stamp ? (
            <img src={org.stamp} alt="Печать" className="mt-1 h-16 object-contain" />
          ) : (
            <div className="mt-1 text-slate-400">М.П.</div>
          )}
        </div>
        <div className="text-right text-slate-500">
          <div className={lbl}>Отметки банка</div>
          <div className="mt-6 border-t border-slate-300 pt-1 text-[11px]">&nbsp;</div>
        </div>
      </div>

      <div className="mt-4 text-[11px] text-slate-400">
        Документ сформирован в «СвояКнига» {formatDate(new Date().toISOString().slice(0, 10))}.
        Форма 0401060 (ОКУД). Перед отправкой сверьте реквизиты с банком.
      </div>
    </div>
  )
}
