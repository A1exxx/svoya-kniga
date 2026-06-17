import { useEffect, useState } from 'react'
import { useOrg, type Org } from '../state/orgStore'
import { useEmployees, type Employee } from '../state/employeesStore'
import { calcAlimony, calcSalary, calcSickLeave, calcVacation } from '../lib/taxcore'
import { formatRub } from '../lib/format'
import { computeStazh, formatStazh, stazhYearsFromHire } from '../lib/stazh'
import { sickBases, vacationBase12m } from '../lib/earnings'
import { payrollSummary, employeeSalaryOptions } from '../lib/payrollSummary'
import { validateSnils } from '../lib/validation'
import { Card, Field, Note, Row, inputClass } from '../components/ui'
import { IconPlus } from '../components/icons'
import { PrintModal } from '../components/PrintModal'
import { SendDemoModal } from '../components/SendDemoModal'
import { PayrollReportDoc, REPORT_TITLE, type ReportType } from '../components/PayrollReportDoc'
import { PayrollStatementDoc } from '../components/PayrollStatementDoc'
import { EmployeeDoc, EMPLOYEE_DOC_TITLE, type EmployeeDocType } from '../components/employee/EmployeeDocs'

const dec = (d: { toNumber: () => number } | null | undefined) =>
  formatRub(d == null ? null : d.toNumber())

const pct = (d: { toNumber: () => number }) => `${Math.round(d.toNumber() * 100)}%`

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const daysInMonth = (year: number, month1: number) => new Date(year, month1, 0).getDate()

/** Эффективный страховой стаж: авто из даты приёма, иначе ручное значение. */
function effectiveStazhYears(e: Employee): number {
  if (e.stazhMode === 'manual') return e.stazhYears
  const auto = stazhYearsFromHire(e.hireDate, undefined, e.stazhPriorMonths)
  return auto ?? e.stazhYears
}

const TABS = [
  { key: 'staff', label: 'Штат' },
  { key: 'salary', label: 'Зарплата' },
  { key: 'vacation', label: 'Отпускные' },
  { key: 'sick', label: 'Больничные' },
  { key: 'alimony', label: 'Алименты' },
  { key: 'summary', label: 'Сводка по штату' },
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

/** Выбор сотрудника для калькулятора — при выборе поля префиллятся его данными. */
function EmployeePicker({
  employees,
  value,
  onPick,
}: {
  employees: Employee[]
  value: string
  onPick: (e: Employee | null) => void
}) {
  if (employees.length === 0) {
    return <Note>Добавьте сотрудников во вкладке «Штат», чтобы выбирать их здесь.</Note>
  }
  return (
    <Field label="Сотрудник" hint="выберите — поля заполнятся по нему; можно поправить вручную">
      <select
        className={inputClass}
        value={value}
        onChange={(ev) => onPick(employees.find((e) => e.id === ev.target.value) ?? null)}
      >
        <option value="">— ввести вручную —</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.fio || 'Без имени'}
            {e.dismissalDate ? ' (уволен)' : ''}
          </option>
        ))}
      </select>
    </Field>
  )
}

// ---- Штат (карточка сотрудника = единый источник) ----
function StaffRoster({ year }: { year: number }) {
  const { activeOrg } = useOrg()
  const { employees, addEmployee, updateEmployee, removeEmployee } = useEmployees()
  const [selectedId, setSelectedId] = useState<string | null>(employees[0]?.id ?? null)
  const [docType, setDocType] = useState<EmployeeDocType | null>(null)
  // При переключении ИП сбрасываем выбор на первого сотрудника нового штата.
  useEffect(() => {
    setSelectedId(employees[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg.id])
  const selected = employees.find((e) => e.id === selectedId) ?? null
  const create = () => setSelectedId(addEmployee())
  const up = (patch: Partial<Employee>) => selected && updateEmployee(selected.id, patch)

  let calc: ReturnType<typeof calcSalary> | null = null
  if (selected) {
    try {
      calc = calcSalary(year, selected.salary, employeeSalaryOptions(selected))
    } catch {
      calc = null
    }
  }
  const m = calc?.months[0]
  const hasAdvance = !!selected && (selected.advancePercent ?? 0) > 0

  const earningsYears: number[] = []
  if (selected) {
    const startY = selected.hireDate ? Number(selected.hireDate.slice(0, 4)) : year - 4
    for (let y = Math.min(startY, year); y <= year; y++) earningsYears.push(y)
  }

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
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-ink">{e.fio || 'Без имени'}</span>
                  {e.dismissalDate && (
                    <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">уволен</span>
                  )}
                </div>
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
                    onChange={(e) => up({ fio: e.target.value })}
                  />
                </Field>
                <Field label="Должность">
                  <input
                    className={inputClass}
                    placeholder="Менеджер"
                    value={selected.position}
                    onChange={(e) => up({ position: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Оклад в месяц, ₽">
                  {numInput(selected.salary, (n) => up({ salary: n }))}
                </Field>
                <Field label="Детей (вычет)">
                  {numInput(selected.children, (n) => up({ children: n }), { max: 10 })}
                </Field>
                <label
                  className="flex cursor-pointer items-center gap-2.5 self-end pb-2.5"
                  title="Пониженный тариф 15% на выплаты сверх 1,5 МРОТ. С 2026 (ФЗ № 425-ФЗ) — только для субъектов МСП с основным ОКВЭД из перечня приоритетных отраслей; проверьте применимость."
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line text-brand-600"
                    checked={selected.msp}
                    onChange={(e) => up({ msp: e.target.checked })}
                  />
                  <span className="text-sm text-ink">МСП (льгота)</span>
                </label>
              </div>
            </div>
          </Card>

          {/* Трудовая: приём, стаж, увольнение */}
          <Card title="Трудовая деятельность и стаж">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Дата приёма">
                <input
                  type="date"
                  className={inputClass}
                  value={selected.hireDate}
                  onChange={(e) => up({ hireDate: e.target.value })}
                />
              </Field>
              <Field label="Стаж">
                <div className="flex gap-2">
                  <select
                    className={`${inputClass} max-w-[130px]`}
                    value={selected.stazhMode ?? 'auto'}
                    onChange={(e) => up({ stazhMode: e.target.value as 'auto' | 'manual' })}
                  >
                    <option value="auto">Авто из даты</option>
                    <option value="manual">Вручную</option>
                  </select>
                  {(selected.stazhMode ?? 'auto') === 'manual' ? (
                    numInput(selected.stazhYears, (n) => up({ stazhYears: n }), { max: 60 })
                  ) : (
                    <div className="flex-1 self-center text-sm text-ink">
                      {selected.hireDate
                        ? formatStazh(computeStazh(selected.hireDate, undefined, selected.stazhPriorMonths))
                        : 'укажите дату приёма'}
                    </div>
                  )}
                </div>
              </Field>
              {(selected.stazhMode ?? 'auto') === 'auto' && (
                <Field label="Прежний стаж, мес" hint="добавляется к авто-стажу">
                  {numInput(selected.stazhPriorMonths ?? 0, (n) => up({ stazhPriorMonths: n }), { max: 720 })}
                </Field>
              )}
              <Field label="Дата увольнения">
                <div className="flex gap-2">
                  <input
                    type="date"
                    className={inputClass}
                    value={selected.dismissalDate ?? ''}
                    onChange={(e) => up({ dismissalDate: e.target.value || undefined })}
                  />
                  {selected.dismissalDate ? (
                    <button
                      type="button"
                      onClick={() => up({ dismissalDate: undefined })}
                      className="shrink-0 rounded-lg border border-line px-3 text-xs text-muted hover:text-ink"
                    >
                      Вернуть
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => up({ dismissalDate: new Date().toISOString().slice(0, 10) })}
                      className="shrink-0 rounded-lg border border-line px-3 text-xs text-muted hover:border-danger hover:text-danger"
                    >
                      Уволить
                    </button>
                  )}
                </div>
              </Field>
            </div>
          </Card>

          {/* Аванс */}
          <Card title="Аванс">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="День аванса (1–31)">
                {numInput(selected.advanceDay ?? 25, (n) => up({ advanceDay: Math.min(31, n) }), { max: 31 })}
              </Field>
              <Field label="Аванс, % от оклада" hint="0 = без разбивки на аванс/расчёт">
                {numInput(selected.advancePercent ?? 0, (n) => up({ advancePercent: Math.min(100, n) }), { max: 100 })}
              </Field>
            </div>
          </Card>

          {/* Заработок по годам */}
          <Card title="Заработок по годам" >
            <p className="mb-3 text-xs text-muted">
              Для баз отпускных и больничных (берётся заработок за прошлые годы).
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {earningsYears.map((y) => (
                <Field key={y} label={`${y} год, ₽`}>
                  {numInput(selected.earningsByYear?.[y] ?? 0, (n) =>
                    up({ earningsByYear: { ...(selected.earningsByYear ?? {}), [y]: n } })
                  )}
                </Field>
              ))}
            </div>
          </Card>

          {/* Личные данные */}
          <Card title="Личные данные">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Дата рождения">
                <input
                  type="date"
                  className={inputClass}
                  value={selected.birthDate ?? ''}
                  onChange={(e) => up({ birthDate: e.target.value || undefined })}
                />
              </Field>
              <Field label="СНИЛС">
                <input
                  className={inputClass}
                  placeholder="123-456-789 00"
                  value={selected.snils ?? ''}
                  onChange={(e) => up({ snils: e.target.value })}
                />
                {validateSnils(selected.snils ?? '') && (
                  <span className="mt-1 block text-xs text-danger">⚠ {validateSnils(selected.snils ?? '')}</span>
                )}
              </Field>
              <Field label="Паспорт">
                <input
                  className={inputClass}
                  placeholder="серия, номер, кем выдан"
                  value={selected.passport ?? ''}
                  onChange={(e) => up({ passport: e.target.value })}
                />
              </Field>
              <Field label="Адрес">
                <input
                  className={inputClass}
                  placeholder="г. ..., ул. ..."
                  value={selected.address ?? ''}
                  onChange={(e) => up({ address: e.target.value })}
                />
              </Field>
            </div>
          </Card>

          {/* Печать документов по сотруднику */}
          <Card title="Печать документов">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(EMPLOYEE_DOC_TITLE) as EmployeeDocType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDocType(t)}
                  className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  {EMPLOYEE_DOC_TITLE[t]}
                </button>
              ))}
            </div>
          </Card>

          {m && calc && (
            <Card title="Расчёт по сотруднику (в месяц)">
              {hasAdvance ? (
                <>
                  <Row label={`Аванс (${selected.advancePercent}%)`} value={dec(m.advance_gross)} />
                  <Row label="− НДФЛ с аванса" value={dec(m.advance_ndfl)} />
                  <Row label="= Аванс на руки" value={dec(m.advance_net)} strong />
                  <div className="mt-3 border-t border-line pt-2">
                    <Row label="Расчёт (остаток)" value={dec(m.settlement_gross)} />
                    <Row label="− НДФЛ с расчёта" value={dec(m.settlement_ndfl)} />
                    <Row label="= Расчёт на руки" value={dec(m.settlement_net)} strong />
                  </div>
                  <div className="mt-3 border-t border-line pt-2">
                    <Row label="Итого НДФЛ за месяц" hint="аванс + расчёт" value={dec(m.ndfl)} strong />
                    <Row label="Итого на руки" value={dec(m.net)} strong />
                  </div>
                </>
              ) : (
                <>
                  <Row label="Оклад (гросс)" value={dec(m.gross)} />
                  <Row label="− НДФЛ" hint="прогрессия, нарастающим за год" value={dec(m.ndfl)} />
                  <Row label="= На руки" value={dec(m.net)} strong />
                </>
              )}
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

      {docType && selected && (
        <PrintModal
          title={`${EMPLOYEE_DOC_TITLE[docType]} — ${selected.fio || 'сотрудник'}`}
          onClose={() => setDocType(null)}
        >
          <EmployeeDoc type={docType} org={activeOrg} employee={selected} />
        </PrintModal>
      )}
    </div>
  )
}

// ---- Зарплата ----
function SalaryCalc({ year }: { year: number }) {
  const { employees } = useEmployees()
  const [selId, setSelId] = useState('')
  const [gross, setGross] = useState(80_000)
  const [children, setChildren] = useState(0)
  const [msp, setMsp] = useState(true)
  const [advancePercent, setAdvancePercent] = useState(0)

  const pick = (e: Employee | null) => {
    setSelId(e?.id ?? '')
    if (e) {
      setGross(e.salary)
      setChildren(e.children)
      setMsp(e.msp)
      setAdvancePercent(e.advancePercent ?? 0)
    }
  }

  let r: ReturnType<typeof calcSalary> | null = null
  try {
    r = calcSalary(year, gross, { children, msp, advancePercent: advancePercent / 100 })
  } catch {
    r = null
  }
  const m = r?.months[0]
  const hasAdvance = advancePercent > 0

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <Card title="Параметры">
        <div className="space-y-4">
          <EmployeePicker employees={employees} value={selId} onPick={pick} />
          <Field label="Оклад в месяц (гросс)" hint={formatRub(gross)}>
            {numInput(gross, setGross)}
          </Field>
          <Field label="Детей (для вычета)">{numInput(children, setChildren, { max: 10 })}</Field>
          <Field label="Аванс, %" hint="0 = без разбивки">{numInput(advancePercent, (n) => setAdvancePercent(Math.min(100, n)), { max: 100 })}</Field>
          <label
            className="flex cursor-pointer items-center gap-2.5"
            title="Пониженный тариф 15% на выплаты сверх 1,5 МРОТ. С 2026 (ФЗ № 425-ФЗ) — только для субъектов МСП с основным ОКВЭД из перечня приоритетных отраслей; проверьте применимость."
          >
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

          {hasAdvance && (
            <Card title={`Аванс и расчёт (аванс ${advancePercent}%)`}>
              <Row label="Аванс (гросс)" value={dec(m.advance_gross)} />
              <Row label="− НДФЛ с аванса" value={dec(m.advance_ndfl)} />
              <Row label="= Аванс на руки" value={dec(m.advance_net)} strong />
              <div className="mt-3 border-t border-line pt-2">
                <Row label="Расчёт (гросс)" value={dec(m.settlement_gross)} />
                <Row label="− НДФЛ с расчёта" value={dec(m.settlement_ndfl)} />
                <Row label="= Расчёт на руки" value={dec(m.settlement_net)} strong />
              </div>
              <div className="mt-3 border-t border-line pt-2">
                <Row label="Итого НДФЛ за месяц" hint="аванс + расчёт" value={dec(m.ndfl)} strong />
              </div>
            </Card>
          )}

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
  const { employees } = useEmployees()
  const [selId, setSelId] = useState('')
  const [base, setBase] = useState(960_000)
  const [days, setDays] = useState(28)

  const pick = (e: Employee | null) => {
    setSelId(e?.id ?? '')
    if (e) {
      const b = vacationBase12m(e.earningsByYear, year)
      setBase(b > 0 ? b : e.salary * 12)
    }
  }

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
          <EmployeePicker employees={employees} value={selId} onPick={pick} />
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
            <Row
              label="− НДФЛ"
              hint={r.gross.toNumber() > 0 ? pct(r.ndfl.div(r.gross)) : 'прогрессия от выплаты'}
              value={dec(r.ndfl)}
            />
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
  const { employees } = useEmployees()
  const [selId, setSelId] = useState('')
  const [e1, setE1] = useState(800_000)
  const [e2, setE2] = useState(750_000)
  const [stazh, setStazh] = useState(7)
  const [days, setDays] = useState(7)
  const [month, setMonth] = useState(1)

  const pick = (e: Employee | null) => {
    setSelId(e?.id ?? '')
    if (e) {
      const { e1: b1, e2: b2 } = sickBases(e.earningsByYear, year)
      setE1(b1)
      setE2(b2)
      setStazh(effectiveStazhYears(e))
    }
  }

  let r: ReturnType<typeof calcSickLeave> | null = null
  try {
    r = calcSickLeave(year, e1, e2, stazh, days, 3, daysInMonth(year, month))
  } catch {
    r = null
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <Card title="Параметры">
        <div className="space-y-4">
          <EmployeePicker employees={employees} value={selId} onPick={pick} />
          <Field label={`Заработок за ${year - 1} год`} hint={formatRub(e1)}>{numInput(e1, setE1)}</Field>
          <Field label={`Заработок за ${year - 2} год`} hint={formatRub(e2)}>{numInput(e2, setE2)}</Field>
          <Field label="Стаж, лет">{numInput(stazh, setStazh, { max: 60 })}</Field>
          <Field label="Месяц болезни" hint="влияет на минимум по МРОТ (дней в месяце)">
            <select className={inputClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((nm, i) => (
                <option key={i} value={i + 1}>
                  {nm} ({daysInMonth(year, i + 1)} дн.)
                </option>
              ))}
            </select>
          </Field>
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
              <Row
                label="− НДФЛ"
                hint={r.total.toNumber() > 0 ? pct(r.ndfl.div(r.total)) : 'прогрессия от выплаты'}
                value={dec(r.ndfl)}
              />
            </div>
          </Card>
          {r.notes.map((n, i) => (
            <Note key={i}>{n}</Note>
          ))}
          <Note>
            НДФЛ показан по прогрессивной шкале от суммы выплаты (без учёта прочих доходов сотрудника
            за год) — итог за год сверяется бухгалтером.
          </Note>
        </div>
      )}
    </div>
  )
}

// ---- Алименты ----
function AlimonyCalc() {
  const { employees } = useEmployees()
  const [selId, setSelId] = useState('')
  const [gross, setGross] = useState(80_000)
  const [children, setChildren] = useState(1)

  const pick = (e: Employee | null) => {
    setSelId(e?.id ?? '')
    if (e) setGross(e.salary)
  }

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
          <EmployeePicker employees={employees} value={selId} onPick={pick} />
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

// ---- Сводка по штату ----
function StaffSummary({ org }: { org: Org }) {
  const { employees } = useEmployees()
  const [print, setPrint] = useState(false)
  const { rows, totals, count } = payrollSummary(org, employees)

  if (employees.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">Добавьте сотрудников во вкладке «Штат» — здесь появится сводка.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <div className="text-sm text-muted">ФОТ за год</div>
          <div className="tnum mt-1 text-xl font-semibold text-ink">{formatRub(totals.grossYear)}</div>
        </Card>
        <Card>
          <div className="text-sm text-muted">НДФЛ за год</div>
          <div className="tnum mt-1 text-xl font-semibold text-ink">{formatRub(totals.ndflYear)}</div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Страховые взносы за год</div>
          <div className="tnum mt-1 text-xl font-semibold text-brand-600">{formatRub(totals.vznosyYear)}</div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Стоимость для работодателя</div>
          <div className="tnum mt-1 text-xl font-semibold text-ink">{formatRub(totals.employerCostYear)}</div>
        </Card>
      </div>

      <Card
        title={`Начисления по штату (${count} чел.)`}
        right={
          <button
            type="button"
            onClick={() => setPrint(true)}
            className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            Печать ведомости
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Сотрудник</th>
                <th className="py-2 pr-3 text-right font-medium">Оклад/мес</th>
                <th className="py-2 pr-3 text-right font-medium">НДФЛ/мес</th>
                <th className="py-2 pr-3 text-right font-medium">На руки/мес</th>
                <th className="py-2 pr-3 text-right font-medium">Взносы/год</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.e.id} className="border-b border-line/60">
                  <td className="py-2 pr-3 text-ink">{a.e.fio || 'Без имени'}</td>
                  <td className="tnum py-2 pr-3 text-right">{formatRub(a.grossMonth)}</td>
                  <td className="tnum py-2 pr-3 text-right">{formatRub(a.ndflMonth)}</td>
                  <td className="tnum py-2 pr-3 text-right">{formatRub(a.netMonth)}</td>
                  <td className="tnum py-2 pr-3 text-right text-muted">{formatRub(a.vznosyYear)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line font-semibold">
                <td className="py-2 pr-3">Итого</td>
                <td className="tnum py-2 pr-3 text-right">{formatRub(totals.grossMonth)}</td>
                <td className="tnum py-2 pr-3 text-right">{formatRub(totals.ndflMonth)}</td>
                <td className="tnum py-2 pr-3 text-right">{formatRub(totals.netMonth)}</td>
                <td className="tnum py-2 pr-3 text-right">{formatRub(totals.vznosyYear)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Note>
        Суммы за год — проекция при равном окладе. Страховые взносы по всему штату:{' '}
        {formatRub(totals.vznosyYear)} (+ травматизм {formatRub(totals.travmYear)}).
      </Note>

      {print && (
        <PrintModal title="Расчётно-платёжная ведомость — предпросмотр" onClose={() => setPrint(false)}>
          <PayrollStatementDoc org={org} employees={employees} />
        </PrintModal>
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
      {tab === 'summary' && <StaffSummary org={activeOrg} />}
      {tab === 'reports' && <ReportsTab org={activeOrg} />}
    </div>
  )
}
