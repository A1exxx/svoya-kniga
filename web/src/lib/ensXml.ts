/**
 * Генерация XML уведомления об исчисленных суммах налогов (КНД 1110355).
 * Форма по приказу ФНС от 02.11.2022 № ЕД-7-8/1047@ (ред. от 16.01.2024).
 *
 * ⚠️ ДЕМО-ГЕНЕРАЦИЯ ФОРМАТА. Перед реальной отправкой сверить с XSD на
 * format.nalog.ru. ОКТМО и код инспекции подставляются из реквизитов.
 */
import type { Org } from '../state/orgStore'
import type { Computed } from './compute'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const rub = (d: number | { toNumber: () => number } | null | undefined): string => {
  const n = d == null ? 0 : typeof d === 'number' ? d : d.toNumber()
  return String(Math.round(n))
}

function splitFio(s: string): { fam: string; nam: string; otch: string } {
  const parts = (s || '').trim().split(/\s+/).filter(Boolean)
  return { fam: parts[0] || '', nam: parts[1] || '', otch: parts.slice(2).join(' ') }
}

export function ensNotificationXml(org: Org, computed: Computed): string {
  const isIncome = org.usnObject === 'income'
  const kbk = isIncome ? '18210501011011000110' : '18210501021011000110'
  const dateDoc = new Date().toLocaleDateString('ru-RU')
  const { fam, nam, otch } = splitFio(org.fio || org.name || '')

  // Обязательства — квартальные авансы УСН (если посчитаны поквартально), иначе годовой ориентир.
  type Ob = { period: string; sum: string }
  const adv = computed.calendar
    .filter((e) => e.kind === 'notification' && e.title.includes('аванс'))
    .map((e, i) => ({ period: ['34/01', '34/02', '34/03'][i] ?? '34', amount: e.amount }))
  // Уведомление формируется ТОЛЬКО по квартальным авансам. Годовой налог уведомлением не подаётся
  // (его заменяет декларация), поэтому при отсутствии поквартальных сумм обязательств нет —
  // не подставляем годовой налог под ошибочный код 34/03.
  const annualOnly = adv.length === 0 || adv.every((a) => a.amount == null)
  const obligations: Ob[] = annualOnly
    ? []
    : adv.map((a) => ({ period: a.period, sum: rub(a.amount) }))

  const oktmo = org.oktmo || '00000000'
  const obXml = obligations.length
    ? obligations
        .map(
          (o) =>
            `      <СведОбяз КБК="${kbk}" ОКТМО="${esc(oktmo)}" Период="${o.period}" ОтчетГод="${org.year}" Сумма="${o.sum}"/>`
        )
        .join('\n')
    : '      <!-- Поквартальных авансов нет: годовой налог подаётся декларацией, не уведомлением. -->'
  const annualNote = annualOnly
    ? '\n  <!-- Годовой режим: суммы авансов поквартально не разнесены. Годовой налог УСН подаётся декларацией, не уведомлением. -->'
    : ''

  let guid = 'DEMO0000-0000-0000-0000-000000000000'
  try {
    guid = crypto.randomUUID().toUpperCase()
  } catch {
    /* ignore */
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- ДЕМО-генерация формата ФНС. Перед отправкой сверить с XSD на format.nalog.ru. -->`,
    `<Файл ИдФайл="UT_UVNALOG_0000_0000_${esc(org.inn || '000000000000')}_${guid}" ВерсПрог="СвояКнига 1.0" ВерсФорм="5.01">`,
    `  <Документ КНД="1110355" ДатаДок="${esc(dateDoc)}" КодНО="0000">${annualNote}`,
    `    <СвНП>`,
    `      <НПФЛ ИННФЛ="${esc(org.inn || '')}">`,
    `        <ФИО Фамилия="${esc(fam)}" Имя="${esc(nam)}"${otch ? ` Отчество="${esc(otch)}"` : ''}/>`,
    `      </НПФЛ>`,
    `    </СвНП>`,
    `    <Уведомление>`,
    obXml,
    `    </Уведомление>`,
    `  </Документ>`,
    `</Файл>`,
  ].join('\n')
}

export function ensFileName(org: Org): string {
  const inn = org.inn || 'IP'
  return `Уведомление_ЕНС_${inn}_${org.year}.xml`
}

/** Одна строка обязательства уведомления (КНД 1110355): любой налог/взнос, не только УСН. */
export interface EnsObligation {
  kbk: string
  oktmo: string
  period: string
  year: number
  amount: number
  title?: string
}

/**
 * Мультистрочное уведомление КНД 1110355 из готовых обязательств — НДФЛ (по периодам),
 * страховые взносы и авансы УСН (раздел «Полезные документы»). В отличие от ensNotificationXml
 * (только УСН-авансы из календаря) принимает любые строки.
 */
export function notificationXml(org: Org, rows: EnsObligation[]): string {
  const dateDoc = new Date().toLocaleDateString('ru-RU')
  const { fam, nam, otch } = splitFio(org.fio || org.name || '')
  let guid = 'DEMO0000-0000-0000-0000-000000000000'
  try {
    guid = crypto.randomUUID().toUpperCase()
  } catch {
    /* ignore */
  }
  const obXml = rows
    .map(
      (o) =>
        `      <СведОбяз КБК="${esc(o.kbk)}" ОКТМО="${esc(o.oktmo)}" Период="${esc(o.period)}" ОтчетГод="${o.year}" Сумма="${rub(o.amount)}"/>`
    )
    .join('\n')
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- ДЕМО-генерация формата ФНС. Перед отправкой сверить с XSD на format.nalog.ru. -->`,
    `<Файл ИдФайл="UT_UVNALOG_0000_0000_${esc(org.inn || '000000000000')}_${guid}" ВерсПрог="СвояКнига 1.0" ВерсФорм="5.01">`,
    `  <Документ КНД="1110355" ДатаДок="${esc(dateDoc)}" КодНО="0000">`,
    `    <СвНП>`,
    `      <НПФЛ ИННФЛ="${esc(org.inn || '')}">`,
    `        <ФИО Фамилия="${esc(fam)}" Имя="${esc(nam)}"${otch ? ` Отчество="${esc(otch)}"` : ''}/>`,
    `      </НПФЛ>`,
    `    </СвНП>`,
    `    <Уведомление>`,
    obXml,
    `    </Уведомление>`,
    `  </Документ>`,
    `</Файл>`,
  ].join('\n')
}
