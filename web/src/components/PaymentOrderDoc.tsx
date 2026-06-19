import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import { rublesToWords } from '../lib/numberToWords'
import type { Payment } from '../state/paymentsStore'
import { ENS_PAYEE, ENP_KBK, INJURY_KBK } from '../lib/treasuryEns'

const r = (n: number) => formatRub(n, { kopecks: true })
const dash = '—'

/**
 * Печатная форма платёжного поручения (форма 0401060 по ОКУД, Положение Банка
 * России № 762-П, приложение 2). Плательщик = организация (ИП).
 *
 * Для пополнения ЕНС реквизиты получателя подставляются официальные —
 * Казначейство России (ФНС), единый счёт в Туле (см. lib/treasuryEns). Для
 * травматизма — СФР (статус и КБК отличаются). Для прочих платежей — реквизиты
 * получателя из платёжки. Корр. счета банков берутся из реквизитов / справочника.
 */
export function PaymentOrderDoc({ org, payment }: { org: Org; payment: Payment }) {
  const isEns = payment.kind === 'ens'
  const isInjury = payment.kind === 'injury'
  const isBudget = isEns || isInjury

  // Реквизиты получателя: для ЕНС — официальные (Казначейство, Тула), иначе из платёжки.
  const payee = isEns
    ? {
        name: ENS_PAYEE.name,
        inn: ENS_PAYEE.inn,
        kpp: ENS_PAYEE.kpp,
        account: ENS_PAYEE.account,
        bank: ENS_PAYEE.bank,
        bik: ENS_PAYEE.bik,
        corr: ENS_PAYEE.corrAccount,
      }
    : {
        name: payment.payeeName,
        inn: payment.payeeInn,
        kpp: payment.payeeKpp,
        account: payment.payeeAccount,
        bank: payment.payeeBank,
        bik: payment.payeeBik,
        corr: payment.payeeCorrAccount || '',
      }

  // Очерёдность платежа (поле 21): зарплата — 3, налоги/прочее — 5.
  const priority = payment.kind === 'salary' ? '3' : '5'
  // Статус плательщика (поле 101): ИП по своим налогам — 13; за работников — 02; иначе пусто.
  const payerStatus = isEns ? '13' : isInjury ? '08' : ''
  const budgetKbk = isInjury ? INJURY_KBK : ENP_KBK
  const budgetOktmo = isInjury ? org.oktmo || '0' : '0'

  const cell = 'border border-slate-400 px-1.5 py-1 align-top'
  const lbl = 'text-[10px] text-slate-500'
  const num = 'tnum text-[11px]'

  const vatNote =
    payment.vat && payment.vat !== 'none'
      ? `. В том числе НДС ${payment.vat}% = ${r(
          (payment.amount * Number(payment.vat)) / (100 + Number(payment.vat))
        )}`
      : isBudget
        ? '. НДС не облагается'
        : ''

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
        <div className="text-base font-semibold">
          ПЛАТЁЖНОЕ ПОРУЧЕНИЕ № {payment.number || dash}
        </div>
        <div>{formatDate(payment.date)}</div>
        <div className="ml-auto flex items-end gap-1">
          <span className={lbl}>Вид платежа</span>
          <span className="min-w-24 border-b border-slate-400">&nbsp;</span>
        </div>
      </div>

      <table className="w-full border-collapse">
        <tbody>
          {/* Сумма прописью */}
          <tr>
            <td className={`${cell} w-28`}>
              <div className={lbl}>Сумма прописью</div>
            </td>
            <td className={cell} colSpan={3}>
              <div className="font-medium">{rublesToWords(payment.amount)}</div>
            </td>
          </tr>

          {/* ИНН/КПП плательщика + Сумма цифрами */}
          <tr>
            <td className={cell}>
              <div className={lbl}>ИНН {org.inn || dash}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>КПП {dash}</div>
            </td>
            <td className={`${cell} w-24`}>
              <div className={lbl}>Сумма</div>
            </td>
            <td className={`${cell} w-44`}>
              <div className="tnum font-semibold">{r(payment.amount)}</div>
            </td>
          </tr>

          {/* Плательщик + его расчётный счёт */}
          <tr>
            <td className={cell} colSpan={2} rowSpan={2}>
              <div className={lbl}>Плательщик</div>
              <div className="font-medium">{org.fio || org.name || dash}</div>
            </td>
            <td className={`${cell} w-24`}>
              <div className={lbl}>Сч. №</div>
            </td>
            <td className={cell}>
              <div className={num}>{org.bankAccount || dash}</div>
            </td>
          </tr>

          {/* Банк плательщика + БИК + корр. счёт */}
          <tr>
            <td className={cell}>
              <div className={lbl}>БИК</div>
              <div className={num}>{org.bik || dash}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>Сч. № (корр.)</div>
              <div className={`${num} ${org.corrAccount ? '' : 'text-slate-400'}`}>
                {org.corrAccount || dash}
              </div>
            </td>
          </tr>
          <tr>
            <td className={cell} colSpan={2}>
              <div className={lbl}>Банк плательщика</div>
              <div>{org.bankName || dash}</div>
            </td>
            <td className={cell} colSpan={2}></td>
          </tr>

          {/* Банк получателя + БИК + корр. счёт */}
          <tr>
            <td className={cell} colSpan={2}>
              <div className={lbl}>Банк получателя</div>
              <div>{payee.bank || dash}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>БИК</div>
              <div className={num}>{payee.bik || dash}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>Сч. № (корр.)</div>
              <div className={`${num} ${payee.corr ? '' : 'text-slate-400'}`}>
                {payee.corr || dash}
              </div>
            </td>
          </tr>

          {/* ИНН/КПП получателя + его счёт */}
          <tr>
            <td className={cell}>
              <div className={lbl}>ИНН {payee.inn || dash}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>КПП {payee.kpp || dash}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>Сч. №</div>
            </td>
            <td className={cell}>
              <div className={num}>{payee.account || dash}</div>
            </td>
          </tr>

          {/* Получатель + Вид оп. / Очер. плат. */}
          <tr>
            <td className={cell} colSpan={2}>
              <div className={lbl}>Получатель</div>
              <div className="font-medium">{payee.name || dash}</div>
            </td>
            <td className={cell}>
              <div className={lbl}>Вид оп.</div>
              <div>01</div>
            </td>
            <td className={cell}>
              <div className={lbl}>Очер. плат.</div>
              <div>{priority}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Бюджетные поля (101–109): ЕНС или травматизм в СФР */}
      {isBudget && (
        <table className="mt-1 w-full border-collapse text-center">
          <tbody>
            <tr>
              {[
                ['101', payerStatus || '0'],
                ['104 (КБК)', budgetKbk],
                ['105 (ОКТМО)', budgetOktmo],
                ['106', '0'],
                ['107', '0'],
                ['108', '0'],
                ['109', '0'],
              ].map(([f, v]) => (
                <td key={f} className={cell}>
                  <div className={lbl}>{f}</div>
                  <div className={num}>{v}</div>
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
              <div className="min-h-[2.5rem]">
                {payment.purpose || (isEns ? 'Единый налоговый платёж' : dash)}
                {vatNote}
              </div>
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
        Форма 0401060 (ОКУД).{' '}
        {isEns
          ? 'Реквизиты получателя — Казначейство России (ФНС), единый счёт ЕНП (Тула).'
          : 'Перед отправкой сверьте реквизиты с банком.'}
      </div>
    </div>
  )
}
