import { formatRub } from '../lib/format'
import type { Org } from '../state/orgStore'
import type { Computed } from '../lib/compute'
import { Cells, FormKndHeader, FormField, SignBlock, OfficialNote } from './officialForm'

const v = (d: number | { toNumber: () => number } | null | undefined) =>
  formatRub(d == null ? null : typeof d === 'number' ? d : d.toNumber(), { kopecks: true })

interface ObRow {
  kbk: string
  oktmo: string
  period: string // код отчётного периода, напр. «34/01»
  year: string
  title: string
  amount: number | { toNumber: () => number } | null
}

/** Печатная форма уведомления об исчисленных суммах налогов (КНД 1110355) — официальный макет. */
export function EnsNotificationDoc({ org, computed }: { org: Org; computed: Computed }) {
  const isIncome = org.usnObject === 'income'
  const kbk = isIncome ? '18210501011011000110' : '18210501021011000110'
  const yr = String(org.year)

  // Обязательства = квартальные авансы УСН (для них и подаётся уведомление).
  const advRows: ObRow[] = computed.calendar
    .filter((e) => e.kind === 'notification' && e.title.includes('аванс'))
    .map((e, i) => ({
      kbk,
      oktmo: org.oktmo || '',
      period: ['34/01', '34/02', '34/03'][i] ?? '34',
      year: yr,
      title: e.title.replace('Уведомление об исчисленном авансе УСН за', 'Аванс УСН за'),
      amount: e.amount,
    }))

  // Уведомление подаётся ТОЛЬКО по квартальным авансам (34/01, 34/02, 34/03). По итогам года
  // уведомление не подаётся — его заменяет декларация. Если поквартальных сумм нет — пустая форма.
  const annualOnly = advRows.length === 0 || advRows.every((r) => r.amount == null)
  const rows: ObRow[] = annualOnly ? [] : advRows
  const amt = (a: ObRow['amount']) => (a == null ? '' : v(a))

  return (
    <div>
      <FormKndHeader
        knd="1110355"
        title="Уведомление об исчисленных суммах налогов, авансовых платежей по налогам, сборов, страховых взносов"
        inn={org.inn}
      />

      <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
        <FormField label="Представляется в налоговый орган (код)">
          <Cells value={org.taxOfficeCode} count={4} />
        </FormField>
        <FormField label="Номер корректировки">
          <Cells value="0" count={3} />
        </FormField>
        <FormField label="Налогоплательщик">
          <span className="text-[12px]">{org.fio || org.name || '—'}</span>
        </FormField>
        <FormField label="Отчётный (календарный) год">
          <Cells value={yr} count={4} />
        </FormField>
      </div>

      <div className="mt-5 mb-2 text-[12px] font-semibold">
        Данные об обязанности по уплате (раздел 1)
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-slate-300 p-3 text-[12px] text-slate-500">
          Поквартальные авансы не рассчитаны — уведомление по ним не формируется. Внесите доходы по
          датам в «Деньгах», чтобы получить суммы авансов за 1 кв / полугодие / 9 месяцев. Годовой
          налог подаётся декларацией, а не уведомлением.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded border border-slate-300 p-2.5">
              <div className="mb-1 text-[11px] text-slate-400">
                Обязательство {i + 1} — {r.title}
              </div>
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <FormField label="1. КПП">
                  <Cells count={9} />
                </FormField>
                <FormField label="2. КБК">
                  <Cells value={r.kbk} count={20} />
                </FormField>
                <FormField label="3. Код по ОКТМО">
                  <Cells value={r.oktmo} count={8} />
                </FormField>
                <FormField label="4. Сумма налога / взноса">
                  <span className="tnum font-semibold">{amt(r.amount)}</span>
                </FormField>
                <FormField label="5. Отчётный (налоговый) период / номер">
                  <span className="tnum font-mono">{r.period}</span>
                </FormField>
                <FormField label="6. Отчётный (календарный) год">
                  <Cells value={r.year} count={4} />
                </FormField>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-[11px] text-slate-500">
        Код периода «34/01», «34/02», «34/03» — авансы УСН за 1 квартал, полугодие и 9 месяцев
        (подаётся до 25 апреля / июля / октября). По итогам года уведомление не подаётся.
      </div>

      <SignBlock name={org.fio || org.name} />
      <OfficialNote />
    </div>
  )
}
