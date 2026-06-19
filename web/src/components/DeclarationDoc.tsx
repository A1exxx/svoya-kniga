import { formatDate } from '../lib/format'
import type { Org } from '../state/orgStore'
import type { Computed } from '../lib/compute'
import { Cells, OfficialTop, OfficialNote } from './officialForm'

const numOf = (d: number | { toNumber: () => number } | null | undefined): number | null =>
  d == null ? null : typeof d === 'number' ? d : d.toNumber()

/** Денежная строка официального бланка: код строки + наименование + значение в клетках.
 *  Суммы в декларации УСН — в ПОЛНЫХ РУБЛЯХ (без копеек). */
function NumLine({
  code,
  label,
  value,
  cells = 13,
  raw,
}: {
  code: string
  label: string
  value?: number | { toNumber: () => number } | null
  cells?: number
  raw?: string // нечисловое значение (ставка, признак) — как есть
}) {
  const n = numOf(value)
  const digits = raw != null ? raw : n == null ? '' : String(Math.round(n))
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 py-[3px]">
      <span className="w-12 shrink-0 text-center font-mono text-[10px] text-slate-500">{code}</span>
      <span className="flex-1 text-[11px] leading-tight">{label}</span>
      <Cells value={digits.padStart(cells, ' ')} count={cells} />
    </div>
  )
}

/** Печатная декларация по УСН (КНД 1152017) — официальный клеточный бланк. */
export function DeclarationDoc({ org, computed }: { org: Org; computed: Computed }) {
  const isIncome = org.usnObject === 'income'
  const periods = computed.usn.periods
  const quarterly = periods.length === 4
  const yearP = periods[periods.length - 1]
  const ratePct = computed.usn.rate.times(100).toNumber()
  const minApplied = !isIncome && computed.usn.min_tax.gt(computed.usn.tax_year_computed)
  const yr = String(org.year)

  const annualIncome = quarterly ? computed.byQuarter.reduce((s, q) => s + q.income, 0) : org.income
  const annualExpense = quarterly
    ? computed.byQuarter.reduce((s, q) => s + q.expense, 0)
    : org.expenses

  const pv = (i: number, fn: (p: (typeof periods)[number]) => { toNumber: () => number }) =>
    periods[i] ? numOf(fn(periods[i])) : null
  const qCum = (sel: (q: { income: number; expense: number }) => number): number[] => {
    const out: number[] = []
    let s = 0
    if (quarterly) for (const q of computed.byQuarter) { s += sel(q); out.push(s) }
    return out
  }
  const incCum = qCum((q) => q.income)
  const expCum = qCum((q) => q.expense)

  const fio = (org.fio || '').trim().split(/\s+/)
  const cell =
    'inline-flex h-5 w-[13px] items-center justify-center border border-slate-400 text-[11px] leading-none'
  const lbl = 'text-[11px] text-slate-600'
  const FioRow = ({ s }: { s: string }) => (
    <div className="flex flex-wrap gap-[2px]">
      {Array.from({ length: 24 }, (_, i) => (
        <span key={i} className={cell}>
          {s[i] ?? ''}
        </span>
      ))}
    </div>
  )
  const sectionTitle = isIncome
    ? 'Раздел 2.1.1. Расчёт налога (объект «доходы»)'
    : 'Раздел 2.2. Расчёт налога (объект «доходы минус расходы»)'
  const r1Title = isIncome
    ? 'Раздел 1.1. Сумма налога (аванса) к уплате / уменьшению (объект «доходы»)'
    : 'Раздел 1.2. Сумма налога (аванса) к уплате / уменьшению (объект «доходы минус расходы»)'

  return (
    <div className="text-[12px]">
      {/* ───────── Стр. 001 — Титульный лист ───────── */}
      <OfficialTop code="1152017" inn={org.inn} kpp="" page="001" />
      <div className="text-[10px] text-slate-500">Форма по КНД 1152017</div>
      <div className="mt-1 text-center text-sm font-semibold leading-snug">
        Налоговая декларация по налогу, уплачиваемому в связи
        <br /> с применением упрощённой системы налогообложения
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={lbl}>Номер корректировки</span>
          <Cells value="0--" count={3} />
          <span className={`${lbl} ml-4`}>Налоговый период (код)</span>
          <Cells value="34" count={2} />
          <span className={`${lbl} ml-4`}>Отчётный год</span>
          <Cells value={yr} count={4} />
        </div>
        <div className="flex items-center gap-2">
          <span className={lbl}>Представляется в налоговый орган (код)</span>
          <Cells value={org.taxOfficeCode} count={4} />
          <span className={`${lbl} ml-4`}>по месту нахождения (учёта) (код)</span>
          <Cells value="120" count={3} />
        </div>
        <div className="text-[10px] text-slate-400">
          Налогоплательщик (фамилия, имя, отчество индивидуального предпринимателя):
        </div>
        <FioRow s={fio[0] || ''} />
        <FioRow s={fio[1] || ''} />
        <FioRow s={fio[2] || ''} />
        <div className="flex items-center gap-2">
          <span className={lbl}>Код вида деятельности по ОКВЭД</span>
          <Cells value={org.okved} count={8} />
          <span className={`${lbl} ml-4`}>Номер телефона</span>
          <span className="text-[11px]">{org.phone || '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={lbl}>Достоверность и полноту сведений подтверждаю</span>
          <span className={cell}>1</span>
          <span className="text-[10px] text-slate-400">1 — налогоплательщик, 2 — представитель</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className={lbl}>Подпись ____________</span>
          <span className="flex items-center gap-1">
            <span className={lbl}>Дата</span>
            <Cells count={2} />.<Cells count={2} />.<Cells count={4} />
          </span>
        </div>
      </div>

      {/* ───────── Стр. 002 — Раздел 1.1 / 1.2 ───────── */}
      <div className="mt-6 border-t-2 border-dashed border-slate-300 pt-4">
        <OfficialTop code="1152017" inn={org.inn} kpp="" page="002" />
        <div className="mb-2 text-[12px] font-semibold">{r1Title}</div>
        <NumLine code="010" label="Код по ОКТМО" raw={org.oktmo || ''} cells={11} />
        {quarterly ? (
          <>
            <NumLine code="020" label="Сумма аванса к уплате за 1 квартал" value={pv(0, (p) => p.advance_due_this_period)} />
            <NumLine code="040" label="Сумма аванса к уплате за полугодие" value={pv(1, (p) => p.advance_due_this_period)} />
            {(pv(1, (p) => p.overpayment_this_period) ?? 0) > 0 && (
              <NumLine code="050" label="Сумма аванса к уменьшению за полугодие" value={pv(1, (p) => p.overpayment_this_period)} />
            )}
            <NumLine code="070" label="Сумма аванса к уплате за 9 месяцев" value={pv(2, (p) => p.advance_due_this_period)} />
            {(pv(2, (p) => p.overpayment_this_period) ?? 0) > 0 && (
              <NumLine code="080" label="Сумма аванса к уменьшению за 9 месяцев" value={pv(2, (p) => p.overpayment_this_period)} />
            )}
            {minApplied ? (
              <NumLine code="120" label="Сумма минимального налога к уплате за год" value={computed.usn.year_payment_due} />
            ) : (
              <NumLine code="100" label="Сумма налога к доплате за год" value={computed.usn.year_payment_due} />
            )}
            {computed.usn.year_overpayment.toNumber() > 0 && (
              <NumLine code="110" label="Сумма налога к уменьшению за год" value={computed.usn.year_overpayment} />
            )}
          </>
        ) : (
          <>
            {minApplied && <NumLine code="120" label="Сумма минимального налога к уплате" value={computed.usn.year_payment_due} />}
            {!minApplied && <NumLine code="100" label="Сумма налога к уплате за налоговый период" value={computed.usn.year_payment_due} />}
            {computed.usn.year_overpayment.toNumber() > 0 && (
              <NumLine code="110" label="Сумма налога к уменьшению" value={computed.usn.year_overpayment} />
            )}
          </>
        )}
      </div>

      {/* ───────── Стр. 003 — Раздел 2.1.1 / 2.2 ───────── */}
      <div className="mt-6 border-t-2 border-dashed border-slate-300 pt-4">
        <OfficialTop code="1152017" inn={org.inn} kpp="" page="003" />
        <div className="mb-2 text-[12px] font-semibold">{sectionTitle}</div>
        {isIncome ? (
          <>
            <NumLine code="102" label="Признак налогоплательщика (1 — с работниками, 2 — без)" raw={org.hasEmployees ? '1' : '2'} cells={1} />
            <NumLine code="110" label="Сумма доходов за 1 квартал" value={pv(0, (p) => p.tax_base_cumulative)} />
            <NumLine code="111" label="Сумма доходов за полугодие" value={pv(1, (p) => p.tax_base_cumulative)} />
            <NumLine code="112" label="Сумма доходов за 9 месяцев" value={pv(2, (p) => p.tax_base_cumulative)} />
            <NumLine code="113" label="Сумма доходов за налоговый период (год)" value={quarterly ? pv(3, (p) => p.tax_base_cumulative) : yearP.tax_base_cumulative} />
            <NumLine code="120" label="Ставка налога за 1 квартал, %" raw={String(ratePct)} cells={5} />
            <NumLine code="123" label="Ставка налога за год, %" raw={String(ratePct)} cells={5} />
            <NumLine code="130" label="Сумма исчисленного налога (аванса) за 1 квартал" value={pv(0, (p) => p.tax_before_deduction_cumulative)} />
            <NumLine code="131" label="…за полугодие" value={pv(1, (p) => p.tax_before_deduction_cumulative)} />
            <NumLine code="132" label="…за 9 месяцев" value={pv(2, (p) => p.tax_before_deduction_cumulative)} />
            <NumLine code="133" label="…за налоговый период (год)" value={quarterly ? pv(3, (p) => p.tax_before_deduction_cumulative) : yearP.tax_before_deduction_cumulative} />
            <NumLine code="140" label="Взносы, уменьшающие налог, за 1 квартал" value={pv(0, (p) => p.deduction_cumulative)} />
            <NumLine code="141" label="…за полугодие" value={pv(1, (p) => p.deduction_cumulative)} />
            <NumLine code="142" label="…за 9 месяцев" value={pv(2, (p) => p.deduction_cumulative)} />
            <NumLine code="143" label="…за налоговый период (год)" value={quarterly ? pv(3, (p) => p.deduction_cumulative) : yearP.deduction_cumulative} />
          </>
        ) : (
          <>
            <NumLine code="210" label="Сумма доходов за 1 квартал" value={quarterly ? incCum[0] : null} />
            <NumLine code="211" label="Сумма доходов за полугодие" value={quarterly ? incCum[1] : null} />
            <NumLine code="212" label="Сумма доходов за 9 месяцев" value={quarterly ? incCum[2] : null} />
            <NumLine code="213" label="Сумма доходов за налоговый период (год)" value={quarterly ? incCum[3] : annualIncome} />
            <NumLine code="220" label="Сумма расходов за 1 квартал" value={quarterly ? expCum[0] : null} />
            <NumLine code="221" label="Сумма расходов за полугодие" value={quarterly ? expCum[1] : null} />
            <NumLine code="222" label="Сумма расходов за 9 месяцев" value={quarterly ? expCum[2] : null} />
            <NumLine code="223" label="Сумма расходов за налоговый период (год)" value={quarterly ? expCum[3] : annualExpense} />
            <NumLine code="240" label="Налоговая база за 1 квартал" value={pv(0, (p) => p.tax_base_cumulative)} />
            <NumLine code="243" label="Налоговая база за налоговый период (год)" value={quarterly ? pv(3, (p) => p.tax_base_cumulative) : yearP.tax_base_cumulative} />
            <NumLine code="270" label="Сумма исчисленного налога за 1 квартал" value={pv(0, (p) => p.tax_before_deduction_cumulative)} />
            <NumLine code="273" label="Сумма исчисленного налога за год" value={quarterly ? pv(3, (p) => p.tax_before_deduction_cumulative) : computed.usn.tax_year_computed} />
            <NumLine code="280" label="Сумма минимального налога (1% от доходов)" value={computed.usn.min_tax} />
          </>
        )}
      </div>

      <OfficialNote
        extra={
          quarterly
            ? 'Поквартальные суммы заполнены из операций в «Деньгах».'
            : 'Годовые показатели — из расчёта; поквартальные заполнятся при учёте операций.'
        }
      />
      <div className="mt-1 text-[10px] text-slate-400">
        Подпись: ______________ / {org.fio || org.name} · {formatDate(new Date().toISOString().slice(0, 10))}
      </div>
    </div>
  )
}
