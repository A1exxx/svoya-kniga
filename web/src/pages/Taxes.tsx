import { compute } from '../lib/compute'
import { formatRub, formatDate } from '../lib/format'
import { useTaxInputs } from '../state/store'
import { getParams, type UsnObject } from '../lib/taxcore'
import { Card, Field, Note, Row, inputClass } from '../components/ui'
import { IconCheck, IconClock, IconSend } from '../components/icons'

const dec = (d: { toNumber: () => number } | null | undefined) =>
  formatRub(d == null ? null : d.toNumber())

const YEARS = [2024, 2025, 2026]

const kindIcon = {
  payment: IconClock,
  notification: IconSend,
  report: IconCheck,
} as const

export function Taxes() {
  const { inputs, setInputs } = useTaxInputs()

  let computed: ReturnType<typeof compute> | null = null
  let error: string | null = null
  try {
    computed = compute(inputs)
  } catch (e) {
    error = (e as Error).message
  }

  const params = (() => {
    try {
      return getParams(inputs.year)
    } catch {
      return null
    }
  })()

  const isIncome = inputs.usnObject === 'income'

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Налоги</h1>
        <p className="mt-1 text-sm text-muted">
          Расчёт УСН, страховых взносов ИП и сроков. Все суммы пересчитываются мгновенно.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* ---- Ввод данных ---- */}
        <div className="space-y-5">
          <Card title="Исходные данные">
            <div className="space-y-4">
              <Field label="Налоговый год">
                <select
                  className={inputClass}
                  value={inputs.year}
                  onChange={(e) => setInputs({ year: Number(e.target.value) })}
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Объект налогообложения">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['income', 'Доходы 6%'],
                      ['income_minus', 'Д − Р 15%'],
                    ] as [UsnObject, string][]
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setInputs({ usnObject: val })}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        inputs.usnObject === val
                          ? 'border-brand-500 bg-brand-50 text-brand-600'
                          : 'border-line text-muted hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Годовой доход" hint={formatRub(inputs.income)}>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={inputs.income}
                  onChange={(e) => setInputs({ income: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>

              {!isIncome && (
                <Field label="Годовые расходы" hint={formatRub(inputs.expenses)}>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={inputs.expenses}
                    onChange={(e) =>
                      setInputs({ expenses: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </Field>
              )}

              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-100"
                  checked={inputs.hasEmployees}
                  onChange={(e) => setInputs({ hasEmployees: e.target.checked })}
                />
                <span className="text-sm text-ink">Есть наёмные работники</span>
              </label>
            </div>
          </Card>

          {params && (
            <Note tone={params.verified ? 'info' : 'warn'}>
              Параметры {inputs.year} года: {params.note}
            </Note>
          )}
        </div>

        {/* ---- Результат ---- */}
        <div className="space-y-5">
          {error && <Note tone="warn">Ошибка расчёта: {error}</Note>}

          {computed && (
            <>
              {/* Итог по налогу */}
              <Card>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-sm text-muted">Налог УСН за год</div>
                    <div className="tnum mt-1 text-4xl font-semibold text-ink">
                      {dec(computed.usn.tax_year_final)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted">Страховые взносы ИП</div>
                    <div className="tnum mt-1 text-2xl font-semibold text-brand-600">
                      {dec(computed.contr.total)}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Прозрачная разбивка «как посчитано» */}
              <Card title="Как посчитан налог">
                {isIncome ? (
                  <>
                    <Row
                      label="Налог по ставке"
                      hint={`${computed.usn.rate.times(100).toNumber()}% от дохода`}
                      value={dec(computed.usn.periods[0].tax_before_deduction_cumulative)}
                    />
                    <Row
                      label="− Вычет страховых взносов"
                      hint={inputs.hasEmployees ? 'не более 50% налога' : 'до 100%'}
                      value={dec(computed.usn.periods[0].deduction_cumulative)}
                    />
                    <Row label="= Налог УСН к уплате" value={dec(computed.usn.tax_year_final)} strong />
                  </>
                ) : (
                  <>
                    <Row
                      label="Налог по ставке"
                      hint={`${computed.usn.rate.times(100).toNumber()}% от (доходы − расходы)`}
                      value={dec(computed.usn.tax_year_computed)}
                    />
                    <Row
                      label="Минимальный налог"
                      hint="1% от доходов"
                      value={dec(computed.usn.min_tax)}
                    />
                    <Row
                      label="= К уплате (больший из двух)"
                      value={dec(computed.usn.tax_year_final)}
                      strong
                    />
                  </>
                )}
                {computed.usn.notes.map((n, i) => (
                  <p key={i} className="mt-3 text-xs text-muted">
                    {n}
                  </p>
                ))}
              </Card>

              {/* Взносы */}
              <Card title="Страховые взносы «за себя»">
                <Row
                  label="Фиксированные"
                  hint={`до ${formatDate(computed.contr.fixed_due)}`}
                  value={dec(computed.contr.fixed)}
                />
                <Row
                  label="1% с дохода свыше 300 000 ₽"
                  hint={`до ${formatDate(computed.contr.one_percent_due)}`}
                  value={dec(computed.contr.one_percent)}
                />
                <Row label="Итого взносов" value={dec(computed.contr.total)} strong />
              </Card>

              {/* Налоговый календарь */}
              <Card title="Налоговый календарь">
                <div className="space-y-1">
                  {computed.calendar.map((e, i) => {
                    const Icon = kindIcon[e.kind]
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
                      >
                        <span className="tnum w-20 shrink-0 text-xs text-muted">
                          {formatDate(e.due)}
                        </span>
                        <Icon size={16} className="shrink-0 text-slate-400" />
                        <span className="flex-1 text-sm text-ink">{e.title}</span>
                        <span className="tnum whitespace-nowrap text-sm font-medium text-ink">
                          {dec(e.amount)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </Card>

              {/* Подписать/отправить — в разработке */}
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-ink">
                      Подписать КЭП и отправить в ФНС
                    </div>
                    <div className="text-xs text-muted">
                      Электронная подпись и сдача отчётности появятся позже.
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400"
                  >
                    <IconSend size={16} />
                    В разработке
                  </button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
