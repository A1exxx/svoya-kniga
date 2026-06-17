/**
 * H2 — инсайты по накопленным данным: дубли, расходы без первички, дебиторка, падение
 * выручки, прогноз дохода. Чистая функция (для тестов принимает `today`). Ничего не меняет —
 * только показывает бухгалтеру, на что обратить внимание.
 */
import type { Operation } from '../../state/opsStore'
import { docTotals, type Doc } from '../../state/docsStore'
import type { Org } from '../../state/orgStore'
import { formatRub } from '../format'

export interface Insight {
  id: string
  level: 'warn' | 'info'
  title: string
  detail: string
}

const norm = (s: string) =>
  (s || '').toLowerCase().replace(/["'«».,]/g, '').replace(/\s+/g, ' ').trim()

export function computeInsights(
  ops: Operation[],
  docs: Doc[],
  org: Org,
  today: Date = new Date()
): Insight[] {
  const out: Insight[] = []
  const year = org.year
  const yops = ops.filter((o) => o.date.startsWith(String(year)))

  // 1. Возможные дубли (дата + сумма + контрагент + тип).
  const seen = new Map<string, number>()
  for (const o of yops) {
    const k = `${o.date}|${o.amount}|${norm(o.counterparty)}|${o.kind}`
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  const dups = [...seen.values()].filter((c) => c > 1).length
  if (dups > 0) {
    out.push({
      id: 'dups',
      level: 'warn',
      title: `Возможные дубли операций: ${dups}`,
      detail: 'Есть операции с одинаковыми датой, суммой, контрагентом и типом — проверьте, не задвоены ли.',
    })
  }

  // 2. Расходы «в налоге» без номера документа (риск для УСН «доходы−расходы»).
  if (org.usnObject === 'income_minus') {
    const noDoc = yops.filter((o) => o.kind === 'expense' && o.taxable && !o.doc.trim())
    if (noDoc.length) {
      const sum = noDoc.reduce((s, o) => s + o.amount, 0)
      out.push({
        id: 'nodoc',
        level: 'warn',
        title: `Расходы без № документа: ${noDoc.length}`,
        detail: `На сумму ${formatRub(sum)}. Без первички такой расход налоговая может не принять — добавьте номер документа.`,
      })
    }
  }

  // 3. Дебиторка — неоплаченные исходящие счета.
  const debt = docs.filter(
    (d) => d.direction === 'outgoing' && d.type === 'invoice' && d.paymentStatus !== 'paid'
  )
  if (debt.length) {
    const sum = debt.reduce((s, d) => s + docTotals(d).subtotal, 0)
    out.push({
      id: 'debt',
      level: 'info',
      title: `Неоплаченные счета: ${debt.length}`,
      detail: `Дебиторка на ${formatRub(sum)}. Возможно, стоит напомнить покупателям об оплате.`,
    })
  }

  // 4. Падение выручки между кварталами (>40%).
  const q = [0, 0, 0, 0]
  for (const o of yops) {
    if (o.kind !== 'income' || !o.taxable) continue
    const m = Number(o.date.slice(5, 7))
    const qi = Math.floor((m - 1) / 3)
    if (qi >= 0 && qi < 4) q[qi] += o.amount
  }
  // Сравниваем только до ПОСЛЕДНЕГО квартала с данными — иначе ещё ненаступивший квартал (=0)
  // ложно считался бы «обвалом». Зато падение до нуля в середине года теперь ловится.
  let lastData = -1
  for (let i = 0; i < 4; i++) if (q[i] > 0) lastData = i
  for (let i = 1; i <= lastData; i++) {
    if (q[i - 1] > 0 && q[i] < q[i - 1] * 0.6) {
      out.push({
        id: `drop-q${i + 1}`,
        level: 'info',
        title: `Выручка ${i + 1}-го квартала ниже предыдущего`,
        detail: `${formatRub(q[i])} против ${formatRub(q[i - 1])} — падение более 40%. Проверьте, всё ли учтено.`,
      })
    }
  }

  // 5. Прогноз дохода за год (оценка при текущем темпе). Только за текущий год и при наличии данных.
  const income = q[0] + q[1] + q[2] + q[3]
  const isCurrentYear = today.getFullYear() === year
  const monthsElapsed = isCurrentYear ? today.getMonth() + 1 : 12
  if (income > 0 && isCurrentYear && monthsElapsed >= 2 && monthsElapsed < 12) {
    const projected = Math.round((income / monthsElapsed) * 12)
    out.push({
      id: 'forecast',
      level: 'info',
      title: `Прогноз дохода за год: ~${formatRub(projected)}`,
      detail: `Оценка при текущем темпе (${formatRub(income)} за ${monthsElapsed} мес.). Пригодится, чтобы заранее отложить на налог. Точную сумму считают «Налоги».`,
    })
  }

  return out
}
