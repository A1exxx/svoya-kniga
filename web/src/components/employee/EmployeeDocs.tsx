import { calcSalary } from '../../lib/taxcore'
import { formatRub, formatDate } from '../../lib/format'
import { employeeSalaryOptions } from '../../lib/payrollSummary'
import { computeStazh, formatStazh } from '../../lib/stazh'
import type { Org } from '../../state/orgStore'
import type { Employee } from '../../state/employeesStore'

const today = () => new Date().toISOString().slice(0, 10)
const r0 = (n: number) => formatRub(Math.round(n))

function employer(org: Org): string {
  return org.fio || org.name || 'Индивидуальный предприниматель'
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-200 align-top">
      <td className="w-56 py-1.5 pr-3 text-slate-500">{label}</td>
      <td className="py-1.5 font-medium">{value || '—'}</td>
    </tr>
  )
}

function DocFooter() {
  return (
    <div className="mt-8 text-[11px] text-slate-400">
      Документ сформирован в «СвояКнига» {formatDate(today())}. Демонстрационная форма — перед
      использованием сверьте с актуальным бланком.
    </div>
  )
}

/** Личная карточка работника (упрощённый аналог формы Т-2). */
export function PersonalCardDoc({ org, employee: e }: { org: Org; employee: Employee }) {
  const stazh = e.hireDate ? formatStazh(computeStazh(e.hireDate, undefined, e.stazhPriorMonths)) : `${e.stazhYears} лет`
  return (
    <div>
      <div className="text-center text-base font-semibold">Личная карточка работника</div>
      <div className="mt-1 text-center text-xs text-slate-500">Работодатель: {employer(org)}{org.inn && `, ИНН ${org.inn}`}</div>
      <table className="mt-5 w-full text-[13px]">
        <tbody>
          <Field label="ФИО" value={e.fio} />
          <Field label="Должность" value={e.position} />
          <Field label="Дата рождения" value={e.birthDate ? formatDate(e.birthDate) : ''} />
          <Field label="СНИЛС" value={e.snils ?? ''} />
          <Field label="Паспорт" value={e.passport ?? ''} />
          <Field label="Адрес" value={e.address ?? ''} />
          <Field label="Дата приёма" value={e.hireDate ? formatDate(e.hireDate) : ''} />
          {e.dismissalDate && <Field label="Дата увольнения" value={formatDate(e.dismissalDate)} />}
          <Field label="Оклад" value={r0(e.salary) + ' / мес'} />
          <Field label="Страховой стаж" value={stazh} />
          <Field label="Детей (вычет)" value={String(e.children)} />
        </tbody>
      </table>
      <div className="mt-8 flex justify-between text-[13px]">
        <div>Работник: ______________ / {e.fio || '________'}</div>
        <div>Работодатель: ______________ / {employer(org)}</div>
      </div>
      <DocFooter />
    </div>
  )
}

/** Приказ (распоряжение) о приёме работника на работу (упрощённый аналог Т-1). */
export function HireOrderDoc({ org, employee: e }: { org: Org; employee: Employee }) {
  return (
    <div>
      <div className="text-center text-base font-semibold">
        Приказ (распоряжение) о приёме работника на работу
      </div>
      <div className="mt-1 text-center text-xs text-slate-500">
        {employer(org)}{org.inn && `, ИНН ${org.inn}`}
      </div>
      <div className="mt-2 text-center text-[13px]">
        № ______ от {e.hireDate ? formatDate(e.hireDate) : formatDate(today())}
      </div>
      <div className="mt-6 space-y-3 text-[13px] leading-relaxed">
        <p>
          Принять <span className="font-medium">{e.fio || '________________'}</span> на работу
          {e.position && (
            <>
              {' '}на должность <span className="font-medium">{e.position}</span>
            </>
          )}{' '}
          с {e.hireDate ? formatDate(e.hireDate) : '__________'}.
        </p>
        <p>
          Условия приёма: оклад <span className="font-medium">{r0(e.salary)}</span> в месяц,
          постоянно, полная занятость.
        </p>
      </div>
      <div className="mt-10 text-[13px]">
        Работодатель: ______________ / {employer(org)}
        <div className="mt-4">С приказом ознакомлен: ______________ / {e.fio || '________'}</div>
      </div>
      <DocFooter />
    </div>
  )
}

/** Справка о доходах и суммах налога физического лица (аналог 2-НДФЛ). */
export function IncomeCertDoc({ org, employee: e }: { org: Org; employee: Employee }) {
  let calc: ReturnType<typeof calcSalary> | null = null
  try {
    calc = calcSalary(org.year, e.salary, employeeSalaryOptions(e))
  } catch {
    calc = null
  }
  return (
    <div>
      <div className="text-center text-base font-semibold">
        Справка о доходах и суммах налога физического лица
      </div>
      <div className="mt-1 text-center text-xs text-slate-500">за {org.year} год · аналог формы 2-НДФЛ</div>
      <table className="mt-4 w-full text-[12.5px]">
        <tbody>
          <Field label="Налоговый агент" value={`${employer(org)}${org.inn ? `, ИНН ${org.inn}` : ''}`} />
          <Field label="Работник" value={e.fio} />
          <Field label="ИНН работника" value={''} />
        </tbody>
      </table>
      {calc && (
        <>
          <div className="mt-5 mb-2 font-semibold text-[13px]">Помесячно</div>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-y border-slate-300 text-left">
                <th className="py-1.5 pr-2 font-semibold">Месяц</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Доход</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Вычет</th>
                <th className="py-1.5 text-right font-semibold">НДФЛ</th>
              </tr>
            </thead>
            <tbody>
              {calc.months.map((m) => (
                <tr key={m.month} className="border-b border-slate-200">
                  <td className="py-1 pr-2">{m.month}</td>
                  <td className="tnum py-1 pr-2 text-right">{r0(m.gross.toNumber())}</td>
                  <td className="tnum py-1 pr-2 text-right">{r0(m.deduction_applied.toNumber())}</td>
                  <td className="tnum py-1 text-right">{r0(m.ndfl.toNumber())}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 font-semibold">
                <td className="py-1.5 pr-2">Итого</td>
                <td className="tnum py-1.5 pr-2 text-right">{r0(calc.gross_year.toNumber())}</td>
                <td className="py-1.5 pr-2" />
                <td className="tnum py-1.5 text-right">{r0(calc.ndfl_year.toNumber())}</td>
              </tr>
            </tbody>
          </table>
          <table className="mt-4 w-full text-[13px]">
            <tbody>
              <Field label="Общая сумма дохода" value={r0(calc.gross_year.toNumber())} />
              <Field label="Сумма налога исчисленная" value={r0(calc.ndfl_year.toNumber())} />
              <Field label="Сумма налога удержанная" value={r0(calc.ndfl_year.toNumber())} />
            </tbody>
          </table>
        </>
      )}
      <div className="mt-8 text-[13px]">Налоговый агент: ______________ / {employer(org)}</div>
      <DocFooter />
    </div>
  )
}

/** Заявление о предоставлении стандартного налогового вычета на детей (ст. 218 НК РФ). */
export function DeductionApplicationDoc({ org, employee: e }: { org: Org; employee: Employee }) {
  return (
    <div>
      <div className="text-right text-[13px] leading-relaxed">
        <div>Работодателю: {employer(org)}</div>
        <div>от работника: {e.fio || '________________'}</div>
        {e.position && <div>должность: {e.position}</div>}
      </div>
      <div className="mt-8 text-center text-base font-semibold">Заявление</div>
      <div className="mt-5 space-y-3 text-[13px] leading-relaxed">
        <p>
          Прошу предоставить мне стандартный налоговый вычет по налогу на доходы физических лиц на{' '}
          {e.children > 0 ? (
            <>
              <span className="font-medium">{e.children}</span> ребёнка (детей)
            </>
          ) : (
            'ребёнка (детей)'
          )}{' '}
          в соответствии с пп. 4 п. 1 ст. 218 Налогового кодекса РФ.
        </p>
        <p>Обязуюсь своевременно сообщать об изменении обстоятельств, влияющих на право на вычет.</p>
      </div>
      <div className="mt-10 flex justify-between text-[13px]">
        <div>{formatDate(today())}</div>
        <div>______________ / {e.fio || '________'}</div>
      </div>
      <DocFooter />
    </div>
  )
}

export type EmployeeDocType = 'card' | 'hireOrder' | 'incomeCert' | 'deductionApp'

export const EMPLOYEE_DOC_TITLE: Record<EmployeeDocType, string> = {
  card: 'Личная карточка',
  hireOrder: 'Приказ о приёме',
  incomeCert: 'Справка о доходах (НДФЛ)',
  deductionApp: 'Заявление на вычет',
}

export function EmployeeDoc({
  type,
  org,
  employee,
}: {
  type: EmployeeDocType
  org: Org
  employee: Employee
}) {
  if (type === 'card') return <PersonalCardDoc org={org} employee={employee} />
  if (type === 'hireOrder') return <HireOrderDoc org={org} employee={employee} />
  if (type === 'incomeCert') return <IncomeCertDoc org={org} employee={employee} />
  return <DeductionApplicationDoc org={org} employee={employee} />
}
