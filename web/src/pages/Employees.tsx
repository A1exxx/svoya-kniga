import { useState } from 'react'
import { useOrg, type Org } from '../state/orgStore'
import { useEmployees } from '../state/employeesStore'
import { calcAlimony, calcSalary, calcSickLeave, calcVacation } from '../lib/taxcore'
import { formatRub } from '../lib/format'
import { Card, Field, Note, Row, inputClass } from '../components/ui'
import { IconPlus } from '../components/icons'
import { PrintModal } from '../components/PrintModal'
import { SendDemoModal } from '../components/SendDemoModal'
import { PayrollReportDoc, REPORT_TITLE, type ReportType } from '../components/PayrollReportDoc'

const dec = (d: { toNumber: () => number } | null | undefined) =>
  formatRub(d == null ? null : d.toNumber())

const pct = (d: { toNumber: () => number }) => `${Math.round(d.toNumber() * 100)}%`

const TABS = [
  { key: 'staff', label: 'Штат' },
  { key: 'salary', label: 'Зарплата' },
  { key: 'vacation', label: 'Отпускные' },
  { key: 'sick', label: 'Больничные' },
  { key: 'alimony', label: 'Алименты' },
  { key: 'reports', label: 'Отчёты' },
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

// ---- Штат (список сотрудников с сохранением) ----
function StaffRoster({ year }: { year: number }) {
  const { employees, addEmployee, updateEmployee, removeEmployee } = useEmployees()
  const [selectedId, setSelectedId] = useState<string | null>(employees[0]?.id ?? null)
  const selected = employees.find((e) => e.id === selectedId) ?? null
  const create = () => setSelectedId(addEmployee())

  let calc: ReturnType<typeof calcSalary> | null = null
  if (selected) {
    try {
      calc = calcSalary(year, selected.salary, { children: selected.children, msp: selected.msp })
    } catch {
      calc = null
    }
  }
  const m = calc?.months[0]

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <Card
        title="Сотрудники"
        right={
          <button
            type="button"
            onClick={create}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <IconPlus size={14} /> Добавить
          </button>
        }
      >
        {employees.length === 0 ? (
          <p className="text-sm text-muted">Штат пуст. Добавьте сотрудника — он попадёт в отчёты.</p>
        ) : (
          <div className="space-y-1">
            {employees.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelectedId(e.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  e.id === selectedId ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-slate-50'
                }`}
              >
                <div className="font-medium text-ink">{e.fio || 'Без имени'}</div>
                <div className="text-xs text-muted">
                  {e.position || 'должность не указана'} · {formatRub(e.salary)}/мес
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selected ? (
        <div className="space-y-5">
          <Card
            title={selected.fio || 'Новый сотрудник'}
            right={
              <button
                type="button"
                onClick={() => {
                  removeEmployee(selected.id)
                  setSelectedId(null)
                }}
                className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-danger"
              >
                Удалить
              </button>
            }
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ФИО">
                  <input
                    className={inputClass}
                    placeholder="Иванов Иван Иванович"
                    value={selected.fio}
                    onChange={(e) => updateEmployee(selected.id, { fio: e.target.value })}
                  />
                </Field>
                <Field label="Должность">
                  <input
                    className={inputClass}
                    placeholder="Менеджер"
                    value={selected.position}
                    onChange={(e) => updateEmployee(selected.id, { position: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Оклад в месяц, ₽">
                  {numInput(selected.salary, (n) => updateEmployee(selected.id, { salary: n }))}
                </Field>
                <Field label="Детей (вычет)">
                  {numInput(selected.children, (n) => updateEmployee(selected.id, { children: n }), { max: 10 })}
                </Field>
                <Field label="Стаж, лет">
                  {numInput(selected.stazhYears, (n) => updateEmployee(selected.id, { stazhYears: n }), { max: 60 })}
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Дата приёма">
                  <input
                    type="date"
                    className={inputClass}
                    value={selected.hireDate}
                    onChange={(e) => updateEmployee(selected.id, { hireDate: e.target.value })}
                  />
                </Field>
                <label className="flex cursor-pointer items-center gap-2.5 self-end pb-2.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line text-brand-600"
                    checked={selected.msp}
                    onChange={(e) => updateEmployee(selected.id, { msp: e.target.checked })}
                  />
                  <span className="text-sm text-ink">ИП в реестре МСП (льгота по взносам)</span>
                </label>
              </div>
            </div>
          </Card>

          {m && calc && (
            <Card title="Расчёт по сотруднику (в месяц)">
              <Row label="Оклад (гросс)" value={dec(m.gross)} />
              <Row label="− НДФЛ" hint="прогрессия, нарастающим за год" value={dec(m.ndfl)} />
              <Row label="= На руки" value={dec(m.net)} strong />
              <div className="mt-3 border-t border-line pt-2">
                <Row label="Взносы с ФОТ" hint={selected.msp ? 'льгота МСП' : 'единый тариф'} value={dec(m.vznosy)} />
                <Row label="Травматизм" hint="0,2%" value={dec(m.travmatizm)} />
                <Row label="Стоимость для работодателя за год" value={dec(calc.employer_cost_year)} strong />
              </div>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-muted">Выберите сотрудника слева или добавьте нового.</p>
        </Card>
      )}
    </div>
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

// ---- Отчёты за сотрудников ----
const REPORTS: { type: ReportType; hint: string }[] = [
  { type: '6ndfl', hint: 'Ежеквартально и за год, в ФНС' },
  { type: 'rsv', hint: 'Ежеквартально, в ФНС' },
  { type: 'efs1', hint: 'При приёме/увольнении и ежегодно, в СФР' },
  { type: 'perssved', hint: 'Ежемесячно, в ФНС' },
]

function ReportsTab({ org }: { org: Org }) {
  const { employees } = useEmployees()
  const [report, setReport] = useState<ReportType | null>(null)
  const [send, setSend] = useState<string | null>(null)

  if (employees.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          Добавьте сотрудников во вкладке «Штат» — отчёты (6-НДФЛ, РСВ, ЕФС-1, персонифицированные
          сведения) заполнятся автоматически.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card title="Отчётность за сотрудников">
        <p className="mb-3 text-sm text-muted">
          Заполняется автоматически из штата ({employees.length} чел.) по выверенным параметрам {org.year} года.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {REPORTS.map((rep) => (
            <div key={rep.type} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{REPORT_TITLE[rep.type]}</div>
                <div className="truncate text-xs text-muted">{rep.hint}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => setReport(rep.type)}
                  className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  Печать
                </button>
                <button
                  type="button"
                  onClick={() => setSend(REPORT_TITLE[rep.type])}
                  className="cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700"
                >
                  Отправить
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Подписание КЭП и отправка в ФНС/СФР — пока имитация. Формы демонстрационные: перед сдачей
          сверьте с официальными.
        </p>
      </Card>

      {report && (
        <PrintModal title={`${REPORT_TITLE[report]} — предпросмотр`} onClose={() => setReport(null)}>
          <PayrollReportDoc org={org} employees={employees} type={report} />
        </PrintModal>
      )}
      {send && <SendDemoModal docTitle={send} onClose={() => setSend(null)} />}
    </div>
  )
}

export function Employees() {
  const { activeOrg } = useOrg()
  const [tab, setTab] = useState<TabKey>('staff')

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <div className="text-sm text-muted">{activeOrg.name}</div>
        <h1 className="text-2xl font-semibold text-ink">Сотрудники и зарплата</h1>
        <p className="mt-1 text-sm text-muted">
          Штат, расчёты зарплаты/отпускных/больничных/алиментов и отчётность за сотрудников на
          выверенных данных {activeOrg.year} года.
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

      {tab === 'staff' && <StaffRoster year={activeOrg.year} />}
      {tab === 'salary' && <SalaryCalc year={activeOrg.year} />}
      {tab === 'vacation' && <VacationCalc year={activeOrg.year} />}
      {tab === 'sick' && <SickCalc year={activeOrg.year} />}
      {tab === 'alimony' && <AlimonyCalc />}
      {tab === 'reports' && <ReportsTab org={activeOrg} />}
    </div>
  )
}
