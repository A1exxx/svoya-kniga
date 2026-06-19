/**
 * Генерация XML налоговой декларации по НДС (КНД 1151001) — упрощённо для ИП на УСН-плательщика.
 *
 * ⚠️ ДЕМО-ГЕНЕРАЦИЯ. Реальная форма НДС объёмна (разделы 1, 3, 8, 9 + книги покупок/продаж).
 * Здесь заполняем итоговые показатели (раздел 1 — сумма к уплате; раздел 3 — база/ставка/налог)
 * для предпросмотра и проверки. Перед реальной сдачей сверить с XSD format.nalog.ru и
 * «Налогоплательщик ЮЛ». Отправка НДС возможна только через оператора ЭДО (см. Этап «Налоговая»).
 */
import type { Org } from '../state/orgStore'
import type { VatResult } from './taxcore'
import type { VatBooks, VatBookLine } from './vatBooks'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const rub = (d: { toNumber: () => number } | number): string => {
  const n = typeof d === 'number' ? d : d.toNumber()
  return String(Math.round(n))
}

/** Сумма с копейками (для строк книги продаж/покупок — там официально копейки, и так
 *  XML совпадает с печатной формой). */
const rub2 = (d: { toNumber: () => number } | number): string => {
  const n = typeof d === 'number' ? d : d.toNumber()
  return n.toFixed(2)
}

function nowYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

export function vatDeclarationFileName(org: Org): string {
  const inn = org.inn || '000000000000'
  return `NO_NDS_0000_0000_${inn}0000_${nowYmd()}.xml`
}

/** Строки книги (раздел 8/9) в XML. */
function bookXml(tag: string, lines: VatBookLine[]): string[] {
  if (!lines.length) return []
  const rows = lines.map(
    (l) =>
      `      <${tag}Запись НомПор="${l.num}" Контрагент="${esc(l.party)}" ` +
      `СтоимВсего="${rub2(l.withVat)}" Ставка="${l.rate}" СумНДС="${rub2(l.vat)}"/>`
  )
  return [`    <${tag}>`, ...rows, `    </${tag}>`]
}

/**
 * @param periodCode код налогового периода (квартал): 21=I, 22=II, 23=III, 24=IV.
 * @param books строки книг продаж/покупок (раздел 9 / раздел 8). Раздел 8 — только для общей ставки.
 */
export function vatDeclarationXml(
  org: Org,
  vat: VatResult,
  periodCode = '24',
  books?: VatBooks
): string {
  const inn = org.inn || ''
  const oktmo = org.oktmo || '00000000'
  const toPay = rub(vat.vat)
  // Раздел 3 «СумНал» — ИСЧИСЛЕННЫЙ налог с реализации (до вычета) = output_vat из taxcore.
  // Раньше считали как vat+вычет: при входящем НДС больше исходящего это давало сумму
  // ВЫЧЕТА вместо налога с реализации (форма становилась внутренне противоречивой).
  const assessed = rub(vat.output_vat)
  const base = rub(vat.base)
  const rate = vat.rate.toNumber()
  const special = vat.mode === 'rate5' || vat.mode === 'rate7'

  // Раздел 9 — книга продаж (всегда при наличии реализации с НДС).
  // Раздел 8 — книга покупок (вычеты) — только при общей ставке (5/7% — без вычета).
  const sec9 = books ? bookXml('Раздел9', books.sales) : []
  const sec8 = books && !special ? bookXml('Раздел8', books.purchases) : []

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Файл ИдФайл="${esc(vatDeclarationFileName(org).replace(/\.xml$/, ''))}" ВерсПрог="СвояКнига" ВерсФорм="5.08">`,
    '  <Документ КНД="1151001" ДатаДок="' + nowYmd() + '" Период="' + periodCode + '" ОтчетГод="' + org.year + '">',
    `    <СвНП><НПИП ИННФЛ="${esc(inn)}"/></СвНП>`,
    '    <НДС>',
    `      <Раздел1 ОКТМО="${esc(oktmo)}" КБК="18210301000011000110" НалПУ="${toPay}"/>`,
    `      <Раздел3 НалБаза="${base}" Ставка="${rate}" СумНал="${assessed}" ` +
      `ВычетВходящий="${rub(vat.input_vat_deducted)}"/>`,
    ...sec8,
    ...sec9,
    '    </НДС>',
    '  </Документ>',
    '</Файл>',
  ].join('\n')
}
