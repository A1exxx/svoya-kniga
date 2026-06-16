import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatRub, formatDate } from '../lib/format'
import { IconCheck, IconChevron } from './icons'
import { SendDemoModal } from './SendDemoModal'

export interface TaskEvent {
  kind: 'payment' | 'report' | 'notification'
  title: string
  due: string
  amount: number | { toNumber: () => number } | null
  note?: string
}

interface Step {
  t: string
  d: string
  to?: string
  link?: string
  send?: boolean
}

function stepsFor(kind: TaskEvent['kind']): Step[] {
  if (kind === 'payment') {
    return [
      { t: 'Проверьте операции за период', d: 'Убедитесь, что все доходы и расходы внесены в «Деньги».', to: '/money', link: 'Открыть Деньги' },
      { t: 'Посмотрите расчёт', d: 'Проверьте сумму и то, как она получилась, на экране «Налоги».', to: '/taxes', link: 'Открыть расчёт' },
      { t: 'Оплатите на ЕНС', d: 'Перечислите сумму на единый налоговый счёт до срока — реквизиты ЕНП едины для всех налогов и взносов.' },
    ]
  }
  if (kind === 'notification') {
    return [
      { t: 'Проверьте расчёт аванса', d: 'Аванс УСН за период считается на экране «Налоги».', to: '/taxes', link: 'Открыть расчёт' },
      { t: 'Сформируйте уведомление', d: 'Уведомление об исчисленных суммах (КНД 1110355) — печать или выгрузка XML.', to: '/taxes', link: 'К уведомлению' },
      { t: 'Подпишите и отправьте', d: 'Подпись КЭП и отправка в ФНС до 25 числа месяца.', send: true },
    ]
  }
  return [
    { t: 'Проверьте годовой расчёт', d: 'Налог за год и вычет страховых взносов — на экране «Налоги».', to: '/taxes', link: 'Открыть расчёт' },
    { t: 'Сформируйте декларацию', d: 'Декларация по УСН (КНД 1152017) — печать или выгрузка XML.', to: '/taxes', link: 'К декларации' },
    { t: 'Подпишите и отправьте', d: 'Подпись КЭП и отправка в ФНС.', send: true },
  ]
}

const amountNum = (a: TaskEvent['amount']) =>
  a == null ? null : typeof a === 'number' ? a : a.toNumber()

/** Пошаговый мастер по задаче (как в Эльбе): Проверь → Сформируй → Подпиши → Отправь → Оплати. */
export function TaskWizardModal({ event, onClose }: { event: TaskEvent; onClose: () => void }) {
  const [send, setSend] = useState(false)
  const steps = stepsFor(event.kind)
  const amt = amountNum(event.amount)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-ink">{event.title}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span>Срок: {formatDate(event.due)}</span>
          {amt != null && <span className="font-medium text-ink">Сумма: {formatRub(amt)}</span>}
        </div>

        <ol className="mt-5 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">{s.t}</div>
                <div className="mt-0.5 text-sm text-muted">{s.d}</div>
                {s.to && s.link && (
                  <Link
                    to={s.to}
                    onClick={onClose}
                    className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
                  >
                    {s.link}
                    <IconChevron size={14} />
                  </Link>
                )}
                {s.send && (
                  <button
                    type="button"
                    onClick={() => setSend(true)}
                    className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                  >
                    <IconCheck size={14} />
                    Подписать и отправить (демо)
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-slate-50"
          >
            Закрыть
          </button>
        </div>
      </div>

      {send && <SendDemoModal docTitle={event.title} onClose={() => setSend(false)} />}
    </div>
  )
}
