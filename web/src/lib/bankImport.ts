/**
 * Парсер банковской выписки в формате 1CClientBankExchange — открытый текстовый
 * стандарт обмена «банк ↔ 1С», который умеют выгружать практически все банки
 * (Т-Банк, Точка, Альфа, Сбер, Модульбанк и др.). Банко-агностичный вход.
 *
 * Файл по умолчанию в кодировке Windows-1251 — читать через
 * TextDecoder('windows-1251'); см. readBankStatement ниже.
 */
import type { Operation } from '../state/opsStore'

export type OpDraft = Omit<Operation, 'id'>

export interface BankImportResult {
  ops: OpDraft[]
  account: string
  errors: string[]
}

/** dd.mm.yyyy → yyyy-mm-dd. */
function parseDate(d: string): string {
  const m = d.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return ''
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** Определить ставку НДС из назначения платежа: «в т.ч. НДС 20%», «включая НДС 5 %» и т.п. */
function detectVat(note: string): string | undefined {
  const s = (note || '').toLowerCase()
  if (/без\s+ндс|ндс\s+не\s+облага/.test(s)) return undefined
  const m = s.match(/ндс[\s:]*?(\d{1,2})\s*%/)
  if (m) {
    const r = m[1]
    if (['5', '7', '10', '20', '22'].includes(r)) return r
  }
  return undefined
}

function toOp(d: Record<string, string>, ourAccount: string): OpDraft {
  const payerAcc = (d['ПлательщикСчет'] || '').trim()
  const payeeAcc = (d['ПолучательСчет'] || '').trim()

  // Доход — если деньги пришли на наш счёт; расход — если ушли с нашего.
  let kind: 'income' | 'expense'
  if (ourAccount && payeeAcc === ourAccount) kind = 'income'
  else if (ourAccount && payerAcc === ourAccount) kind = 'expense'
  else kind = payeeAcc && !payerAcc ? 'income' : 'expense' // запасной вариант

  const counterparty = (kind === 'income' ? d['Плательщик'] : d['Получатель']) || ''
  const amount = Number((d['Сумма'] || '0').replace(/\s/g, '').replace(',', '.')) || 0
  const note = (d['НазначениеПлатежа'] || '').trim()

  return {
    date: parseDate(d['Дата'] || ''),
    kind,
    amount,
    counterparty: counterparty.trim(),
    doc: d['Номер'] ? `ПП № ${d['Номер'].trim()}` : '',
    note,
    taxable: true,
    vat: detectVat(note),
  }
}

/**
 * Разобрать текст выписки 1CClientBankExchange.
 * @param ourAccountHint - наш расчётный счёт из реквизитов (для классификации доход/расход).
 */
export function parse1CClientBankExchange(text: string, ourAccountHint = ''): BankImportResult {
  const lines = text.split(/\r?\n/)
  const errors: string[] = []

  if (!lines.some((l) => l.trim().startsWith('1CClientBankExchange'))) {
    errors.push('Файл не похож на выписку 1CClientBankExchange.')
  }

  // Наш счёт: из реквизитов, иначе из заголовка РасчСчет=.
  let headerAccount = ''
  for (const ln of lines) {
    const m = ln.match(/^\s*РасчСчет=(.*)$/)
    if (m) {
      headerAccount = m[1].trim()
      break
    }
  }
  const ourAccount = (ourAccountHint || headerAccount).trim()

  const ops: OpDraft[] = []
  let cur: Record<string, string> | null = null
  for (const raw of lines) {
    const ln = raw.trim()
    if (ln.startsWith('СекцияДокумент')) {
      cur = {}
      continue
    }
    if (ln.startsWith('КонецДокумента')) {
      if (cur) ops.push(toOp(cur, ourAccount))
      cur = null
      continue
    }
    if (cur) {
      const eq = ln.indexOf('=')
      if (eq > 0) cur[ln.slice(0, eq).trim()] = ln.slice(eq + 1)
    }
  }

  if (ops.length === 0 && errors.length === 0) {
    errors.push('В файле не найдено ни одного платёжного документа.')
  }
  return { ops, account: ourAccount, errors }
}

/** Прочитать файл выписки с учётом кодировки Windows-1251 (формат 1С). */
export async function readBankStatement(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  try {
    return new TextDecoder('windows-1251').decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}
