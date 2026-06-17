import { useState } from 'react'
import { useOrg } from '../state/orgStore'
import { calcPatent } from '../lib/taxcore'
import { formatRub } from '../lib/format'
import { Card, Field, Note, Row, inputClass } from '../components/ui'

const dec = (d: { toNumber: () => number } | null | undefined) =>
  formatRub(d == null ? null : d.toNumber())

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function Patent() {
  const { activeOrg } = useOrg()
  const [pvgd, setPvgd] = useState(1_200_000)
  const [months, setMonths] = useState(12)
  const [deduct, setDeduct] = useState(0)
  const [hasEmp, setHasEmp] = useState(activeOrg.hasEmployees)

  let r: ReturnType<typeof calcPatent> | null = null
  try {
    r = calcPatent(activeOrg.year, pvgd, months, {
      contributionsToDeduct: deduct,
      hasEmployees: hasEmp,
    })
  } catch {
    r = null
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <div className="text-sm text-muted">{activeOrg.name}</div>
        <h1 className="text-2xl font-semibold text-ink">Патент (ПСН)</h1>
        <p className="mt-1 text-sm text-muted">
          Стоимость патента = потенциальный доход × 6% × срок, минус страховые взносы. ПВГД берётся
          из регионального закона или заявления на патент.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card title="Параметры">
          <div className="space-y-4">
            <Field label="Потенциальный доход (ПВГД), ₽/год" hint={formatRub(pvgd)}>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={pvgd}
                onChange={(e) => setPvgd(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            <Field label="Срок патента, месяцев">
              <select
                className={inputClass}
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Взносы к вычету, ₽" hint={formatRub(deduct)}>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={deduct}
                onChange={(e) => setDeduct(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-brand-600"
                checked={hasEmp}
                onChange={(e) => setHasEmp(e.target.checked)}
              />
              <span className="text-sm text-ink">Есть работники (вычет ≤ 50%)</span>
            </label>
          </div>
        </Card>

        {r && (
          <div className="space-y-5">
            <Card>
              <div className="text-sm text-muted">Стоимость патента к уплате</div>
              <div className="tnum mt-1 text-4xl font-semibold text-ink">{dec(r.cost)}</div>
            </Card>

            <Card title="Как посчитано">
              <Row label="Налоговая база за срок" hint={`ПВГД × ${months}/12`} value={dec(r.base)} />
              <Row label="Стоимость по ставке 6%" value={dec(r.cost_before_deduction)} />
              <Row
                label="− Вычет страховых взносов"
                hint={hasEmp ? 'не более 50%' : 'до 100%'}
                value={dec(r.deduction)}
              />
              <Row label="= К уплате" value={dec(r.cost)} strong />
            </Card>

            <Card title="График оплаты">
              {r.schedule.map((s, i) => (
                <Row key={i} label={s.label} value={dec(s.amount)} />
              ))}
            </Card>

            {r.notes.map((n, i) => (
              <Note key={i}>{n}</Note>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5">
        <Note tone="warn">
          ПВГД и применимость патента зависят от региона и вида деятельности — проверьте в
          региональном законе или официальном калькуляторе ФНС patent.nalog.ru.
        </Note>
      </div>
    </div>
  )
}
