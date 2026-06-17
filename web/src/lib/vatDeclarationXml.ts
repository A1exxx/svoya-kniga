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

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const rub = (d: { toNumber: () => number } | number): string => {
  const n = typeof d === 'number' ? d : d.toNumber()
  return String(Math.round(n))
}

function nowYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

export function vatDeclarationFileName(org: Org): string {
  const inn = org.inn || '000000000000'
  return `NO_NDS_0000_0000_${inn}0000_${nowYmd()}.xml`
}

/**
 * @param periodCode код налогового периода (квартал): 21=I, 22=II, 23=III, 24=IV.
 */
export function vatDeclarationXml(org: Org, vat: VatResult, periodCode = '24'): string {
  const inn = org.inn || ''
  const oktmo = org.oktmo || '00000000'
  const toPay = rub(vat.vat)
  const base = rub(vat.base)
  const rate = vat.rate.toNumber()

  return [
    '<?xml version="1.0" encoding="windows-1251"?>',
    `<Файл ИдФайл="${esc(vatDeclarationFileName(org).replace(/\.xml$/, ''))}" ВерсПрог="СвояКнига" ВерсФорм="5.08">`,
    '  <Документ КНД="1151001" ДатаДок="' + nowYmd() + '" Период="' + periodCode + '" ОтчетГод="' + org.year + '">',
    `    <СвНП><НПИП ИННФЛ="${esc(inn)}"/></СвНП>`,
    '    <НДС>',
    `      <Раздел1 ОКТМО="${esc(oktmo)}" КБК="18210301000011000110" НалПУ="${toPay}"/>`,
    `      <Раздел3 НалБаза="${base}" Ставка="${rate}" СумНал="${toPay}" ` +
      `ВычетВходящий="${rub(vat.input_vat_deducted)}"/>`,
    '    </НДС>',
    '  </Документ>',
    '</Файл>',
  ].join('\n')
}
