import { payrollSummary } from '../lib/payrollSummary'
import { formatRub, formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import type { Employee } from '../state/employeesStore'
import { Cells, FormKndHeader, FormField, SignBlock, OfficialNote } from './officialForm'

/** 'YYYY-MM-DD' → 'DDMMYYYY' (для клеточного поля даты). */
const dmy = (iso?: string) => (iso ? iso.split('-').reverse().join('') : '')
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

  // perssved — официальный макет КНД 1151162
  return (
    <div>
      <FormKndHeader
        knd="1151162"
        title="Персонифицированные сведения о физических лицах"
        inn={org.inn}
      />
      <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
        <FormField label="Номер корректировки">
          <Cells value="0" count={3} />
        </FormField>
        <FormField label="Отчётный период (месяц)">
          <Cells count={2} />
        </FormField>
        <FormField label="Представляется в налоговый орган (код)">
          <Cells value={org.taxOfficeCode} count={4} />
        </FormField>
        <FormField label="Отчётный (календарный) год">
          <Cells value={String(org.year)} count={4} />
        </FormField>
        <FormField label="По месту нахождения (учёта) (код)">
          <span className="text-[12px]">120 — по месту жительства ИП</span>
        </FormField>
        <FormField label="Налогоплательщик">
          <span className="text-[12px]">{org.fio || org.name || '—'}</span>
        </FormField>
        <FormField label="Код вида деятельности по ОКВЭД">
          <span className="text-[12px]">{org.okved || '—'}</span>
        </FormField>
        <FormField label="Количество физических лиц">
          <Cells value={String(n)} count={3} />
        </FormField>
      </div>

      <div className="mt-5 mb-2 text-[12px] font-semibold">
        Сведения о физических лицах и суммах выплат
      </div>
      <div className="space-y-2">
        {rows.map((a, i) => {
          const [last = '', first = '', middle = ''] = (a.e.fio || '').trim().split(/\s+/)
          return (
            <div key={a.e.id} className="rounded border border-slate-300 p-2.5">
              <div className="mb-1 text-[11px] text-slate-400">Физическое лицо {i + 1}</div>
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <FormField label="010. ИНН в РФ">
                  <Cells count={12} />
                </FormField>
                <FormField label="020. СНИЛС">
                  <Cells value={digits(a.e.snils)} count={11} />
                </FormField>
                <FormField label="030. Фамилия">
                  <span className="text-[12px]">{last || '—'}</span>
                </FormField>
                <FormField label="040. Имя">
                  <span className="text-[12px]">{first || '—'}</span>
                </FormField>
                <FormField label="050. Отчество">
                  <span className="text-[12px]">{middle || '—'}</span>
                </FormField>
                <FormField label="060. Дата рождения">
                  <Cells value={dmy(a.e.birthDate)} count={8} />
                </FormField>
                <FormField label="070. Сумма выплат и иных вознаграждений">
                  <span className="tnum font-semibold">{formatRub(a.grossMonth, { kopecks: true })}</span>
                </FormField>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between border-t-2 border-slate-300 pt-1.5 text-[12px] font-semibold">
        <span>Итого выплат за месяц по {n} лицам</span>
        <span className="tnum">{r2(totals.grossMonth)}</span>
      </div>

      <SignBlock name={org.fio || org.name} />
      <OfficialNote extra="Персонифицированные сведения подаются ежемесячно до 25 числа." />
    </div>
  )
}

