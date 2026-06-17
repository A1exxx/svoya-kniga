import { formatRub } from '../lib/format'
import type { Org } from '../state/orgStore'

export interface NotificationRow {
  kbk: string
  oktmo: string
  period: string
  year: number
  amount: number
  title: string
}

/** Печатная форма уведомления об исчисленных суммах (КНД 1110355) — мультистрочная. */
export function NotificationDoc({ org, rows }: { org: Org; rows: NotificationRow[] }) {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <div>
      <div className="text-center">
        <div className="text-base font-semibold">
          Уведомление об исчисленных суммах налогов, авансовых платежей, сборов, страховых взносов
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
            <td className="py-1 text-slate-500">ИНН / КПП</td>
            <td className="py-1 text-right font-medium">{org.inn || '—'} / — (ИП)</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-5 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-y border-slate-300 text-left">
            <th className="py-1.5 pr-2 font-semibold">КПП</th>
            <th className="py-1.5 pr-2 font-semibold">ОКТМО</th>
            <th className="py-1.5 pr-2 font-semibold">КБК</th>
            <th className="py-1.5 pr-2 font-semibold">Период</th>
            <th className="py-1.5 pr-2 font-semibold">Год</th>
            <th className="py-1.5 pr-2 font-semibold">Обязательство</th>
            <th className="py-1.5 text-right font-semibold">Сумма, ₽</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-200 align-top">
              <td className="py-1.5 pr-2">—</td>
              <td className="tnum py-1.5 pr-2">{r.oktmo}</td>
              <td className="tnum py-1.5 pr-2">{r.kbk}</td>
              <td className="tnum py-1.5 pr-2">{r.period}</td>
              <td className="tnum py-1.5 pr-2">{r.year}</td>
              <td className="py-1.5 pr-2">{r.title}</td>
              <td className="tnum py-1.5 text-right font-medium">{formatRub(Math.round(r.amount))}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-300 font-semibold">
            <td className="py-1.5 pr-2" colSpan={6}>
              Итого
            </td>
            <td className="tnum py-1.5 text-right">{formatRub(Math.round(total))}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 text-[12px] text-slate-600">
        ФНС спишет указанные суммы с ЕНС в счёт перечисленных в уведомлении налогов/взносов.
        ОКТМО и код инспекции — из реквизитов. Демо-форма, перед подачей сверьте с бухгалтером.
      </div>
      <div className="mt-6 text-xs text-slate-500">Подпись: ______________ / {org.fio || org.name}</div>
    </div>
  )
}
