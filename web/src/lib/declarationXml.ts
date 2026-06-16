/**
 * Генерация XML налоговой декларации по УСН (КНД 1152017).
 *
 * Конверт документа (Файл/Документ/СвНП/Подписант) построен по формату ФНС.
 * Действующая форма за 2025 год — приказ ФНС ЕД-7-3/1017@ от 26.11.2025 (с 28.02.2026):
 * добавлены строки 150–162 («Доходы») и 290–320 («Д−Р») — взносы ИП нарастающим итогом
 * по кварталам. Здесь заполняем годовые строки из расчёта; поквартальные — при
 * поквартальном учёте.
 *
 * ⚠️ ДЕМО-ГЕНЕРАЦИЯ ФОРМАТА. Перед реальной сдачей файл обязательно сверить с
 * актуальной XSD на format.nalog.ru и прогнать через «Налогоплательщик ЮЛ»
 * (форматно-логический контроль). Точная раскладка элементов разделов и
 * кодировка windows-1251 финализируются на этапе подключения отправки.
 */
import type { Org } from '../state/orgStore'
import type { Computed } from './compute'

type Num = number | { toNumber: () => number } | null | undefined

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Целые рубли (декларация заполняется в полных рублях). */
const rub = (d: Num): string => {
  const n = d == null ? 0 : typeof d === 'number' ? d : d.toNumber()
  return String(Math.round(n))
}

function nowYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function fileId(org: Org): string {
  let guid = 'DEMO0000-0000-0000-0000-000000000000'
  try {
    guid = crypto.randomUUID().toUpperCase()
  } catch {
    /* ignore */
  }
  const inn = org.inn || '000000000000'
  return `NO_USN_0000_0000_${inn}0000_${nowYmd()}_${guid}`
}

function splitFio(s: string): { fam: string; nam: string; otch: string } {
  const parts = (s || '').trim().split(/\s+/).filter(Boolean)
  return { fam: parts[0] || '', nam: parts[1] || '', otch: parts.slice(2).join(' ') }
}

/** Строка раздела: код строки + значение. */
function line(code: string, value: string): string {
  return `        <ПоказательСтр КодСтр="${code}" Знач="${esc(value)}"/>`
}

/** XML декларации по УСН (КНД 1152017). Возвращает строку XML. */
export function declarationUsnXml(org: Org, computed: Computed): string {
  const isIncome = org.usnObject === 'income'
  const ratePct = computed.usn.rate.times(100).toNumber()
  const kbk = isIncome ? '18210501011011000110' : '18210501021011000110'
  const dateDoc = new Date().toLocaleDateString('ru-RU')
  const { fam, nam, otch } = splitFio(org.fio || org.name || '')
  const p0 = computed.usn.periods[0]

  // --- Раздел расчёта (2.1.1 «доходы» или 2.2 «доходы−расходы») ---
  // У нас годовой расчёт (один период) — заполняем годовые строки; поквартальные
  // появятся при поквартальном учёте.
  const calcSection = isIncome
    ? [
        `      <РасчНалог_Дох ПризнНП="${org.hasEmployees ? '2' : '1'}">`,
        line('113', rub(p0.tax_base_cumulative)), // доходы за налоговый период
        line('123', String(ratePct)), // ставка налога, %
        line('133', rub(p0.tax_before_deduction_cumulative)), // налог исчисленный
        line('143', rub(p0.deduction_cumulative)), // взносы, уменьшающие налог
        `      </РасчНалог_Дох>`,
      ]
    : [
        `      <РасчНалог_ДохРасх>`,
        line('213', rub(org.income)), // доходы
        line('223', rub(org.expenses)), // расходы
        line('243', rub(p0.tax_base_cumulative)), // налоговая база
        line('263', String(ratePct)), // ставка налога, %
        line('273', rub(computed.usn.tax_year_computed)), // налог исчисленный
        line('280', rub(computed.usn.min_tax)), // минимальный налог (1%)
        `      </РасчНалог_ДохРасх>`,
      ]

  // --- Раздел 1.1 / 1.2 «Сумма налога к уплате» ---
  const sumSection = [
    `      <СумУСН ${isIncome ? 'Раздел="1.1"' : 'Раздел="1.2"'} КБК="${kbk}" ОКТМО="00000000">`,
    line('100', rub(computed.usn.tax_year_final)), // налог к уплате за год
    computed.usn.year_overpayment.toNumber() > 0
      ? line('110', rub(computed.usn.year_overpayment)) // к уменьшению
      : '',
    !isIncome && computed.usn.min_tax.gt(computed.usn.tax_year_computed)
      ? line('120', rub(computed.usn.min_tax)) // мин. налог к уплате
      : '',
    `      </СумУСН>`,
  ].filter(Boolean)

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- ДЕМО-генерация формата ФНС. Перед сдачей сверить с XSD на format.nalog.ru. -->`,
    `<Файл ИдФайл="${esc(fileId(org))}" ВерсПрог="СвояКнига 1.0" ВерсФорм="5.03">`,
    `  <Документ КНД="1152017" ДатаДок="${dateDoc}" Период="34" ОтчетГод="${org.year}" КодНО="0000" НомКорр="0" ПоМесту="120">`,
    `    <СвНП>`,
    `      <НПФЛ ИННФЛ="${esc(org.inn || '')}">`,
    `        <ФИО Фамилия="${esc(fam)}" Имя="${esc(nam)}"${otch ? ` Отчество="${esc(otch)}"` : ''}/>`,
    `      </НПФЛ>`,
    `    </СвНП>`,
    `    <Подписант ПрПодп="1">`,
    `      <ФИО Фамилия="${esc(fam)}" Имя="${esc(nam)}"${otch ? ` Отчество="${esc(otch)}"` : ''}/>`,
    `    </Подписант>`,
    `    <УСН ОбъектНалог="${isIncome ? '1' : '2'}">`,
    ...sumSection,
    ...calcSection,
    `    </УСН>`,
    `  </Документ>`,
    `</Файл>`,
  ]

  return xml.join('\n')
}

/** Имя файла для скачивания. */
export function declarationFileName(org: Org): string {
  const inn = org.inn || 'IP'
  return `Деклараци_УСН_${inn}_${org.year}.xml`
}
