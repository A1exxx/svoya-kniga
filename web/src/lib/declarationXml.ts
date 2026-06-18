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
  const periods = computed.usn.periods
  const quarterly = periods.length === 4
  const yearP = periods[periods.length - 1]
  const annualIncome = quarterly
    ? computed.byQuarter.reduce((s, q) => s + q.income, 0)
    : org.income
  const annualExpense = quarterly
    ? computed.byQuarter.reduce((s, q) => s + q.expense, 0)
    : org.expenses
  const pr = (i: number, fn: (p: (typeof periods)[number]) => { toNumber: () => number }) =>
    rub(periods[i] ? fn(periods[i]) : 0)

  // Накопленные доходы/расходы по периодам (для раздела 2.2 «доходы−расходы»).
  const incCum: number[] = []
  const expCum: number[] = []
  {
    let ai = 0
    let ae = 0
    for (let i = 0; i < 4; i++) {
      ai += computed.byQuarter[i]?.income ?? 0
      ae += computed.byQuarter[i]?.expense ?? 0
      incCum[i] = ai
      expCum[i] = ae
    }
  }

  // --- Раздел расчёта (2.1.1 «доходы» или 2.2 «доходы−расходы») ---
  const calcSection = isIncome
    ? [
        `      <РасчНалог_Дох ПризнНП="${org.hasEmployees ? '2' : '1'}">`,
        ...(quarterly
          ? [
              line('110', pr(0, (p) => p.tax_base_cumulative)),
              line('111', pr(1, (p) => p.tax_base_cumulative)),
              line('112', pr(2, (p) => p.tax_base_cumulative)),
              line('113', pr(3, (p) => p.tax_base_cumulative)),
              line('123', String(ratePct)),
              line('130', pr(0, (p) => p.tax_before_deduction_cumulative)),
              line('131', pr(1, (p) => p.tax_before_deduction_cumulative)),
              line('132', pr(2, (p) => p.tax_before_deduction_cumulative)),
              line('133', pr(3, (p) => p.tax_before_deduction_cumulative)),
              line('140', pr(0, (p) => p.deduction_cumulative)),
              line('141', pr(1, (p) => p.deduction_cumulative)),
              line('142', pr(2, (p) => p.deduction_cumulative)),
              line('143', pr(3, (p) => p.deduction_cumulative)),
            ]
          : [
              line('113', rub(yearP.tax_base_cumulative)),
              line('123', String(ratePct)),
              line('133', rub(yearP.tax_before_deduction_cumulative)),
              line('143', rub(yearP.deduction_cumulative)),
            ]),
        `      </РасчНалог_Дох>`,
      ]
    : [
        `      <РасчНалог_ДохРасх>`,
        ...(quarterly
          ? [
              line('210', rub(incCum[0])),
              line('211', rub(incCum[1])),
              line('212', rub(incCum[2])),
              line('213', rub(incCum[3])),
              line('220', rub(expCum[0])),
              line('221', rub(expCum[1])),
              line('222', rub(expCum[2])),
              line('223', rub(expCum[3])),
              line('240', pr(0, (p) => p.tax_base_cumulative)),
              line('241', pr(1, (p) => p.tax_base_cumulative)),
              line('242', pr(2, (p) => p.tax_base_cumulative)),
              line('243', pr(3, (p) => p.tax_base_cumulative)),
              line('263', String(ratePct)),
              line('270', pr(0, (p) => p.tax_before_deduction_cumulative)),
              line('271', pr(1, (p) => p.tax_before_deduction_cumulative)),
              line('272', pr(2, (p) => p.tax_before_deduction_cumulative)),
              line('273', pr(3, (p) => p.tax_before_deduction_cumulative)),
              line('280', rub(computed.usn.min_tax)),
            ]
          : [
              line('213', rub(annualIncome)),
              line('223', rub(annualExpense)),
              line('243', rub(yearP.tax_base_cumulative)),
              line('263', String(ratePct)),
              line('273', rub(computed.usn.tax_year_computed)),
              line('280', rub(computed.usn.min_tax)),
            ]),
        `      </РасчНалог_ДохРасх>`,
      ]

  // --- Раздел 1.1 / 1.2 «Сумма налога к уплате» ---
  // Минимальный налог (только Д-Р, когда он больше расчётного) идёт в строку 120,
  // обычный налог — в строку 100. Нельзя выводить обе → задвоение обязательства.
  const minApplied = !isIncome && computed.usn.min_tax.gt(computed.usn.tax_year_computed)
  const sumLines: string[] = []
  if (quarterly) {
    sumLines.push(line('020', pr(0, (p) => p.advance_due_this_period)))
    sumLines.push(line('040', pr(1, (p) => p.advance_due_this_period)))
    if (periods[1].overpayment_this_period.toNumber() > 0)
      sumLines.push(line('050', pr(1, (p) => p.overpayment_this_period))) // к уменьшению за полугодие
    sumLines.push(line('070', pr(2, (p) => p.advance_due_this_period)))
    if (periods[2].overpayment_this_period.toNumber() > 0)
      sumLines.push(line('080', pr(2, (p) => p.overpayment_this_period))) // к уменьшению за 9 мес
  }
  if (minApplied) sumLines.push(line('120', rub(computed.usn.year_payment_due)))
  else sumLines.push(line('100', rub(computed.usn.year_payment_due)))
  if (computed.usn.year_overpayment.toNumber() > 0)
    sumLines.push(line('110', rub(computed.usn.year_overpayment)))

  const sumSection = [
    `      <СумУСН ${isIncome ? 'Раздел="1.1"' : 'Раздел="1.2"'} КБК="${kbk}" ОКТМО="00000000">`,
    ...sumLines,
    `      </СумУСН>`,
  ]

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- ДЕМО-генерация формата ФНС. Перед сдачей сверить с XSD на format.nalog.ru. -->`,
    `<Файл ИдФайл="${esc(fileId(org))}" ВерсПрог="СвояКнига 1.0" ВерсФорм="5.03">`,
    `  <Документ КНД="1152017" ДатаДок="${dateDoc}" Период="34" ОтчетГод="${org.year}" КодНО="${esc(org.taxOfficeCode || '0000')}" НомКорр="0" ПоМесту="120">`,
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
