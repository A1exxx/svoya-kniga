import { useEffect, useState } from 'react'
import { useOrg, type Org } from '../state/orgStore'
import {
  useEmployees,
  type Employee,
  type VacationType,
  type VacationEvent,
} from '../state/employeesStore'
import { periodDays, accruedVacationDays, sickDayFloors } from '../lib/vacation'
import { VacationOrderDoc, VacationScheduleDoc } from '../components/employee/EmployeeDocs'
import { calcAlimony, calcSalary, calcSickLeave, calcVacation, workdaysInMonth } from '../lib/taxcore'
import { formatRub, formatDate } from '../lib/format'
import { computeStazh, formatStazh, stazhYearsFromHire } from '../lib/stazh'
import { sickBases, vacationBase12m } from '../lib/earnings'
import { payrollSummary, employeeSalaryOptions } from '../lib/payrollSummary'
import { validateSnils } from '../lib/validation'
import { checkMspOkved } from '../lib/mspOkved'
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
  { key: 'vacation', label: 'Отпуск' },
  { key: 'sick', label: 'Больничный / Пособия' },
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
      calc = calcSalary(year, selected.salary, employeeSalaryOptions(selected, year))
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
                  if (!window.confirm(`Удалить сотрудника «${selected.fio || 'без имени'}»? Его данные исчезнут из расчётов и отчётов.`)) return
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
              {selected.msp &&
                (() => {
                  const c = checkMspOkved(activeOrg.okved, activeOrg.year)
                  if (!c.warning) return null
                  return (
                    <p className={`mt-2 text-xs ${c.inList ? 'text-muted' : 'text-red-600'}`}>{c.warning}</p>
                  )
                })()}
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
          <Card title="Аванс и зарплата">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="День аванса (1–31)">
                {numInput(selected.advanceDay ?? 25, (n) => up({ advanceDay: Math.min(31, n) }), { max: 31 })}
              </Field>
              <Field label="День выдачи зарплаты (1–31)" hint="уходит в задачи дашборда">
                {numInput(selected.salaryDay ?? 10, (n) => up({ salaryDay: Math.min(31, n) }), { max: 31 })}
              </Field>
              <Field label="Аванс, % от оклада" hint="0 = без разбивки на аванс/расчёт">
                {numInput(selected.advancePercent ?? 0, (n) => up({ advancePercent: Math.min(100, n) }), { max: 100 })}
              </Field>
            </div>
          </Card>

          {/* Заработок по годам ПО МЕСЯЦАМ (оклад мог меняться внутри года) */}
          <Card title="Заработок по годам (по месяцам)">
            <p className="mb-3 text-xs text-muted">
              Для баз отпускных и больничных. Оклад мог меняться в течение года — заполните по месяцам
              (январь…декабрь). Итог за год считается автоматически.
            </p>
            <div className="space-y-3">
              {earningsYears.map((y) => {
                const arr = selected.earningsByYear?.[y] ?? []
                const total = arr.reduce((s, x) => s + (x || 0), 0)
                return (
                  <div key={y} className="rounded-lg border border-line p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{y} год</span>
                      <span className="tnum text-sm text-muted">итого {formatRub(total)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {MONTH_NAMES.map((mn, m) => (
                        <label key={m} className="block">
                          <span className="mb-0.5 block text-[11px] text-muted">{mn.slice(0, 3)}</span>
                          {numInput(arr[m] ?? 0, (n) => {
                            const next = Array.from({ length: 12 }, (_, i) => (i === m ? n : arr[i] ?? 0))
                            up({ earningsByYear: { ...(selected.earningsByYear ?? {}), [y]: next } })
                          })}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
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
              {selected.alimonyEnabled &&
                (() => {
                  const a = employeeAlimony(selected, year)
                  if (!a) return null
                  return (
                    <div className="mt-3 border-t border-line pt-2">
                      <Row label="− Алименты" hint={a.label} value={formatRub(a.alimony)} />
                      <Row
                        label="= К выплате после алиментов"
                        value={formatRub(Math.max(0, m.net.toNumber() - a.alimony))}
                        strong
                      />
                    </div>
                  )
                })()}
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
  const { employees, updateEmployee } = useEmployees()
  const { activeOrg } = useOrg()
  const [selId, setSelId] = useState('')
  const [gross, setGross] = useState(80_000)
  const [children, setChildren] = useState(0)
  const [msp, setMsp] = useState(true)
  const [advancePercent, setAdvancePercent] = useState(0)
  const [selMonth, setSelMonth] = useState(() => Math.min(new Date().getMonth(), 11))
  const [detail, setDetail] = useState(false)

  const norm = (mi: number) => workdaysInMonth(year, mi + 1)
  const [worked, setWorked] = useState<number[]>(() => Array.from({ length: 12 }, (_, i) => norm(i)))

  // При смене года/ИП пересинхронизируем «отработано» под нормы нового года (иначе
  // абсолютные дни старого года делятся на новые нормы → неверная доля).
  useEffect(() => {
    const e = employees.find((x) => x.id === selId)
    const wd = e?.workedDaysByYear?.[year]
    setWorked(Array.from({ length: 12 }, (_, i) => (wd && wd[i] != null ? wd[i] : norm(i))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  const pick = (e: Employee | null) => {
    setSelId(e?.id ?? '')
    if (e) {
      setGross(e.salary)
      setChildren(e.children)
      setMsp(e.msp)
      setAdvancePercent(e.advancePercent ?? 0)
      const wd = e.workedDaysByYear?.[year]
      setWorked(Array.from({ length: 12 }, (_, i) => (wd && wd[i] != null ? wd[i] : norm(i))))
    }
  }

  const setWorkedMonth = (mi: number, val: number) => {
    const v = Math.max(0, Math.min(norm(mi), Math.round(val) || 0))
    setWorked((w) => {
      const next = w.slice()
      next[mi] = v
      if (selId) {
        const e = employees.find((x) => x.id === selId)
        const map = { ...(e?.workedDaysByYear ?? {}) }
        map[year] = next
        updateEmployee(selId, { workedDaysByYear: map })
      }
      return next
    })
  }

  const factors = worked.map((d, i) => (norm(i) ? d / norm(i) : 1))
  let r: ReturnType<typeof calcSalary> | null = null
  try {
    r = calcSalary(year, gross, { children, msp, advancePercent: advancePercent / 100, monthFactors: factors })
  } catch {
    r = null
  }
  const m = r?.months[selMonth]
  const hasAdvance = advancePercent > 0
  const normSel = norm(selMonth)
  const partial = worked[selMonth] !== normSel

  // Начисления ПО ФАКТУ: месяц появляется в «Зарплата по месяцам» только после «Начислить».
  // Так бухгалтер не получает 12 месяцев вперёд с одинаковым окладом.
  const selEmp = employees.find((x) => x.id === selId) ?? null
  const accruedArr = (selEmp?.accruedMonths?.[year] ?? []).slice()
  while (accruedArr.length < 12) accruedArr.push(false)
  const isAccrued = (mi: number) => !!accruedArr[mi]
  const anyAccrued = accruedArr.some(Boolean)
  const accIdx = Array.from({ length: 12 }, (_, i) => i).filter(isAccrued)
  const setAccrued = (mi: number, val: boolean) => {
    if (!selEmp) return
    const next = accruedArr.slice()
    next[mi] = val
    const patch: Partial<Employee> = { accruedMonths: { ...(selEmp.accruedMonths ?? {}), [year]: next } }
    // Снятие начисления снимает и отметку выдачи за этот месяц.
    if (!val && (selEmp.paidMonths?.[year]?.[mi] ?? false)) {
      const p = (selEmp.paidMonths?.[year] ?? []).slice()
      while (p.length < 12) p.push(false)
      p[mi] = false
      patch.paidMonths = { ...(selEmp.paidMonths ?? {}), [year]: p }
    }
    updateEmployee(selEmp.id, patch)
  }
  // Выдача (выплата) зарплаты по месяцам — отдельная отметка по факту.
  const paidArr = (selEmp?.paidMonths?.[year] ?? []).slice()
  while (paidArr.length < 12) paidArr.push(false)
  const isPaid = (mi: number) => !!paidArr[mi]
  const setPaid = (mi: number, val: boolean) => {
    if (!selEmp) return
    const next = paidArr.slice()
    next[mi] = val
    updateEmployee(selEmp.id, { paidMonths: { ...(selEmp.paidMonths ?? {}), [year]: next } })
  }
  const accTot = accIdx.reduce(
    (a, i) => {
      const mm = r!.months[i]
      return {
        gross: a.gross + mm.gross.toNumber(),
        ndfl: a.ndfl + mm.ndfl.toNumber(),
        net: a.net + mm.net.toNumber(),
        vz: a.vz + mm.vznosy.plus(mm.travmatizm).toNumber(),
      }
    },
    { gross: 0, ndfl: 0, net: 0, vz: 0 }
  )

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
          {msp &&
            (() => {
              const c = checkMspOkved(activeOrg.okved, activeOrg.year)
              if (!c.warning) return null
              return <p className={`text-xs ${c.inList ? 'text-muted' : 'text-red-600'}`}>{c.warning}</p>
            })()}
          {r && r.child_deduction_monthly.toNumber() > 0 && (
            <p className="text-xs text-muted">Вычет на детей: {dec(r.child_deduction_monthly)}/мес</p>
          )}
          <Note>
            Зарплата считается ПОМЕСЯЧНО из отработанных рабочих дней (производственный календарь{' '}
            {year}). Полный месяц — полный оклад; неполный — пропорционально. Выберите месяц ниже и
            при необходимости измените «Отработано».
          </Note>
        </div>
      </Card>

      {m && r && (
        <div className="space-y-5">
          {/* Текущий месяц */}
          <Card
            title={`${MONTH_NAMES[selMonth]} ${year}`}
            right={
              <select
                className="cursor-pointer rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
                value={selMonth}
                onChange={(e) => setSelMonth(Number(e.target.value))}
              >
                {MONTH_NAMES.map((mn, i) => (
                  <option key={i} value={i}>
                    {mn} {year}
                  </option>
                ))}
              </select>
            }
          >
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Отработано</span>
              <input
                type="number"
                min={0}
                max={normSel}
                value={worked[selMonth]}
                onChange={(e) => setWorkedMonth(selMonth, Number(e.target.value))}
                className="w-16 rounded-lg border border-line px-2 py-1 text-center text-sm text-ink"
              />
              <span className="text-muted">из {normSel} рабочих дней</span>
              {partial && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-warn">
                  неполный месяц — оклад пропорционально
                </span>
              )}
            </div>
            <Row label="Оклад (полный месяц)" value={formatRub(gross)} />
            <Row label="Всего начислено" hint={partial ? `${worked[selMonth]}/${normSel} дн.` : undefined} value={dec(m.gross)} strong />
            <Row label="− Вычтен НДФЛ" hint="нарастающим итогом за год" value={dec(m.ndfl)} />
            <Row label="= Итого к выдаче" value={dec(m.net)} strong />
            {hasAdvance && (
              <div className="mt-1 text-xs text-muted">
                в т.ч. аванс {advancePercent}% ({dec(m.advance_gross)}) — на руки {dec(m.advance_net)};
                зарплата — на руки {dec(m.settlement_net)}
              </div>
            )}
            <button
              type="button"
              onClick={() => setDetail((v) => !v)}
              className="mt-3 cursor-pointer text-sm font-medium text-brand-600 hover:underline"
            >
              {detail ? 'Скрыть подробный расчёт ▴' : 'Подробный расчёт ▾'}
            </button>
            {detail && (
              <div className="mt-3 border-t border-line pt-3">
                {hasAdvance && (
                  <>
                    <Row label="Аванс (гросс)" value={dec(m.advance_gross)} />
                    <Row label="− НДФЛ с аванса" value={dec(m.advance_ndfl)} />
                    <Row label="= Аванс на руки" value={dec(m.advance_net)} strong />
                    <div className="mt-2 border-t border-line pt-2">
                      <Row label="Расчёт (гросс)" value={dec(m.settlement_gross)} />
                      <Row label="− НДФЛ с расчёта" value={dec(m.settlement_ndfl)} />
                      <Row label="= Расчёт на руки" value={dec(m.settlement_net)} strong />
                    </div>
                  </>
                )}
                <div className={hasAdvance ? 'mt-2 border-t border-line pt-2' : ''}>
                  <Row label="Страховые взносы (с ФОТ)" hint={msp ? 'льгота МСП' : 'единый тариф'} value={dec(m.vznosy)} />
                  <Row label="Взносы на травматизм" hint="0,2%" value={dec(m.travmatizm)} />
                  <Row label="Стоимость для работодателя" value={dec(m.gross.plus(m.vznosy).plus(m.travmatizm))} strong />
                </div>
              </div>
            )}
          </Card>

          {/* Начисления ПО ФАКТУ — месяц появляется только после «Начислить» */}
          <Card
            title="Зарплата по месяцам"
            right={
              selId ? (
                isAccrued(selMonth) ? (
                  <button
                    type="button"
                    onClick={() => setAccrued(selMonth, false)}
                    className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:border-danger hover:text-danger"
                  >
                    Убрать начисление за {MONTH_NAMES[selMonth]}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAccrued(selMonth, true)}
                    className="cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                  >
                    Начислить за {MONTH_NAMES[selMonth]}
                  </button>
                )
              ) : null
            }
          >
            {!selId ? (
              <Note>
                Выберите сотрудника, чтобы вести начисления по месяцам по факту. В ручном режиме
                показывается только выбранный месяц (карточка выше).
              </Note>
            ) : !anyAccrued ? (
              <Note>
                Ещё нет начислений. Выберите месяц в карточке выше и нажмите «Начислить за …» — он
                появится здесь. Месяцы вперёд не заполняются.
              </Note>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-2 pr-3 font-medium">Месяц</th>
                      <th className="py-2 pr-3 text-right font-medium">Дней</th>
                      <th className="py-2 pr-3 text-right font-medium">Начислено</th>
                      <th className="py-2 pr-3 text-right font-medium">Удержано</th>
                      <th className="py-2 pr-3 text-right font-medium">К выдаче</th>
                      <th className="py-2 pr-3 text-right font-medium">Взносы</th>
                      <th className="py-2 pr-3 text-center font-medium">Выплата</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {accIdx.map((i) => {
                      const mm = r.months[i]
                      return (
                        <tr
                          key={i}
                          onClick={() => setSelMonth(i)}
                          className={`cursor-pointer border-b border-line/60 transition-colors hover:bg-slate-50 ${
                            i === selMonth ? 'bg-brand-50' : ''
                          }`}
                        >
                          <td className="py-2 pr-3 text-ink">
                            {MONTH_NAMES[i]} {year}
                          </td>
                          <td className="tnum py-2 pr-3 text-right text-muted">
                            {worked[i]}/{norm(i)}
                          </td>
                          <td className="tnum py-2 pr-3 text-right text-ink">{dec(mm.gross)}</td>
                          <td className="tnum py-2 pr-3 text-right text-muted">{dec(mm.ndfl)}</td>
                          <td className="tnum py-2 pr-3 text-right font-medium text-ink">{dec(mm.net)}</td>
                          <td className="tnum py-2 pr-3 text-right text-muted">
                            {dec(mm.vznosy.plus(mm.travmatizm))}
                          </td>
                          <td className="py-2 pr-3 text-center">
                            {isPaid(i) ? (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  setPaid(i, false)
                                }}
                                className="cursor-pointer rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-medium text-ok"
                                title="Снять отметку о выдаче"
                              >
                                Выплачено ✓
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  setPaid(i, true)
                                }}
                                className="cursor-pointer rounded-lg border border-line px-2 py-0.5 text-[11px] font-medium text-ink transition-colors hover:border-ok hover:text-ok"
                              >
                                Выплатить
                              </button>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation()
                                setAccrued(i, false)
                              }}
                              className="cursor-pointer text-xs text-slate-400 transition-colors hover:text-danger"
                            >
                              убрать
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line font-medium text-ink">
                      <td className="py-2 pr-3 text-right text-muted" colSpan={2}>
                        Начислено за {accIdx.length} мес.
                      </td>
                      <td className="tnum py-2 pr-3 text-right">{formatRub(accTot.gross)}</td>
                      <td className="tnum py-2 pr-3 text-right text-muted">{formatRub(accTot.ndfl)}</td>
                      <td className="tnum py-2 pr-3 text-right">{formatRub(accTot.net)}</td>
                      <td className="tnum py-2 pr-3 text-right text-muted">{formatRub(accTot.vz)}</td>
                      <td className="py-2 pr-3 text-center text-xs text-muted">
                        выдано {accIdx.filter(isPaid).length}/{accIdx.length}
                      </td>
                      <td className="py-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">
              Больничный или отпуск без оплаты в месяце — уменьшите «Отработано» в карточке месяца,
              начисление пересчитается. Выплату зарплаты оформляйте в «Платёжках» (тип «Выплата
              зарплаты»).
            </p>
          </Card>

          <Card title="Взносы и стоимость (проекция на год)">
            <p className="mb-2 text-xs text-muted">Если сотрудник работает все 12 месяцев на текущих условиях.</p>
            <Row label="Доход (гросс) за год" value={dec(r.gross_year)} />
            <Row label="НДФЛ за год" value={dec(r.ndfl_year)} />
            <Row label="Взносы за год" value={dec(r.vznosy_year.plus(r.travmatizm_year))} />
            <Row label="Стоимость для работодателя за год" value={dec(r.employer_cost_year)} strong />
          </Card>
          <Note>
            НДФЛ считается нарастающим итогом; при годовом доходе свыше 2,4 млн ₽ ставка растёт (15% и
            выше). «Отработано» по каждому месяцу сохраняется в карточке сотрудника.
          </Note>
        </div>
      )}
    </div>
  )
}

// ---- Отпуск (события: период + вид) ----
const VACATION_TYPE_LABEL: Record<VacationType, string> = {
  regular: 'Очередной (оплачиваемый)',
  childcare: 'По уходу за ребёнком',
  unpaid: 'Без сохранения зарплаты',
}

function newId(prefix: string): string {
  try {
    return crypto.randomUUID()
  } catch {
    return prefix + '-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

function VacationCalc({ year }: { year: number }) {
  const { activeOrg } = useOrg()
  const { employees, updateEmployee } = useEmployees()
  const [selId, setSelId] = useState('')
  const [vtype, setVtype] = useState<VacationType>('regular')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [order, setOrder] = useState<VacationEvent | null>(null)
  const [schedule, setSchedule] = useState(false)

  const emp = employees.find((e) => e.id === selId) ?? null
  const base = emp ? vacationBase12m(emp.earningsByYear, year) || emp.salary * 12 : 0
  const days = periodDays(from, to)
  const usedRegular = (emp?.vacations ?? [])
    .filter((v) => v.type === 'regular')
    .reduce((s, v) => s + periodDays(v.from, v.to), 0)
  const accrued = emp?.hireDate ? accruedVacationDays(emp.hireDate, new Date(), usedRegular) : null

  let calc: ReturnType<typeof calcVacation> | null = null
  try {
    calc = vtype === 'regular' && days > 0 ? calcVacation(year, base, days) : null
  } catch {
    calc = null
  }

  const addVacation = () => {
    if (!emp || !from || !to || days <= 0) return
    updateEmployee(emp.id, { vacations: [...(emp.vacations ?? []), { id: newId('v'), from, to, type: vtype }] })
    setFrom('')
    setTo('')
  }
  const removeVacation = (id: string) => {
    if (emp) updateEmployee(emp.id, { vacations: (emp.vacations ?? []).filter((v) => v.id !== id) })
  }

  return (
    <div className="space-y-5">
      <Card
        title="Отпуск сотрудника"
        right={
          <button
            type="button"
            onClick={() => setSchedule(true)}
            className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            График отпусков (Т-7)
          </button>
        }
      >
        <div className="space-y-4">
          <EmployeePicker employees={employees} value={selId} onPick={(e) => setSelId(e?.id ?? '')} />
          {emp && accrued != null && (
            <Note>
              Накоплено дней отпуска: <b>{accrued}</b> (28 дн/год с даты приёма за вычетом
              использованных {usedRegular}).
            </Note>
          )}
          {emp ? (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Вид отпуска">
                  <select className={inputClass} value={vtype} onChange={(e) => setVtype(e.target.value as VacationType)}>
                    {(Object.keys(VACATION_TYPE_LABEL) as VacationType[]).map((t) => (
                      <option key={t} value={t}>{VACATION_TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="С"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
                <Field label="По"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
                <Field label="Дней"><input className={inputClass} readOnly value={days || ''} /></Field>
              </div>
              {calc && (
                <Note>
                  Отпускные за {days} дн.: начислено {dec(calc.gross)}, НДФЛ {dec(calc.ndfl)}, на руки{' '}
                  <b>{dec(calc.net)}</b> (СДЗ {dec(calc.avg_daily)} = {formatRub(base)} ÷ 12 ÷ 29,3).
                </Note>
              )}
              {vtype === 'unpaid' && days > 0 && (
                <Note tone="warn">Без сохранения зарплаты: отпускные не начисляются, зарплата за эти дни уменьшается.</Note>
              )}
              {vtype === 'childcare' && days > 0 && (
                <Note>Отпуск по уходу за ребёнком: оклад не начисляется (пособие — через СФР, серверный этап).</Note>
              )}
              <button
                type="button"
                onClick={addVacation}
                disabled={!from || !to || days <= 0}
                className="cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                Добавить отпуск
              </button>
            </>
          ) : (
            <Note>Выберите сотрудника, чтобы оформить отпуск.</Note>
          )}
        </div>
      </Card>

      {emp && (emp.vacations?.length ?? 0) > 0 && (
        <Card title="Оформленные отпуска">
          <div className="space-y-1.5">
            {(emp.vacations ?? []).map((v) => {
              const d = periodDays(v.from, v.to)
              let c: ReturnType<typeof calcVacation> | null = null
              if (v.type === 'regular') {
                try {
                  c = calcVacation(year, base, d)
                } catch {
                  c = null
                }
              }
              return (
                <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    {VACATION_TYPE_LABEL[v.type]}
                  </span>
                  <span className="text-ink">{formatDate(v.from)} — {formatDate(v.to)} · {d} дн.</span>
                  {c && <span className="tnum text-muted">отпускные {dec(c.net)}</span>}
                  <button type="button" onClick={() => setOrder(v)} className="ml-auto cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs text-ink hover:border-brand-300 hover:bg-brand-50">Приказ</button>
                  <button type="button" onClick={() => removeVacation(v.id)} className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs text-slate-400 hover:text-danger">Удалить</button>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {order && emp && (
        <PrintModal title="Приказ на отпуск (Т-6)" onClose={() => setOrder(null)}>
          <VacationOrderDoc org={activeOrg} employee={emp} vacation={order} />
        </PrintModal>
      )}

      {schedule && (
        <PrintModal title="График отпусков (Т-7)" onClose={() => setSchedule(false)}>
          <VacationScheduleDoc org={activeOrg} employees={employees} year={year} />
        </PrintModal>
      )}
    </div>
  )
}

// ---- Больничный / Пособия (события: период) ----
function SickCalc({ year }: { year: number }) {
  const { employees, updateEmployee } = useEmployees()
  const [selId, setSelId] = useState('')
  const [e1, setE1] = useState(800_000)
  const [e2, setE2] = useState(750_000)
  const [stazh, setStazh] = useState(7)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const emp = employees.find((e) => e.id === selId) ?? null
  const pick = (e: Employee | null) => {
    setSelId(e?.id ?? '')
    if (e) {
      const { e1: b1, e2: b2 } = sickBases(e.earningsByYear, year)
      setE1(b1)
      setE2(b2)
      setStazh(effectiveStazhYears(e))
    }
  }

  const days = periodDays(from, to)
  const month = from ? Number(from.slice(5, 7)) : 1

  let r: ReturnType<typeof calcSickLeave> | null = null
  try {
    r = days > 0 ? calcSickLeave(year, e1, e2, stazh, days, 3, daysInMonth(year, month), sickDayFloors(from, days)) : null
  } catch {
    r = null
  }

  const addSick = () => {
    if (!emp || !from || !to || days <= 0) return
    updateEmployee(emp.id, { sickLeaves: [...(emp.sickLeaves ?? []), { id: newId('s'), from, to }] })
    setFrom('')
    setTo('')
  }
  const removeSick = (id: string) => {
    if (emp) updateEmployee(emp.id, { sickLeaves: (emp.sickLeaves ?? []).filter((s) => s.id !== id) })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <Card title="Параметры">
          <div className="space-y-4">
            <EmployeePicker employees={employees} value={selId} onPick={pick} />
            <Field label={`Заработок за ${year - 1} год`} hint={formatRub(e1)}>{numInput(e1, setE1)}</Field>
            <Field label={`Заработок за ${year - 2} год`} hint={formatRub(e2)}>{numInput(e2, setE2)}</Field>
            <Field label="Стаж, лет">{numInput(stazh, setStazh, { max: 60 })}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Болел с"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="по"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
            {days > 0 ? (
              <div className="rounded-lg border border-line bg-slate-50/60 px-3 py-2 text-xs text-muted dark:bg-slate-800/40">
                Период: <b className="text-ink">{formatDate(from)} — {formatDate(to)}</b> · {days}{' '}
                {days === 1 ? 'день' : 'дн.'} (первые 3 — за счёт работодателя, остальные — СФР).
                {(() => {
                  const set = new Set<number>()
                  for (let i = 0; i < days; i++) {
                    const dt = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)) + i)
                    set.add(dt.getMonth())
                  }
                  return set.size > 1 ? (
                    <span className="mt-1 block text-warn">
                      Захватывает месяцы: {[...set].map((mi) => MONTH_NAMES[mi]).join(', ')} — пособие за
                      каждый день считается по длине своего месяца.
                    </span>
                  ) : null
                })()}
              </div>
            ) : (
              <div className="text-xs text-muted">Укажите период болезни (с — по).</div>
            )}
            {emp && (
              <button
                type="button"
                onClick={addSick}
                disabled={!from || !to || days <= 0}
                className="cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                Добавить больничный
              </button>
            )}
          </div>
        </Card>
        {!r ? (
          <Card><Note>Выберите сотрудника и укажите период болезни (с — по), чтобы рассчитать пособие.</Note></Card>
        ) : (
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

      {emp && (emp.sickLeaves?.length ?? 0) > 0 && (
        <Card title="Оформленные больничные">
          <div className="space-y-1.5">
            {(emp.sickLeaves ?? []).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="text-ink">{formatDate(s.from)} — {formatDate(s.to)} · {periodDays(s.from, s.to)} дн.</span>
                <button type="button" onClick={() => removeSick(s.id)} className="ml-auto cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs text-slate-400 hover:text-danger">Удалить</button>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Note>Взаимодействие с СФР/ФСС (оформление, выплата пособия) — серверный этап.</Note>
          </div>
        </Card>
      )}
    </div>
  )
}

// ---- Алименты (галочка на сотруднике → авто-расчёт) ----
/** Алименты сотрудника за месяц: доля от (оклад−НДФЛ) или твёрдая сумма, лимит 70%. */
export function employeeAlimony(e: Employee, year: number): { alimony: number; label: string; capped: boolean; base: number; ndfl: number } | null {
  if (!e.alimonyEnabled) return null
  const gross = e.salary
  let ndfl = Math.round(gross * 0.13)
  try {
    const r = calcSalary(year, gross, employeeSalaryOptions(e, year))
    ndfl = r.months[0]?.ndfl.toNumber() ?? ndfl
  } catch {
    /* fallback 13% */
  }
  const base = Math.max(0, gross - ndfl)
  if ((e.alimonyMode ?? 'share') === 'fixed') {
    const cap = base * 0.7
    const fixed = e.alimonyFixed ?? 0
    return { alimony: Math.min(fixed, cap), label: `${formatRub(fixed)} (тверд.)`, capped: fixed > cap, base, ndfl }
  }
  const r = calcAlimony(gross, ndfl, e.alimonyChildren ?? 1)
  return { alimony: r.alimony.toNumber(), label: r.share_label, capped: r.capped, base, ndfl }
}

function AlimonyCalc({ year }: { year: number }) {
  const { employees, updateEmployee } = useEmployees()
  const [selId, setSelId] = useState('')
  const emp = employees.find((e) => e.id === selId) ?? null
  const up = (patch: Partial<Employee>) => emp && updateEmployee(emp.id, patch)

  const enabled = !!emp?.alimonyEnabled
  const mode = emp?.alimonyMode ?? 'share'
  const res = emp ? employeeAlimony(emp, year) : null

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <Card title="Удержание алиментов">
        <div className="space-y-4">
          <EmployeePicker employees={employees} value={selId} onPick={(e) => setSelId(e?.id ?? '')} />
          {emp ? (
            <>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line text-brand-600"
                  checked={enabled}
                  onChange={(e) => up({ alimonyEnabled: e.target.checked })}
                />
                <span className="text-sm text-ink">
                  Удерживать алименты <span className="text-muted">(исполнительный лист / соглашение)</span>
                </span>
              </label>
              {enabled && (
                <>
                  <Field label="Способ удержания">
                    <select
                      className={inputClass}
                      value={mode}
                      onChange={(e) => up({ alimonyMode: e.target.value as 'share' | 'fixed' })}
                    >
                      <option value="share">Доля от дохода (по числу детей)</option>
                      <option value="fixed">Твёрдая сумма в месяц</option>
                    </select>
                  </Field>
                  {mode === 'share' ? (
                    <Field label="Детей на алименты" hint="1 → 1/4, 2 → 1/3, 3+ → 1/2 (ст. 81 СК РФ)">
                      <select
                        className={inputClass}
                        value={emp.alimonyChildren ?? 1}
                        onChange={(e) => up({ alimonyChildren: Number(e.target.value) })}
                      >
                        <option value={1}>1 ребёнок — 1/4</option>
                        <option value={2}>2 детей — 1/3</option>
                        <option value={3}>3 и более — 1/2</option>
                      </select>
                    </Field>
                  ) : (
                    <Field label="Сумма в месяц, ₽">
                      {numInput(emp.alimonyFixed ?? 0, (n) => up({ alimonyFixed: n }))}
                    </Field>
                  )}
                  <Note>
                    Алименты считаются автоматически от оклада сотрудника за вычетом НДФЛ и удерживаются
                    из каждой выплаты (аванс + расчёт). Менять оклад/детей вручную здесь не нужно — всё
                    берётся из карточки.
                  </Note>
                </>
              )}
            </>
          ) : (
            <Note>Выберите сотрудника. Удержание включается галочкой — дальше всё считается само.</Note>
          )}
        </div>
      </Card>
      {emp && enabled && res ? (
        <div className="space-y-5">
          <Card>
            <div className="text-sm text-muted">Алименты в месяц</div>
            <div className="tnum mt-1 text-3xl font-semibold text-ink">{formatRub(res.alimony)}</div>
          </Card>
          <Card title="Как посчитано">
            <Row label="Оклад (гросс)" value={formatRub(emp.salary)} />
            <Row label="− НДФЛ" hint="из расчёта зарплаты" value={formatRub(res.ndfl)} />
            <Row label="= База удержания" value={formatRub(res.base)} strong />
            <Row label={mode === 'share' ? 'Доля' : 'Твёрдая сумма'} hint={mode === 'share' ? 'ст. 81 СК РФ' : undefined} value={res.label} />
            <Row label="Алименты к удержанию" value={formatRub(res.alimony)} strong />
          </Card>
          {res.capped && (
            <Note tone="warn">Применён максимум удержания 70% от дохода после НДФЛ (ст. 99 ФЗ № 229-ФЗ).</Note>
          )}
          <Note>
            С 1 марта 2026 минимальный размер алиментов привязан к среднемесячной зарплате в регионе
            (ФЗ № 432-ФЗ) — если доля ниже минимума, пристав может назначить твёрдую сумму.
          </Note>
        </div>
      ) : emp && !enabled ? (
        <Card>
          <Note>Алименты не удерживаются. Поставьте галочку слева, если есть исполнительный лист.</Note>
        </Card>
      ) : null}
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
      {tab === 'alimony' && <AlimonyCalc year={activeOrg.year} />}
      {tab === 'summary' && <StaffSummary org={activeOrg} />}
      {tab === 'reports' && <ReportsTab org={activeOrg} />}
    </div>
  )
}
