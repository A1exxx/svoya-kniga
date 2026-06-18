import { formatRub } from '../lib/format'
import type { Org } from '../state/orgStore'
import type { Computed } from '../lib/compute'

const v = (d: number | { toNumber: () => number } | null | undefined) =>
  formatRub(d == null ? null : typeof d === 'number' ? d : d.toNumber())

interface ObRow {
  kbk: string
  oktmo: string
  period: string
  title: string
  amount: number | { toNumber: () => number } | null
}

/** Печатная форма уведомления об исчисленных суммах налогов (КНД 1110355). */
export function EnsNotificationDoc({ org, computed }: { org: Org; computed: Computed }) {
  const isIncome = org.usnObject === 'income'
  const kbk = isIncome ? '18210501011011000110' : '18210501021011000110'

  // Обязательства = квартальные авансы УСН (для них и подаётся уведомление).
  const advRows: ObRow[] = computed.calendar
    .filter((e) => e.kind === 'notification' && e.title.includes('аванс'))
    .map((e, i) => ({
      kbk,
      oktmo: org.oktmo || '00000000',
      period: ['34/01', '34/02', '34/03'][i] ?? '34',
      title: e.title.replace('Уведомление об исчисленном авансе УСН за', 'Аванс УСН за'),
      amount: e.amount,
    }))

  // Уведомление подаётся ТОЛЬКО по квартальным авансам (34/01, 34/02, 34/03). Если поквартальных
  // сумм нет (упрощённый годовой расчёт) — НЕ подставляем годовой налог под код 34/03: годовой
  // налог уведомлением не подаётся вовсе, его заменяет декларация. Показываем пустую форму + пояснение.
  const annualOnly = advRows.length === 0 || advRows.every((r) => r.amount == null)
  const rows: ObRow[] = annualOnly ? [] : advRows

  return (
    <div>
      <div className="text-center">
        <div className="text-base font-semibold">
          Уведомление об исчисленных суммах налогов, авансовых платежей по налогам, сборов,
          страховых взносов
        </div>
        <div className="mt-1 text-xs text-slate-500">Форма по КНД 1110355</div>
      </div>

      <table className="mt-5 w-full text-[13px]">
        <tbody>
          <tr>
            <td className="py-1 text-slate-500">Налогоплательщик</td>
            <td className="py-1 text-right font-medium">{org.fio || org.name || '—'}</td>
          </tr>
          <tr>
            <td className="py-1 text-slate-500">ИНН</td>
            <td className="py-1 text-right font-medium">{org.inn || '—'}</td>
          </tr>
          <tr>
            <td className="py-1 text-slate-500">Налоговый орган (код)</td>
            <td className="py-1 text-right font-medium">{org.taxOfficeCode || '—'}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-5 mb-2 font-semibold">Данные о начислениях</div>
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-y border-slate-300 text-left">
            <th className="py-1.5 pr-2 font-semibold">КПП</th>
            <th className="py-1.5 pr-2 font-semibold">ОКТМО</th>
            <th className="py-1.5 pr-2 font-semibold">КБК</th>
            <th className="py-1.5 pr-2 font-semibold">Период</th>
            <th className="py-1.5 pr-2 font-semibold">Обязательство</th>
            <th className="py-1.5 text-right font-semibold">Сумма, ₽</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="border-b border-slate-200">
              <td colSpan={6} className="py-3 text-[12.5px] text-slate-500">
                Поквартальные авансы не рассчитаны — уведомление по ним не формируется. Внесите доходы
                по датам в «Деньгах», чтобы получить суммы авансов за 1 кв / полугодие / 9 месяцев.
                Годовой налог подаётся декларацией, а не уведомлением.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-200 align-top">
                <td className="py-1.5 pr-2">—</td>
                <td className="tnum py-1.5 pr-2">{r.oktmo}</td>
                <td className="tnum py-1.5 pr-2">{r.kbk}</td>
                <td className="tnum py-1.5 pr-2">{r.period}</td>
                <td className="py-1.5 pr-2">{r.title}</td>
                <td className="tnum py-1.5 text-right font-medium">{v(r.amount)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-4 text-[12px] text-slate-600">
        Код периода: «34/01», «34/02», «34/03» — авансы УСН за 1 квартал, полугодие и 9 месяцев
        (уведомление подаётся до 25 апреля / июля / октября). По итогам года уведомление не
        подаётся — его заменяет декларация. ОКТМО и код инспекции заполняются из реквизитов.
      </div>

      <div className="mt-8 text-xs text-slate-500">
        Подпись: ______________ / {org.fio || org.name}
        <span className="ml-4">Предпросмотр (демо). Перед подачей сверьте с бухгалтером.</span>
      </div>
    </div>
  )
}
