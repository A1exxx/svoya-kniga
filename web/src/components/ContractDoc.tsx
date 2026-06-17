import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import { docTotals, type Doc, type ContractKind } from '../state/docsStore'
import { rublesToWords } from '../lib/numberToWords'

const r = (n: number) => formatRub(n, { kopecks: true })

interface KindCfg {
  title: string
  sellerRole: string
  buyerRole: string
  subject: string
  showItems: boolean
}

const KINDS: Record<ContractKind, KindCfg> = {
  services: {
    title: 'возмездного оказания услуг',
    sellerRole: 'Исполнитель',
    buyerRole: 'Заказчик',
    subject: 'Исполнитель обязуется оказать Заказчику услуги, а Заказчик — принять и оплатить их в следующем составе:',
    showItems: true,
  },
  supply: {
    title: 'поставки',
    sellerRole: 'Поставщик',
    buyerRole: 'Покупатель',
    subject: 'Поставщик обязуется передать в собственность Покупателю товар, а Покупатель — принять и оплатить его в следующем составе:',
    showItems: true,
  },
  work: {
    title: 'подряда',
    sellerRole: 'Подрядчик',
    buyerRole: 'Заказчик',
    subject: 'Подрядчик обязуется выполнить по заданию Заказчика работы и сдать их результат, а Заказчик — принять и оплатить:',
    showItems: true,
  },
  rent: {
    title: 'аренды',
    sellerRole: 'Арендодатель',
    buyerRole: 'Арендатор',
    subject: 'Арендодатель обязуется предоставить Арендатору во временное владение и пользование имущество, а Арендатор — вносить арендную плату:',
    showItems: true,
  },
  nda: {
    title: 'о неразглашении конфиденциальной информации (NDA)',
    sellerRole: 'Сторона 1',
    buyerRole: 'Сторона 2',
    subject: 'Стороны обязуются не раскрывать третьим лицам и не использовать в иных целях конфиденциальную информацию, полученную в рамках сотрудничества.',
    showItems: false,
  },
  offer: {
    title: 'публичная оферта',
    sellerRole: 'Исполнитель',
    buyerRole: 'Заказчик (акцептант)',
    subject: 'Настоящий документ является публичной офертой. Акцепт оферты (оплата) означает согласие Заказчика с условиями оказания услуг:',
    showItems: true,
  },
}

/** Печатная форма договора. Вид договора выбирается в карточке документа (doc.contractKind). */
export function ContractDoc({ org, doc }: { org: Org; doc: Doc }) {
  const cfg = KINDS[doc.contractKind ?? 'services']
  const { subtotal, rate, vat } = docTotals(doc)
  const seller = org.fio || org.name || '—'

  return (
    <div className="text-[12.5px] leading-relaxed">
      <div className="text-center text-base font-semibold">
        Договор {cfg.title} № {doc.number}
      </div>
      <div className="mt-1 flex justify-between text-slate-600">
        <span>г. {org.address ? org.address.split(',')[0] : '____________'}</span>
        <span>{formatDate(doc.date)}</span>
      </div>

      <p className="mt-4">
        <b>{seller}</b>
        {org.inn && <>, ИНН {org.inn}</>}, именуемый в дальнейшем «{cfg.sellerRole}», с одной стороны, и{' '}
        <b>{doc.buyer || '____________'}</b>
        {doc.buyerDetails && <> ({doc.buyerDetails})</>}, именуемый в дальнейшем «{cfg.buyerRole}», с
        другой стороны, заключили настоящий договор о нижеследующем.
      </p>

      <div className="mt-4 font-semibold">1. Предмет договора</div>
      <p>{cfg.subject}</p>
      {cfg.showItems && (
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr className="border-y border-slate-300 text-left">
              <th className="w-8 py-1 pr-2 font-semibold">№</th>
              <th className="py-1 pr-2 font-semibold">Наименование</th>
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
      )}

      {cfg.showItems && (
        <>
          <div className="mt-4 font-semibold">2. Цена и порядок расчётов</div>
          <p>
            Общая стоимость составляет <b>{r(subtotal)}</b> ({rublesToWords(subtotal)}).{' '}
            {rate > 0 ? `В том числе НДС ${rate}% — ${r(vat)}.` : 'НДС не облагается.'} Оплата
            производится в течение 5 (пяти) рабочих дней с момента подписания акта.
          </p>
        </>
      )}

      <div className="mt-4 font-semibold">{cfg.showItems ? '3.' : '2.'} Срок действия</div>
      <p>Договор действует с момента подписания и до полного исполнения сторонами обязательств.</p>

      <div className="mt-4 font-semibold">{cfg.showItems ? '4.' : '3.'} Ответственность сторон</div>
      <p>
        За неисполнение обязательств стороны несут ответственность в соответствии с действующим
        законодательством Российской Федерации.
      </p>

      {doc.note && <p className="mt-3 text-slate-600">{doc.note}</p>}

      <div className="mt-6 font-semibold">Реквизиты и подписи сторон</div>
      <table className="mt-2 w-full align-top">
        <tbody>
          <tr className="align-top">
            <td className="w-1/2 py-1 pr-4">
              <div className="font-medium">{cfg.sellerRole}</div>
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
              <div className="font-medium">{cfg.buyerRole}</div>
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
