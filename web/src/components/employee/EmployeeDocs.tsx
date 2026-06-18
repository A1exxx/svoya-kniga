import { calcSalary, calcVacation, calcSickLeave } from '../../lib/taxcore'
import { formatRub, formatDate } from '../../lib/format'
import { employeeSalaryOptions } from '../../lib/payrollSummary'
import { computeStazh, formatStazh, stazhYearsFromHire } from '../../lib/stazh'
import { periodDays } from '../../lib/vacation'
import { vacationBase12m, sickBases } from '../../lib/earnings'
import type { Org } from '../../state/orgStore'
import type { Employee, VacationEvent, VacationType } from '../../state/employeesStore'

const today = () => new Date().toISOString().slice(0, 10)
const r0 = (n: number) => formatRub(Math.round(n))

const MONTH_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
/** Дата в виде официального бланка: «03» апреля 2026 г. */
function dateRu(iso?: string): string {
  if (!iso) return '«__» ____________ 20__ г.'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `«${String(d).padStart(2, '0')}» ${MONTH_GEN[m - 1]} ${y} г.`
}

function employer(org: Org): string {
  return org.fio || org.name || 'Индивидуальный предприниматель'
}

/** Шапка унифицированной кадровой формы: № формы + Код по ОКУД + по ОКПО. */
function KadrHead({ org, formNo, okud }: { org: Org; formNo: string; okud: string }) {
  const cap = 'px-2 py-0.5 border border-slate-400'
  return (
    <div className="flex items-start justify-between">
      <div className="text-[10px] text-slate-500">
        Унифицированная форма № {formNo}
        <br />
        Утв. постановлением Госкомстата России от 05.01.2004 № 1
      </div>
      <table className="border-collapse text-[11px]">
        <tbody>
          <tr>
            <td className={`${cap} text-slate-500`}></td>
            <td className={`${cap} text-center text-slate-500`}>Код</td>
          </tr>
          <tr>
            <td className={cap}>Форма по ОКУД</td>
            <td className={`${cap} tnum text-center`}>{okud}</td>
          </tr>
          <tr>
            <td className={cap}>по ОКПО</td>
            <td className={`${cap} tnum text-center`}>{org.okpo || '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
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

/** Личная карточка работника — унифицированная форма Т-2 (ОКУД 0301002). */
export function PersonalCardDoc({ org, employee: e }: { org: Org; employee: Employee }) {
  const stazh = e.hireDate ? formatStazh(computeStazh(e.hireDate, undefined, e.stazhPriorMonths)) : `${e.stazhYears} лет`
  return (
    <div>
      <KadrHead org={org} formNo="Т-2" okud="0301002" />
      <div className="mt-1 font-medium">{employer(org)}{org.inn && `, ИНН ${org.inn}`}</div>
      <div className="text-[10px] text-slate-400">(наименование организации)</div>
      <div className="mt-3 text-center text-base font-semibold">ЛИЧНАЯ КАРТОЧКА РАБОТНИКА</div>
      <table className="mt-4 w-full text-[13px]">
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

/** Приказ (распоряжение) о приёме работника на работу — унифицированная форма Т-1 (ОКУД 0301001). */
export function HireOrderDoc({ org, employee: e }: { org: Org; employee: Employee }) {
  return (
    <div className="text-[12.5px]">
      <KadrHead org={org} formNo="Т-1" okud="0301001" />
      <div className="mt-1 font-medium">{employer(org)}{org.inn && `, ИНН ${org.inn}`}</div>
      <div className="text-[10px] text-slate-400">(наименование организации)</div>

      <div className="mt-4 text-center">
        <div className="inline-flex gap-8 text-[11px] text-slate-500">
          <span>Номер документа</span>
          <span>Дата составления</span>
        </div>
        <div className="text-base font-semibold leading-tight">
          ПРИКАЗ (распоряжение)
          <br />
          о приёме работника на работу
        </div>
      </div>

      <div className="mt-5 space-y-1">
        <div>Принять на работу с {dateRu(e.hireDate)} по «__» __________ 20__ г. (бессрочно)</div>
        <div className="mt-2">
          <span className="font-medium">{e.fio || '________________________'}</span>
        </div>
        <div className="text-[10px] text-slate-400">(фамилия, имя, отчество) / Табельный номер</div>
        <div className="mt-1">{e.position || '________________________'}</div>
        <div className="text-[10px] text-slate-400">(должность (специальность, профессия))</div>
        <div className="mt-1">
          Условия приёма на работу, характер работы: постоянно, полная занятость.
        </div>
        <div className="mt-1">
          с тарифной ставкой (окладом) <span className="font-medium">{r0(e.salary)}</span> в месяц,
          надбавка —.
        </div>
        <div className="mt-1">с испытанием на срок —.</div>
      </div>

      <div className="mt-8">
        <div className="flex items-end gap-2">
          <span>Руководитель организации: ИП</span>
          {org.signature ? (
            <img src={org.signature} alt="Подпись" className="h-8 object-contain" />
          ) : (
            <span>______________</span>
          )}
          <span>/ {employer(org)}</span>
        </div>
        <div className="text-[10px] text-slate-400">(должность) (личная подпись) (расшифровка подписи)</div>
        <div className="mt-4">
          С приказом (распоряжением) работник ознакомлен ______________ {dateRu(e.hireDate)}
        </div>
        <div className="text-[10px] text-slate-400">(личная подпись)</div>
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

/** Расчётный листок (листок выдачи зарплаты) — начисления и выплаты за месяц. */
export function PayslipDoc({ org, employee: e }: { org: Org; employee: Employee }) {
  let calc: ReturnType<typeof calcSalary> | null = null
  try {
    calc = calcSalary(org.year, e.salary, employeeSalaryOptions(e))
  } catch {
    calc = null
  }
  const m = calc?.months[0]
  const hasAdv = (e.advancePercent ?? 0) > 0

  // Начисления по событиям: отпускные (regular) и больничные — отдельными строками.
  const year = org.year
  const vacBase = vacationBase12m(e.earningsByYear, year) || e.salary * 12
  const vacLines = (e.vacations ?? [])
    .filter((vv) => vv.type === 'regular')
    .map((vv) => {
      const d = periodDays(vv.from, vv.to)
      if (d <= 0) return null
      try {
        return { from: vv.from, to: vv.to, days: d, gross: calcVacation(year, vacBase, d).gross.toNumber() }
      } catch {
        return null
      }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
  const { e1, e2 } = sickBases(e.earningsByYear, year)
  const stazh = stazhYearsFromHire(e.hireDate) ?? e.stazhYears ?? 0
  const daysInMonthOf = (iso: string) => {
    const [yy, mm] = iso.split('-').map(Number)
    return yy && mm ? new Date(yy, mm, 0).getDate() : 31
  }
  const sickLines = (e.sickLeaves ?? [])
    .map((s) => {
      const d = periodDays(s.from, s.to)
      if (d <= 0) return null
      try {
        const rr = calcSickLeave(year, e1, e2, stazh, d, 3, daysInMonthOf(s.from))
        return {
          from: s.from,
          to: s.to,
          days: d,
          total: rr.total.toNumber(),
          emp: rr.employer_part.toNumber(),
          sfr: rr.sfr_part.toNumber(),
        }
      } catch {
        return null
      }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
  const hasEvents = vacLines.length > 0 || sickLines.length > 0
  const eventsTotal =
    vacLines.reduce((s, x) => s + x.gross, 0) + sickLines.reduce((s, x) => s + x.total, 0)

  return (
    <div>
      <div className="text-center text-base font-semibold">Расчётный листок</div>
      <div className="mt-1 text-center text-xs text-slate-500">
        {employer(org)}{org.inn && `, ИНН ${org.inn}`} · {e.fio || '—'} · за месяц ({org.year})
      </div>
      {!m ? (
        <p className="mt-5 text-sm text-slate-500">Укажите оклад сотрудника.</p>
      ) : (
        <table className="mt-5 w-full text-[13px]">
          <tbody>
            <tr className="border-b border-slate-300 font-semibold">
              <td className="py-1.5">Начислено</td>
              <td className="tnum py-1.5 text-right">{r0(m.gross.toNumber())}</td>
            </tr>
            <Field label="Оклад" value={r0(m.gross.toNumber())} />
            <tr className="border-b border-slate-300 font-semibold">
              <td className="py-1.5">Удержано</td>
              <td className="tnum py-1.5 text-right">{r0(m.ndfl.toNumber())}</td>
            </tr>
            <Field label="НДФЛ (13%/прогрессия)" value={r0(m.ndfl.toNumber())} />
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-2">К выплате на руки</td>
              <td className="tnum py-2 text-right">{r0(m.net.toNumber())}</td>
            </tr>
            {hasAdv && (
              <>
                <tr className="border-b border-slate-200">
                  <td className="py-1.5 pl-4 text-slate-500">— аванс ({e.advanceDay ?? 25} числа)</td>
                  <td className="tnum py-1.5 text-right">{r0(m.advance_net.toNumber())}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-1.5 pl-4 text-slate-500">— зарплата ({e.salaryDay ?? 10} числа)</td>
                  <td className="tnum py-1.5 text-right">{r0(m.settlement_net.toNumber())}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      )}
      {hasEvents && (
        <table className="mt-4 w-full text-[13px]">
          <tbody>
            <tr className="border-b border-slate-300 font-semibold">
              <td className="py-1.5">Начисления за период (отпуск, больничный)</td>
              <td className="tnum py-1.5 text-right">{r0(eventsTotal)}</td>
            </tr>
            {vacLines.map((x, i) => (
              <tr key={'v' + i} className="border-b border-slate-200">
                <td className="py-1.5 pl-4 text-slate-600">
                  Отпускные — {x.days} дн. ({formatDate(x.from)}–{formatDate(x.to)})
                </td>
                <td className="tnum py-1.5 text-right">{r0(x.gross)}</td>
              </tr>
            ))}
            {sickLines.map((x, i) => (
              <tr key={'s' + i} className="border-b border-slate-200 align-top">
                <td className="py-1.5 pl-4 text-slate-600">
                  Больничный — {x.days} дн. ({formatDate(x.from)}–{formatDate(x.to)})
                  <div className="text-[11px] text-slate-400">
                    в т.ч. за счёт работодателя {r0(x.emp)}, СФР {r0(x.sfr)}
                  </div>
                </td>
                <td className="tnum py-1.5 text-right">{r0(x.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {m && (
        <p className="mt-3 text-[12px] text-slate-500">
          Справочно: страховые взносы работодателя {r0(m.vznosy.toNumber())} + травматизм{' '}
          {r0(m.travmatizm.toNumber())} (с работника не удерживаются).
          {!hasEvents &&
            ' Отпускные и больничные появятся отдельными строками при наличии таких событий у сотрудника.'}
        </p>
      )}
      <div className="mt-8 text-[13px]">
        Выдал: ______________ / {employer(org)}
        <div className="mt-4">Получил: ______________ / {e.fio || '________'}</div>
      </div>
      <DocFooter />
    </div>
  )
}

const VAC_TYPE_TEXT: Record<VacationType, string> = {
  regular: 'ежегодный оплачиваемый отпуск',
  childcare: 'отпуск по уходу за ребёнком',
  unpaid: 'отпуск без сохранения заработной платы',
}

/** Приказ о предоставлении отпуска работнику — унифицированная форма Т-6 (ОКУД 0301005). */
export function VacationOrderDoc({
  org,
  employee: e,
  vacation: v,
}: {
  org: Org
  employee: Employee
  vacation: VacationEvent
}) {
  const days = periodDays(v.from, v.to)
  const isRegular = v.type === 'regular'
  const cap = 'px-2 py-0.5 border border-slate-400'
  return (
    <div className="text-[12.5px]">
      <div className="flex items-start justify-between">
        <div className="text-[10px] text-slate-500">
          Унифицированная форма № Т-6
          <br />
          Утв. постановлением Госкомстата России от 05.01.2004 № 1
        </div>
        <table className="border-collapse text-[11px]">
          <tbody>
            <tr>
              <td className={`${cap} text-slate-500`}></td>
              <td className={`${cap} text-center text-slate-500`}>Код</td>
            </tr>
            <tr>
              <td className={cap}>Форма по ОКУД</td>
              <td className={`${cap} tnum text-center`}>0301005</td>
            </tr>
            <tr>
              <td className={cap}>по ОКПО</td>
              <td className={`${cap} tnum text-center`}>{org.okpo || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-1 font-medium">
        {employer(org)}
        {org.inn && `, ИНН ${org.inn}`}
      </div>
      <div className="text-[10px] text-slate-400">(наименование организации)</div>

      <div className="mt-4 text-center">
        <div className="inline-flex gap-8 text-[11px] text-slate-500">
          <span>Номер документа</span>
          <span>Дата составления</span>
        </div>
        <div className="text-base font-semibold leading-tight">
          ПРИКАЗ (распоряжение)
          <br />
          о предоставлении отпуска работнику
        </div>
      </div>

      <div className="mt-5 space-y-1">
        <div>
          Предоставить отпуск <span className="font-medium">{e.fio || '________________________'}</span>
        </div>
        <div className="text-[10px] text-slate-400">(фамилия, имя, отчество)</div>
        <div className="mt-1">{e.position || '________________________'}</div>
        <div className="text-[10px] text-slate-400">(должность (специальность, профессия))</div>
        <div className="mt-1">за период работы с «__» __________ 20__ г. по «__» __________ 20__ г.</div>
      </div>

      <div className="mt-4 space-y-2">
        <div>
          <span className="font-medium">А.</span> ежегодный основной оплачиваемый отпуск на{' '}
          <span className="font-medium">{isRegular ? days : '____'}</span> календарных дней
          {isRegular && (
            <>
              {' '}с {dateRu(v.from)} по {dateRu(v.to)}
            </>
          )}
        </div>
        <div>
          <span className="font-medium">Б.</span>{' '}
          {!isRegular ? VAC_TYPE_TEXT[v.type] : 'ежегодный дополнительный, учебный, без сохранения зарплаты и др.'}{' '}
          на <span className="font-medium">{!isRegular ? days : '____'}</span> календарных дней
          {!isRegular && (
            <>
              {' '}с {dateRu(v.from)} по {dateRu(v.to)}
            </>
          )}
        </div>
        <div>
          <span className="font-medium">В.</span> Всего отпуск на{' '}
          <span className="font-medium">{days}</span> календарных дней с {dateRu(v.from)} по{' '}
          {dateRu(v.to)}
        </div>
      </div>

      <div className="mt-8 text-[12.5px]">
        <div className="flex items-end gap-2">
          <span>Руководитель организации: ИП</span>
          {org.signature ? (
            <img src={org.signature} alt="Подпись" className="h-8 object-contain" />
          ) : (
            <span>______________</span>
          )}
          <span>/ {employer(org)}</span>
        </div>
        <div className="text-[10px] text-slate-400">(должность) (личная подпись) (расшифровка подписи)</div>
        <div className="mt-4">
          С приказом (распоряжением) работник ознакомлен ______________ {dateRu(today())}
        </div>
        <div className="text-[10px] text-slate-400">(личная подпись)</div>
      </div>
      <DocFooter />
    </div>
  )
}

/** График отпусков на год — унифицированная форма Т-7 (ОКУД 0301020), по всем сотрудникам. */
export function VacationScheduleDoc({
  org,
  employees,
  year,
}: {
  org: Org
  employees: Employee[]
  year: number
}) {
  const rows: { dept: string; position: string; fio: string; days: number; from: string; to: string }[] = []
  for (const e of employees) {
    for (const v of e.vacations ?? []) {
      const d = periodDays(v.from, v.to)
      if (d <= 0) continue
      rows.push({ dept: '—', position: e.position || '—', fio: e.fio || '—', days: d, from: v.from, to: v.to })
    }
  }
  const th = 'border border-slate-400 px-1.5 py-1 font-semibold align-bottom'
  const td = 'border border-slate-400 px-1.5 py-1 align-top'
  return (
    <div className="text-[11px]">
      <div className="flex items-start justify-between">
        <div className="text-[10px] text-slate-500">
          Унифицированная форма № Т-7
          <br />
          Утв. постановлением Госкомстата России от 05.01.2004 № 1
        </div>
        <div className="text-[10px] text-slate-500">
          Форма по ОКУД <span className="tnum">0301020</span>
          <br />
          по ОКПО <span className="tnum">{org.okpo || '—'}</span>
        </div>
      </div>
      <div className="mt-2 text-center text-base font-semibold">ГРАФИК ОТПУСКОВ на {year} год</div>
      <div className="mt-0.5 text-center font-medium">
        {employer(org)}
        {org.inn && `, ИНН ${org.inn}`}
      </div>
      <div className="text-center text-[10px] text-slate-400">(наименование организации)</div>

      <table className="mt-4 w-full border-collapse text-[10.5px]">
        <thead>
          <tr>
            <th className={th} rowSpan={2}>Структурное подразделение</th>
            <th className={th} rowSpan={2}>Должность (специальность, профессия)</th>
            <th className={th} rowSpan={2}>Фамилия, имя, отчество</th>
            <th className={th} colSpan={3}>Отпуск</th>
            <th className={th} colSpan={2}>Перенесение отпуска</th>
            <th className={th} rowSpan={2}>Приме­чание</th>
          </tr>
          <tr>
            <th className={th}>кол-во кал. дней</th>
            <th className={th}>дата запланированная</th>
            <th className={th}>дата фактическая</th>
            <th className={th}>основание (документ)</th>
            <th className={th}>дата предполаг. отпуска</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={`${td} text-center text-slate-500`} colSpan={9}>
                Нет запланированных отпусков. Добавьте отпуска сотрудникам во вкладке «Отпуск».
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                <td className={td}>{r.dept}</td>
                <td className={td}>{r.position}</td>
                <td className={td}>{r.fio}</td>
                <td className={`${td} tnum text-center`}>{r.days}</td>
                <td className={`${td} tnum`}>
                  {formatDate(r.from)}–{formatDate(r.to)}
                </td>
                <td className={td}></td>
                <td className={td}></td>
                <td className={td}></td>
                <td className={td}></td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-6 flex items-end gap-2 text-[12px]">
        <span>Индивидуальный предприниматель: ИП</span>
        {org.signature ? (
          <img src={org.signature} alt="Подпись" className="h-8 object-contain" />
        ) : (
          <span>______________</span>
        )}
        <span>/ {employer(org)}</span>
      </div>
      <div className="text-[10px] text-slate-400">(личная подпись) (расшифровка подписи)</div>
      <DocFooter />
    </div>
  )
}

export type EmployeeDocType = 'card' | 'hireOrder' | 'incomeCert' | 'deductionApp' | 'payslip'

export const EMPLOYEE_DOC_TITLE: Record<EmployeeDocType, string> = {
  card: 'Личная карточка',
  hireOrder: 'Приказ о приёме',
  incomeCert: 'Справка о доходах (НДФЛ)',
  deductionApp: 'Заявление на вычет',
  payslip: 'Расчётный листок',
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
  if (type === 'payslip') return <PayslipDoc org={org} employee={employee} />
  return <DeductionApplicationDoc org={org} employee={employee} />
}
