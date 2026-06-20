import { payrollSummary } from '../lib/payrollSummary'
import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import type { Employee } from '../state/employeesStore'
import { Cells, FormKndHeader, FormField, SignBlock, OfficialNote, OfficialTop } from './officialForm'

const digits = (s?: string) => (s ? s.replace(/\D/g, '') : '')

export type ReportType = '6ndfl' | 'rsv' | 'efs1' | 'perssved'

export const REPORT_TITLE: Record<ReportType, string> = {
  '6ndfl': 'Расчёт сумм НДФЛ (6-НДФЛ)',
  rsv: 'Расчёт по страховым взносам (РСВ)',
  efs1: 'Сведения ЕФС-1',
  perssved: 'Персонифицированные сведения о физических лицах',
}

const r2 = (n: number) => formatRub(Math.round(n))

/** Общий титульный блок отчёта (корректировка/период/год/налоговый орган/налогоплательщик). */
function RepTitul({ org, noTaxOffice }: { org: Org; noTaxOffice?: boolean }) {
  return (
    <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
      <FormField label="Номер корректировки">
        <Cells value="0" count={3} />
      </FormField>
      <FormField label="Расчётный (отчётный) период (код)">
        <Cells count={2} />
      </FormField>
      <FormField label="Календарный год">
        <Cells value={String(org.year)} count={4} />
      </FormField>
      {!noTaxOffice && (
        <FormField label="Представляется в налоговый орган (код)">
          <Cells value={org.taxOfficeCode} count={4} />
        </FormField>
      )}
      <FormField label="Налогоплательщик">
        <span className="text-[12px]">{org.fio || org.name || '—'}</span>
      </FormField>
      <FormField label="ОКВЭД">
        <span className="text-[12px]">{org.okved || '—'}</span>
      </FormField>
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
  // Единый источник агрегации (тот же, что «Сводка по штату» и ведомость) — без дублирования.
  const { rows, totals, count } = payrollSummary(org, employees)
  const n = count

  if (type === '6ndfl') {
    return (
      <div>
        <FormKndHeader
          knd="1151100"
          title="Расчёт сумм налога на доходы физических лиц, исчисленных и удержанных налоговым агентом (6-НДФЛ)"
          inn={org.inn}
        />
        <RepTitul org={org} />
        <div className="mt-5 mb-2 text-[12px] font-semibold">
          Раздел 2. Расчёт исчисленных, удержанных сумм НДФЛ (за год)
        </div>
        <table className="w-full text-[13px]">
          <tbody>
            <L code="120" label="Количество физических лиц, получивших доход" value={String(n)} />
            <L code="110" label="Сумма начисленного дохода" value={r2(totals.grossYear)} />
            <L code="140" label="Сумма исчисленного налога" value={r2(totals.ndflYear)} />
            <L code="160" label="Сумма удержанного налога" value={r2(totals.ndflYear)} />
          </tbody>
        </table>
        <SignBlock name={org.fio || org.name} />
        <OfficialNote extra="6-НДФЛ подаётся ежеквартально нарастающим итогом." />
      </div>
    )
  }

  if (type === 'rsv') {
    const base = totals.grossYear
    return (
      <div>
        <FormKndHeader knd="1151111" title="Расчёт по страховым взносам (РСВ)" inn={org.inn} />
        <RepTitul org={org} />
        <div className="mt-5 mb-2 text-[12px] font-semibold">
          Раздел 1. Сводные данные об обязательствах плательщика (за год)
        </div>
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
        <SignBlock name={org.fio || org.name} />
        <OfficialNote extra="РСВ подаётся ежеквартально нарастающим итогом." />
      </div>
    )
  }

  if (type === 'efs1') {
    return (
      <div>
        <FormKndHeader
          title="Единая форма сведений (ЕФС-1)"
          subtitle="Представляется в Социальный фонд России (СФР)"
          inn={org.inn}
        />
        <RepTitul org={org} noTaxOffice />
        <div className="mt-5 mb-2 text-[12px] font-semibold">
          Подраздел 1.1. Сведения о трудовой (иной) деятельности
        </div>
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
        <div className="mt-4 mb-2 text-[12px] font-semibold">
          Раздел 2. Сведения о взносах на травматизм (за год)
        </div>
        <table className="w-full text-[13px]">
          <tbody>
            <L code="—" label="Сумма взносов на страхование от несчастных случаев" value={r2(totals.travmYear)} />
          </tbody>
        </table>
        <SignBlock name={org.fio || org.name} />
        <OfficialNote extra="ЕФС-1 представляется в СФР (бывшие СЗВ-ТД, 4-ФСС, СЗВ-СТАЖ)." />
      </div>
    )
  }

  // perssved — официальный бланк КНД 1151162 (точь-в-точь, 2 страницы)
  const cellCls =
    'inline-flex h-5 w-[13px] items-center justify-center border border-slate-400 text-[11px] leading-none'
  const lbl = 'text-[11px] text-slate-600'
  const code = (c: string) => <span className="font-mono text-[10px] text-slate-400">{c}</span>
  const fioOf = (s: string) => (s || '').trim().split(/\s+/)
  const FioRow = ({ s, len = 22 }: { s: string; len?: number }) => (
    <div className="flex flex-wrap gap-[2px]">
      {Array.from({ length: len }, (_, i) => (
        <span key={i} className={cellCls}>
          {s[i] ?? ''}
        </span>
      ))}
    </div>
  )
  const Snils = ({ s }: { s: string }) => {
    const d = digits(s).padEnd(11, ' ')
    return (
      <span className="inline-flex items-center gap-[3px]">
        <Cells value={d.slice(0, 3)} count={3} />—<Cells value={d.slice(3, 6)} count={3} />—
        <Cells value={d.slice(6, 9)} count={3} /> <Cells value={d.slice(9, 11)} count={2} />
      </span>
    )
  }
  const SumCells = ({ amount }: { amount: number }) => {
    const rub = String(Math.trunc(amount)).padStart(13, ' ')
    const kop = String(Math.round((amount - Math.trunc(amount)) * 100)).padStart(2, '0')
    return (
      <span className="inline-flex items-center gap-1">
        <Cells value={rub} count={13} />
        <span className="font-semibold">.</span>
        <Cells value={kop} count={2} />
      </span>
    )
  }
  const ipFio = fioOf(org.fio)
  const pages = 1 + Math.max(1, Math.ceil(n / 4))

  return (
    <div className="text-[12px]">
      {/* ───────── Стр. 001 — титульный ───────── */}
      <OfficialTop code="2970 1018" inn={org.inn} kpp="" page="001" />
      <div className="text-[10px] text-slate-500">Форма по КНД 1151162</div>
      <div className="mt-1 text-center text-sm font-semibold">
        Персонифицированные сведения о физических лицах
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={lbl}>Номер корректировки</span>
          <Cells value="0--" count={3} />
          <span className={`${lbl} ml-3`}>Период (код)</span>
          <Cells count={2} />
          <span className={`${lbl} ml-3`}>Календарный год</span>
          <Cells value={String(org.year)} count={4} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={lbl}>Представляется в налоговый орган (код)</span>
          <Cells value={org.taxOfficeCode} count={4} />
          <span className={`${lbl} ml-3`}>По месту нахождения (учёта) (код)</span>
          <Cells value="120" count={3} />
        </div>
        <FioRow s={ipFio[0] || ''} />
        <FioRow s={ipFio[1] || ''} />
        <FioRow s={ipFio[2] || ''} />
        <div className="text-[9px] text-slate-400">
          (фамилия, имя, отчество индивидуального предпринимателя)
        </div>
        <div className="flex items-center gap-2">
          <span className={lbl}>ОГРНИП</span>
          <Cells value={org.ogrnip} count={15} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={lbl}>Сведения составлены на</span>
          <Cells value={String(pages).padStart(3, '0')} count={3} />
          <span className={lbl}>страницах</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded border border-slate-300 p-2">
          <div className="flex gap-2">
            <span className={cellCls}>1</span>
            <div className="text-[10px] leading-tight text-slate-600">
              Достоверность и полноту сведений подтверждаю: 1 — плательщик страховых взносов; 2 —
              представитель
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <FioRow s={ipFio[0] || ''} />
            <FioRow s={ipFio[1] || ''} />
            <FioRow s={ipFio[2] || ''} />
            <div className="text-[9px] text-slate-400">(фамилия, имя, отчество полностью)</div>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className={lbl}>Подпись _________</span>
            <span className="flex items-center gap-1">
              <span className={lbl}>Дата</span>
              <Cells count={2} />.<Cells count={2} />.<Cells count={4} />
            </span>
          </div>
        </div>
        <div className="rounded border border-slate-300 p-2 text-[10px] text-slate-500">
          <div className="text-center font-semibold text-slate-600">
            Заполняется работником налогового органа
          </div>
          <div className="mt-2 flex items-center gap-1">
            Представлено (код) <Cells count={3} />
          </div>
          <div className="mt-2 flex items-center gap-1">
            на <Cells count={3} /> страницах
          </div>
          <div className="mt-2 flex items-center gap-1">
            Дата <Cells count={2} />.<Cells count={2} />.<Cells count={4} />
          </div>
          <div className="mt-6 flex justify-between">
            <span>Фамилия, И.О.</span>
            <span>Подпись</span>
          </div>
        </div>
      </div>

      {/* ───────── Стр. 002 — данные ───────── */}
      <div className="mt-6 border-t-2 border-dashed border-slate-300 pt-4">
        <OfficialTop code="2970 1025" inn={org.inn} kpp="" page="002" />
        <div className="mb-2 text-center text-sm font-semibold leading-snug">
          Персональные данные физических лиц и сведения о суммах
          <br />
          выплат и иных вознаграждений в их пользу
        </div>
        {n === 0 ? (
          <div className="rounded border border-slate-300 p-3 text-[11px] text-slate-500">
            Сотрудников нет — данные не заполняются. Добавьте сотрудников в разделе «Сотрудники».
          </div>
        ) : (
          <div className="space-y-0">
            {rows.map((a) => {
              const f = fioOf(a.e.fio)
              return (
                <div key={a.e.id} className="border-b-2 border-slate-300 py-2">
                  <div className="flex items-center gap-2">
                    <span className={lbl}>Признак аннулирования сведений о физическом лице</span>
                    {code('010')}
                    <Cells count={1} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="flex items-center gap-1">
                      <span className={lbl}>ИНН</span>
                      {code('020')}
                      <Cells value={a.e.inn} count={12} />
                    </span>
                    <span className="flex items-center gap-1">
                      <span className={lbl}>СНИЛС</span>
                      {code('030')}
                      <Snils s={a.e.snils || ''} />
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`${lbl} w-16`}>Фамилия</span>
                    {code('040')}
                    <FioRow s={f[0] || ''} />
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`${lbl} w-16`}>Имя</span>
                    {code('050')}
                    <FioRow s={f[1] || ''} />
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`${lbl} w-16`}>Отчество</span>
                    {code('060')}
                    <FioRow s={f[2] || ''} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={lbl}>
                      Сумма выплат и иных вознаграждений, начисленных в пользу физического лица
                    </span>
                    {code('070')}
                    <SumCells amount={a.grossMonth} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <OfficialNote extra="Персонифицированные сведения подаются ежемесячно до 25 числа следующего месяца." />
    </div>
  )
}

