import { calcSalary } from '../lib/taxcore'
import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import type { Employee } from '../state/employeesStore'

export type ReportType = '6ndfl' | 'rsv' | 'efs1' | 'perssved'

export const REPORT_TITLE: Record<ReportType, string> = {
  '6ndfl': 'Расчёт сумм НДФЛ (6-НДФЛ)',
  rsv: 'Расчёт по страховым взносам (РСВ)',
  efs1: 'Сведения ЕФС-1',
  perssved: 'Персонифицированные сведения о физических лицах',
}

const r2 = (n: number) => formatRub(Math.round(n))

interface Agg {
  e: Employee
  grossYear: number
  ndflYear: number
  vznosyYear: number
  travmYear: number
  grossMonth: number
  ndflMonth: number
}

function aggregate(org: Org, employees: Employee[]): { rows: Agg[]; totals: Omit<Agg, 'e'> } {
  const rows: Agg[] = employees.map((e) => {
    let grossYear = 0,
      ndflYear = 0,
      vznosyYear = 0,
      travmYear = 0,
      grossMonth = 0,
      ndflMonth = 0
    try {
      const c = calcSalary(org.year, e.salary, { children: e.children, msp: e.msp })
      grossYear = c.gross_year.toNumber()
      ndflYear = c.ndfl_year.toNumber()
      vznosyYear = c.vznosy_year.toNumber()
      travmYear = c.travmatizm_year.toNumber()
      grossMonth = c.months[0]?.gross.toNumber() ?? 0
      ndflMonth = c.months[0]?.ndfl.toNumber() ?? 0
    } catch {
      /* пропускаем сотрудника с некорректными данными */
    }
    return { e, grossYear, ndflYear, vznosyYear, travmYear, grossMonth, ndflMonth }
  })
  const sum = (f: (a: Agg) => number) => rows.reduce((s, a) => s + f(a), 0)
  return {
    rows,
    totals: {
      grossYear: sum((a) => a.grossYear),
      ndflYear: sum((a) => a.ndflYear),
      vznosyYear: sum((a) => a.vznosyYear),
      travmYear: sum((a) => a.travmYear),
      grossMonth: sum((a) => a.grossMonth),
      ndflMonth: sum((a) => a.ndflMonth),
    },
  }
}

function Head({ org, title, knd }: { org: Org; title: string; knd?: string }) {
  return (
    <div className="text-center">
      <div className="text-base font-semibold">{title}</div>
      {knd && <div className="mt-1 text-xs text-slate-500">Форма по КНД {knd}</div>}
      <div className="mt-2 text-[13px] text-slate-600">
        {org.fio || org.name || '—'}
        {org.inn && `, ИНН ${org.inn}`} · период {org.year}
      </div>
    </div>
  )
}

function L({ code, label, value }: { code: string; label: string; value: string }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="w-16 py-1.5 align-top font-mono text-xs text-slate-500">{code}</td>
      <td className="py-1.5 pr-3 align-top">{label}</td>
      <td className="tnum w-40 py-1.5 text-right align-top font-medium">{value}</td>
    </tr>
  )
}

/** Печатная форма отчёта за сотрудников (демо, заполнено из штата). */
export function PayrollReportDoc({
  org,
  employees,
  type,
}: {
  org: Org
  employees: Employee[]
  type: ReportType
}) {
  const { rows, totals } = aggregate(org, employees)
  const n = employees.length

  if (type === '6ndfl') {
    return (
      <div>
        <Head org={org} title="Расчёт сумм налога на доходы физических лиц (6-НДФЛ)" knd="1151100" />
        <div className="mt-5 mb-2 font-semibold">Раздел 2. Обобщённые показатели (за год)</div>
        <table className="w-full text-[13px]">
          <tbody>
            <L code="120" label="Количество физических лиц, получивших доход" value={String(n)} />
            <L code="110" label="Сумма начисленного дохода" value={r2(totals.grossYear)} />
            <L code="140" label="Сумма исчисленного налога" value={r2(totals.ndflYear)} />
            <L code="160" label="Сумма удержанного налога" value={r2(totals.ndflYear)} />
          </tbody>
        </table>
        <Note2 />
      </div>
    )
  }

  if (type === 'rsv') {
    const base = totals.grossYear
    return (
      <div>
        <Head org={org} title="Расчёт по страховым взносам (РСВ)" knd="1151111" />
        <div className="mt-5 mb-2 font-semibold">Сводные данные по взносам (за год)</div>
        <table className="w-full text-[13px]">
          <tbody>
            <L code="010" label="Количество застрахованных лиц" value={String(n)} />
            <L code="030" label="Сумма выплат в пользу физических лиц" value={r2(base)} />
            <L code="050" label="База для исчисления страховых взносов" value={r2(base)} />
            <L code="060" label="Исчислено страховых взносов (ОПС+ОМС+ВНиМ)" value={r2(totals.vznosyYear)} />
          </tbody>
        </table>
        <p className="mt-3 text-[12px] text-slate-600">
          Единый тариф 30% до предельной базы и 15,1% сверх; для МСП — 15% с части выплаты свыше
          1,5 МРОТ. Взносы на травматизм отражаются в ЕФС-1 (раздел 2).
        </p>
        <Note2 />
      </div>
    )
  }

  if (type === 'efs1') {
    return (
      <div>
        <Head org={org} title="Единая форма сведений (ЕФС-1)" knd="1151162" />
        <div className="mt-5 mb-2 font-semibold">Подраздел 1.1. Сведения о трудовой деятельности</div>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-y border-slate-300 text-left">
              <th className="py-1.5 pr-2 font-semibold">№</th>
              <th className="py-1.5 pr-2 font-semibold">ФИО</th>
              <th className="py-1.5 pr-2 font-semibold">Должность</th>
              <th className="py-1.5 font-semibold">Дата приёма</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.e.id} className="border-b border-slate-200">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="py-1.5 pr-2">{a.e.fio || '—'}</td>
                <td className="py-1.5 pr-2">{a.e.position || '—'}</td>
                <td className="tnum py-1.5">{a.e.hireDate ? formatDate(a.e.hireDate) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 mb-2 font-semibold">Раздел 2. Взносы на травматизм (за год)</div>
        <table className="w-full text-[13px]">
          <tbody>
            <L code="—" label="Сумма взносов на травматизм" value={r2(totals.travmYear)} />
          </tbody>
        </table>
        <Note2 />
      </div>
    )
  }

  // perssved
  return (
    <div>
      <Head org={org} title="Персонифицированные сведения о физических лицах" knd="1151162" />
      <div className="mt-5 mb-2 font-semibold">Сведения о выплатах (за месяц)</div>
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-y border-slate-300 text-left">
            <th className="py-1.5 pr-2 font-semibold">№</th>
            <th className="py-1.5 pr-2 font-semibold">ФИО</th>
            <th className="py-1.5 pr-2 font-semibold">Должность</th>
            <th className="py-1.5 text-right font-semibold">Выплаты за месяц, ₽</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a, i) => (
            <tr key={a.e.id} className="border-b border-slate-200">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2">{a.e.fio || '—'}</td>
              <td className="py-1.5 pr-2">{a.e.position || '—'}</td>
              <td className="tnum py-1.5 text-right">{r2(a.grossMonth)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-300 font-semibold">
            <td className="py-1.5 pr-2" colSpan={3}>
              Итого
            </td>
            <td className="tnum py-1.5 text-right">{r2(totals.grossMonth)}</td>
          </tr>
        </tbody>
      </table>
      <Note2 />
    </div>
  )
}

function Note2() {
  return (
    <div className="mt-6 text-[11px] text-slate-400">
      Предпросмотр (демо). Форма заполнена автоматически из штата сотрудников по выверенным
      параметрам года. Перед подачей сверьте с бухгалтером и официальной формой ФНС.
    </div>
  )
}
