import { useState } from 'react'
import { useOrg } from '../state/orgStore'
import { useOps } from '../state/opsStore'
import { useDocs } from '../state/docsStore'
import { useEmployees } from '../state/employeesStore'
import { useArchive } from '../state/archiveStore'
import { isActiveInYear, employeeSalaryOptions } from '../lib/payrollSummary'
import {
  calcSalary,
  ndflPeriodEntries,
  periodCodeContributions,
  dueDateContributions,
  periodCodeUsnAdvance,
  dueDateUsnAdvance,
  ndflKbk,
  usnKbk,
  getKbk,
} from '../lib/taxcore'
import { compute } from '../lib/compute'
import { notificationXml, ensFileName } from '../lib/ensXml'
import { downloadText } from '../lib/download'
import { formatRub, formatDate } from '../lib/format'
import { Card, Note } from '../components/ui'
import { PrintModal } from '../components/PrintModal'
import { SendDemoModal } from '../components/SendDemoModal'
import { NotificationDoc, type NotificationRow } from '../components/NotificationDoc'

interface NItem {
  group: 'НДФЛ' | 'Взносы' | 'Аванс УСН'
  title: string
  period: string
  due: string
  kbk: string
  amount: number
}

export function UsefulDocs() {
  const { activeOrg } = useOrg()
  const { ops } = useOps()
  const { docs } = useDocs()
  const { employees } = useEmployees()
  const { addArchive } = useArchive()
  const [preview, setPreview] = useState<NItem | null>(null)
  const [send, setSend] = useState<string | null>(null)

  const year = activeOrg.year
  const oktmo = activeOrg.oktmo || '00000000'
  const staff = employees.filter((e) => isActiveInYear(e, year))

  let computed: ReturnType<typeof compute> | null = null
  try {
    computed = compute(activeOrg, ops)
  } catch {
    computed = null
  }

  const items: NItem[] = []

  // НДФЛ — дважды в месяц, агрегировано по штату и сгруппировано по (коду периода + ставке/КБК).
  // При прогрессии (доход через 2,4 млн) НДФЛ по разным ставкам идёт на разные КБК — отдельными строками.
  const ndflMap = new Map<string, { period: string; due: string; ratePct: number; amount: number }>()
  for (const e of staff) {
    try {
      const sal = calcSalary(year, e.salary, employeeSalaryOptions(e))
      for (const en of ndflPeriodEntries(sal)) {
        if (en.amount <= 0) continue
        const key = `${en.period}|${en.ratePct}`
        const cur = ndflMap.get(key) ?? { period: en.period, due: en.due, ratePct: en.ratePct, amount: 0 }
        cur.amount += en.amount
        ndflMap.set(key, cur)
      }
    } catch {
      /* пропускаем */
    }
  }
  for (const r of [...ndflMap.values()].sort((a, b) => a.due.localeCompare(b.due) || a.ratePct - b.ratePct)) {
    items.push({
      group: 'НДФЛ',
      title: `НДФЛ ${r.ratePct}% (период ${r.period})`,
      period: r.period,
      due: r.due,
      kbk: ndflKbk(r.ratePct, year),
      amount: r.amount,
    })
  }

  // Взносы за работников — ежемесячно, кроме 3-го месяца квартала.
  const vznosyByMonth = Array(13).fill(0) as number[]
  for (const e of staff) {
    try {
      const sal = calcSalary(year, e.salary, employeeSalaryOptions(e))
      for (const m of sal.months) vznosyByMonth[m.month] += m.vznosy.toNumber()
    } catch {
      /* пропускаем */
    }
  }
  for (let m = 1; m <= 12; m++) {
    const code = periodCodeContributions(m)
    if (!code || vznosyByMonth[m] <= 0) continue
    items.push({
      group: 'Взносы',
      title: `Страховые взносы за работников (период ${code})`,
      period: code,
      due: dueDateContributions(year, m),
      kbk: getKbk(year).vznosyEmployees,
      amount: vznosyByMonth[m],
    })
  }

  // Авансы УСН (поквартально).
  if (computed?.quarterly) {
    for (const q of [1, 2, 3] as const) {
      const adv = computed.usn.periods[q - 1]?.advance_due_this_period.toNumber() ?? 0
      if (adv <= 0) continue
      items.push({
        group: 'Аванс УСН',
        title: `Аванс по УСН (период ${periodCodeUsnAdvance(q)})`,
        period: periodCodeUsnAdvance(q),
        due: dueDateUsnAdvance(year, q),
        kbk: usnKbk(activeOrg.usnObject, year),
        amount: adv,
      })
    }
  }

  const previewRow: NotificationRow | null = preview
    ? { kbk: preview.kbk, oktmo, period: preview.period, year, amount: preview.amount, title: preview.title }
    : null

  const markDone = (it: NItem) =>
    addArchive({
      taskKey: `Уведомление ${it.title}|${it.due}`,
      kind: 'notification',
      docKind: null,
      title: `Уведомление: ${it.title}`,
      period: String(year),
      dueDate: it.due,
      submittedAt: new Date().toISOString().slice(0, 10),
      amount: Math.round(it.amount),
      // Строка уведомления — чтобы «Открыть» в Архиве перерисовало КНД 1110355, а не вело в тупик.
      notificationRow: { kbk: it.kbk, oktmo, period: it.period, year, amount: Math.round(it.amount), title: it.title },
      snapshot: { org: activeOrg, ops, docs, employees },
    })

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <div className="text-sm text-muted">{activeOrg.name}</div>
        <h1 className="text-2xl font-semibold text-ink">Полезные документы</h1>
        <p className="mt-1 text-sm text-muted">
          Уведомления об исчисленных суммах (КНД 1110355) и полезные бланки.
        </p>
      </header>

      <Card title="Уведомления об исчисленных суммах (КНД 1110355)">
        {items.length === 0 ? (
          <Note>
            Уведомления появятся, когда будут данные: добавьте сотрудников (НДФЛ дважды в месяц,
            взносы ежемесячно) или внесите операции в «Деньги» (авансы УСН поквартально).
          </Note>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Что</th>
                  <th className="py-2 pr-3 font-medium">Период</th>
                  <th className="py-2 pr-3 font-medium">Срок</th>
                  <th className="py-2 pr-3 text-right font-medium">Сумма</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-line/60">
                    <td className="py-2 pr-3 text-ink">{it.title}</td>
                    <td className="tnum py-2 pr-3 text-muted">{it.period}</td>
                    <td className="tnum py-2 pr-3 text-muted">{formatDate(it.due)}</td>
                    <td className="tnum py-2 pr-3 text-right font-medium">{formatRub(Math.round(it.amount))}</td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => setPreview(it)} className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-brand-300 hover:bg-brand-50">
                          Сформировать
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadText(
                              ensFileName(activeOrg),
                              notificationXml(activeOrg, [
                                { kbk: it.kbk, oktmo, period: it.period, year, amount: Math.round(it.amount), title: it.title },
                              ]),
                              'application/xml;charset=utf-8'
                            )
                          }
                          className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-brand-300 hover:bg-brand-50"
                        >
                          XML
                        </button>
                        <button type="button" onClick={() => setSend(`Уведомление: ${it.title}`)} className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-brand-300 hover:bg-brand-50">
                          Отправить
                        </button>
                        <button type="button" onClick={() => markDone(it)} className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-ok hover:text-ok">
                          Сдано
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          НДФЛ — дважды в месяц (1–22 → до 25; 23–конец → до 3 числа след.); взносы — ежемесячно,
          кроме 3-го месяца квартала (там РСВ); авансы УСН — до 25 апреля/июля/октября. КБК НДФЛ
          при прогрессии (доход свыше 2,4 млн) разбивается по ставкам на разные КБК отдельными строками.
        </p>
      </Card>

      <div className="mt-5">
        <Card title="Полезные бланки и памятки">
          <ul className="space-y-2 text-sm text-ink">
            <li>• Уведомление об исчисленных суммах — формируется выше из ваших данных.</li>
            <li>• Личная карточка, приказ о приёме, справка о доходах, заявление на вычет — в карточке сотрудника («Сотрудники»).</li>
            <li>• Декларация и книга продаж по НДС — в разделе «Документы» (при включённом НДС).</li>
            <li>• Сверка с налоговой, сальдо ЕНС, письма ФНС/СФР — в разделе «Налоговая».</li>
          </ul>
        </Card>
      </div>

      {preview && previewRow && (
        <PrintModal title={`Уведомление — ${preview.title}`} onClose={() => setPreview(null)}>
          <NotificationDoc org={activeOrg} rows={[previewRow]} />
        </PrintModal>
      )}
      {send && <SendDemoModal docTitle={send} onClose={() => setSend(null)} />}
    </div>
  )
}
