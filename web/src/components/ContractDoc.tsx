import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import { docTotals, type Doc } from '../state/docsStore'
import { rublesToWords } from '../lib/numberToWords'

const r = (n: number) => formatRub(n, { kopecks: true })

/** Печатная форма договора возмездного оказания услуг (шаблон, заполняется из документа). */
export function ContractDoc({ org, doc }: { org: Org; doc: Doc }) {
  const { subtotal, rate, vat } = docTotals(doc)
  const seller = org.fio || org.name || '—'

  return (
    <div className="text-[12.5px] leading-relaxed">
      <div className="text-center text-base font-semibold">
        Договор возмездного оказания услуг № {doc.number}
      </div>
      <div className="mt-1 flex justify-between text-slate-600">
        <span>г. {org.address ? org.address.split(',')[0] : '____________'}</span>
        <span>{formatDate(doc.date)}</span>
      </div>

      <p className="mt-4">
        <b>{seller}</b>
        {org.inn && <>, ИНН {org.inn}</>}, именуемый в дальнейшем «Исполнитель», с одной стороны, и{' '}
        <b>{doc.buyer || '____________'}</b>
        {doc.buyerDetails && <> ({doc.buyerDetails})</>}, именуемый в дальнейшем «Заказчик», с
        другой стороны, заключили настоящий договор о нижеследующем.
      </p>

      <div className="mt-4 font-semibold">1. Предмет договора</div>
      <p>
        Исполнитель обязуется оказать Заказчику услуги, а Заказчик — принять и оплатить их в
        следующем составе:
      </p>
      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="border-y border-slate-300 text-left">
            <th className="w-8 py-1 pr-2 font-semibold">№</th>
            <th className="py-1 pr-2 font-semibold">Услуга</th>
            <th className="w-16 py-1 pr-2 text-right font-semibold">Кол-во</th>
            <th className="w-28 py-1 text-right font-semibold">Стоимость</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it, i) => (
            <tr key={i} className="border-b border-slate-200 align-top">
              <td className="py-1 pr-2">{i + 1}</td>
              <td className="py-1 pr-2">{it.name || '—'}</td>
              <td className="tnum py-1 pr-2 text-right">{it.qty}</td>
              <td className="tnum py-1 text-right">{r(it.qty * it.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 font-semibold">2. Цена и порядок расчётов</div>
      <p>
        Общая стоимость услуг составляет <b>{r(subtotal)}</b> ({rublesToWords(subtotal)}).{' '}
        {rate > 0 ? `В том числе НДС ${rate}% — ${r(vat)}.` : 'НДС не облагается.'} Оплата
        производится в течение 5 (пяти) рабочих дней с момента подписания акта об оказании услуг.
      </p>

      <div className="mt-4 font-semibold">3. Срок оказания услуг</div>
      <p>Услуги оказываются в согласованные сторонами сроки с момента подписания договора.</p>

      <div className="mt-4 font-semibold">4. Ответственность сторон</div>
      <p>
        За неисполнение обязательств стороны несут ответственность в соответствии с действующим
        законодательством Российской Федерации.
      </p>

      <div className="mt-4 font-semibold">5. Прочие условия</div>
      <p>
        Договор вступает в силу с момента подписания и действует до полного исполнения сторонами
        обязательств. Составлен в двух экземплярах, по одному для каждой стороны.
      </p>

      {doc.note && <p className="mt-3 text-slate-600">{doc.note}</p>}

      <div className="mt-6 font-semibold">6. Реквизиты и подписи сторон</div>
      <table className="mt-2 w-full align-top">
        <tbody>
          <tr className="align-top">
            <td className="w-1/2 py-1 pr-4">
              <div className="font-medium">Исполнитель</div>
              <div className="text-slate-600">
                {seller}
                {org.inn && <>, ИНН {org.inn}</>}
                {org.bankAccount && <>, р/с {org.bankAccount}</>}
                {org.bik && <>, БИК {org.bik}</>}
              </div>
              <div className="mt-6">______________ / {org.fio || org.name}</div>
              <div className="text-slate-400">М.П.</div>
            </td>
            <td className="w-1/2 py-1">
              <div className="font-medium">Заказчик</div>
              <div className="text-slate-600">
                {doc.buyer || '____________'}
                {doc.buyerDetails && <>, {doc.buyerDetails}</>}
              </div>
              <div className="mt-6">______________ / {doc.buyer || '________'}</div>
              <div className="text-slate-400">М.П.</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-6 text-[11px] text-slate-400">
        Шаблон договора сформирован в «СвояКнига». Перед подписанием проверьте условия и при
        необходимости адаптируйте под вашу ситуацию.
      </div>
    </div>
  )
}
