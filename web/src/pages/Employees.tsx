import { useState } from 'react'
import { useOrg } from '../state/orgStore'
import { calcAlimony, calcSalary, calcSickLeave, calcVacation } from '../lib/taxcore'
import { formatRub } from '../lib/format'
import { Card, Field, Note, Row, inputClass } from '../components/ui'

const dec = (d: { toNumber: () => number } | null | undefined) =>
  formatRub(d == null ? null : d.toNumber())

const pct = (d: { toNumber: () => number }) => `${Math.round(d.toNumber() * 100)}%`

const TABS = [
  { key: 'salary', label: 'Зарплата' },
  { key: 'vacation', label: 'Отпускные' },
  { key: 'sick', label: 'Больничные' },
  { key: 'alimony', label: 'Алименты' },
] as const
type TabKey = (typeof TABS)[number]['key']

function numInput(value: number, onChange: (n: number) => void, props: Record<string, unknown> = {}) {
  return (
    <input
      type="number"
      min={0}
      className={inputClass}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      {...props}
    />
  )
}

// ---- Зарплата ----
function SalaryCalc({ year }: { year: number }) {
  const [gross, setGross] = useState(80_000)
  const [children, setChildren] = useState(0)
  const [msp, setMsp] = useState(true)

  let r: ReturnType<typeof calcSalary> | null = null
  try {
    r = calcSalary(year, gross, { children, msp })
  } catch {
    r = null
  }
  const m = r?.months[0]

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <Card title="Параметры">
        <div className="space-y-4">
          <Field label="Оклад в месяц (гросс)" hint={formatRub(gross)}>
            {numInput(gross, setGross)}
          </Field>
          <Field label="Детей (для вычета)">{numInput(children, setChildren, { max: 10 })}</Field>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line text-brand-600"
              checked={msp}
              onChange={(e) => setMsp(e.target.checked)}
            />
            <span className="text-sm text-ink">ИП в реестре МСП (льгота по взносам)</span>
          </label>
          {r && r.child_deduction_monthly.toNumber() > 0 && (
            <p className="text-xs text-muted">Вычет на детей: {dec(r.child_deduction_monthly)}/мес</p>
          )}
        </div>
      </Card>

      {m && r && (
        <div className="space-y-5">
          <Card>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted">На руки / мес</div>
                <div className="tnum mt-1 text-2xl font-semibold text-ink">{dec(m.net)}</div>
              </div>
              <div>
                <div className="text-sm text-muted">НДФЛ / мес</div>
                <div className="tnum mt-1 text-2xl font-semibold text-ink">{dec(m.ndfl)}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Взносы / мес</div>
                <div className="tnum mt-1 text-2xl font-semibold text-brand-600">
                  {dec(m.vznosy.plus(m.travmatizm))}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Как посчитано (в месяц)">
            <Row label="Оклад (гросс)" value={dec(m.gross)} />
            <Row label="− НДФЛ" hint="13% (прогрессия нарастающим за год)" value={dec(m.ndfl)} />
            <Row label="= На руки" value={dec(m.net)} strong />
            <div className="mt-3 border-t border-line pt-2">
              <Row label="Страховые взносы (с ФОТ)" hint={msp ? 'льгота МСП' : 'единый тариф'} value={dec(m.vznosy)} />
              <Row label="Взносы на травматизм" hint="0,2%" value={dec(m.travmatizm)} />
              <Row label="Стоимость для работодателя" value={dec(m.gross.plus(m.vznosy).plus(m.travmatizm))} strong />
            </div>
          </Card>

          <Card title="За год (при том же окладе)">
            <Row label="Доход (гросс)" value={dec(r.gross_year)} />
            <Row label="НДФЛ за год" value={dec(r.ndfl_year)} />
            <Row label="На руки за год" value={dec(r.net_year)} />
            <Row label="Взносы за год" value={dec(r.vznosy_year.plus(r.travmatizm_year))} />
            <Row label="Стоимость для работодателя за год" value={dec(r.employer_cost_year)} strong />
          </Card>
          <Note>НДФЛ считается нарастающим итогом; при годовом доходе свыше 2,4 млн ₽ ставка растёт (15% и выше).</Note>
        </div>
      )}
    </div>
  )
}

// ---- Отпускные ----
function VacationCalc({ year }: { year: number }) {
  const [base, setBase] = useState(960_000)
  const [days, setDays] = useState(28)
  let r: ReturnType<typeof calcVacation> | null = null
  try {
    r = calcVacation(year, base, days)
  } catch {
    r = null
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <Card title="Параметры">
        <div className="space-y-4">
          <Field label="Заработок за 12 месяцев" hint={formatRub(base)}>{numInput(base, setBase)}</Field>
          <Field label="Дней отпуска">{numInput(days, setDays, { max: 60 })}</Field>
        </div>
      </Card>
      {r && (
        <div className="space-y-5">
          <Card>
            <div className="text-sm text-muted">Отпускные на руки</div>
            <div className="tnum mt-1 text-3xl font-semibold text-ink">{dec(r.net)}</div>
          </Card>
          <Card title="Как посчитано">
            <Row label="Среднедневной заработок" hint="база ÷ 12 ÷ 29,3" value={dec(r.avg_daily)} />
            <Row label={`Отпускные (× ${days} дн.)`} value={dec(r.gross)} strong />
            <Row label="− НДФЛ" hint="13%" value={dec(r.ndfl)} />
            <Row label="= На руки" value={dec(r.net)} strong />
          </Card>
          {r.notes.map((n, i) => (
            <Note key={i}>{n}</Note>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Больничные ----
function SickCalc({ year }: { year: number }) {
  const [e1, setE1] = useState(800_000)
  const [e2, setE2] = useState(750_000)
  const [stazh, setStazh] = useState(7)
  const [days, setDays] = useState(7)
  let r: ReturnType<typeof calcSickLeave> | null = null
  try {
    r = calcSickLeave(year, e1, e2, stazh, days)
  } catch {
    r = null
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <Card title="Параметры">
        <div className="space-y-4">
          <Field label={`Заработок за ${year - 1} год`} hint={formatRub(e1)}>{numInput(e1, setE1)}</Field>
          <Field label={`Заработок за ${year - 2} год`} hint={formatRub(e2)}>{numInput(e2, setE2)}</Field>
          <Field label="Стаж, лет">{numInput(stazh, setStazh, { max: 60 })}</Field>
          <Field label="Дней болезни">{numInput(days, setDays, { max: 365 })}</Field>
        </div>
      </Card>
      {r && (
        <div className="space-y-5">
          <Card>
            <div className="text-sm text-muted">Пособие на руки</div>
            <div className="tnum mt-1 text-3xl font-semibold text-ink">{dec(r.net)}</div>
          </Card>
          <Card title="Как посчитано">
            <Row label="Среднедневной (факт)" hint="заработок 2 лет ÷ 730" value={dec(r.avg_daily_fact)} />
            <Row label="Ограничения" hint={`мин ${dec(r.min_daily)} · макс ${dec(r.max_daily)}`} value={dec(r.avg_daily_used)} />
            <Row label="Коэффициент стажа" value={pct(r.stazh_coeff)} />
            <Row label="Пособие в день" value={dec(r.daily_benefit)} />
            <Row label={`Итого (× ${days} дн.)`} value={dec(r.total)} strong />
            <div className="mt-3 border-t border-line pt-2">
              <Row label="За счёт работодателя" hint="первые дни" value={dec(r.employer_part)} />
              <Row label="За счёт СФР" value={dec(r.sfr_part)} />
              <Row label="− НДФЛ" hint="13%" value={dec(r.ndfl)} />
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ---- Алименты ----
function AlimonyCalc() {
  const [gross, setGross] = useState(80_000)
  const [children, setChildren] = useState(1)
  const ndfl = Math.round(gross * 0.13)
  let r: ReturnType<typeof calcAlimony> | null = null
  try {
    r = calcAlimony(gross, ndfl, children)
  } catch {
    r = null
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <Card title="Параметры">
        <div className="space-y-4">
          <Field label="Доход в месяц (гросс)" hint={formatRub(gross)}>{numInput(gross, setGross)}</Field>
          <Field label="Детей на алименты">{numInput(children, setChildren, { max: 3 })}</Field>
          <p className="text-xs text-muted">НДФЛ учтён упрощённо 13% = {formatRub(ndfl)}</p>
        </div>
      </Card>
      {r && (
        <div className="space-y-5">
          <Card>
            <div className="text-sm text-muted">Алименты в месяц</div>
            <div className="tnum mt-1 text-3xl font-semibold text-ink">{dec(r.alimony)}</div>
          </Card>
          <Card title="Как посчитано">
            <Row label="Доход после НДФЛ" hint="база удержания" value={dec(r.base_after_ndfl)} />
            <Row label="Доля" hint="ст. 81 СК РФ" value={r.share_label} />
            <Row label="Алименты" value={dec(r.alimony)} strong />
          </Card>
          {r.notes.map((n, i) => (
            <Note key={i} tone="warn">{n}</Note>
          ))}
          <Note>Максимум удержания на детей — 70% от дохода после НДФЛ (ст. 99 ФЗ № 229-ФЗ).</Note>
        </div>
      )}
    </div>
  )
}

export function Employees() {
  const { activeOrg } = useOrg()
  const [tab, setTab] = useState<TabKey>('salary')

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <div className="text-sm text-muted">{activeOrg.name}</div>
        <h1 className="text-2xl font-semibold text-ink">Сотрудники и зарплата</h1>
        <p className="mt-1 text-sm text-muted">
          Калькуляторы зарплаты, отпускных, больничных и алиментов на выверенных данных {activeOrg.year} года.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-brand-500 bg-brand-50 text-brand-600'
                : 'border-line text-muted hover:border-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'salary' && <SalaryCalc year={activeOrg.year} />}
      {tab === 'vacation' && <VacationCalc year={activeOrg.year} />}
      {tab === 'sick' && <SickCalc year={activeOrg.year} />}
      {tab === 'alimony' && <AlimonyCalc />}
    </div>
  )
}
