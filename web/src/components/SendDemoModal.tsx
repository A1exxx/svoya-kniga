import { useEffect, useState } from 'react'
import { IconCheck, IconClock } from './icons'

const STEPS = [
  'Проверка декларации (форматно-логический контроль)',
  'Подписание квалифицированной электронной подписью (КЭП)',
  'Отправка в ФНС через оператора',
  'Получение квитанции о приёме',
]

/** Имитация сдачи отчётности (как в Эльбе) — БЕЗ реальной отправки. */
export function SendDemoModal({ onClose }: { onClose: () => void }) {
  const [done, setDone] = useState(0)

  useEffect(() => {
    if (done >= STEPS.length) return
    const t = setTimeout(() => setDone((d) => d + 1), 700)
    return () => clearTimeout(t)
  }, [done])

  const finished = done >= STEPS.length
  // Демонстрационный номер квитанции (детерминированно от даты).
  const today = new Date()
  const receiptNo = `ДЕМО-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-0001`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-card">
        <div className="mb-1 inline-flex rounded bg-amber-50 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-warn">
          Демо-режим
        </div>
        <h2 className="text-lg font-semibold text-ink">Подписание и отправка в ФНС</h2>
        <p className="mt-1 text-sm text-muted">
          Это имитация процесса. Реальная подпись КЭП и сдача появятся на следующем этапе
          (через бесплатный шлюз ФНС или оператора ЭДО).
        </p>

        <div className="mt-5 space-y-2">
          {STEPS.map((s, i) => {
            const state = i < done ? 'done' : i === done ? 'active' : 'wait'
            return (
              <div key={i} className="flex items-center gap-3">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                    state === 'done'
                      ? 'bg-green-50 text-ok'
                      : state === 'active'
                        ? 'bg-brand-50 text-brand-600'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {state === 'done' ? <IconCheck size={16} /> : <IconClock size={16} />}
                </span>
                <span className={`text-sm ${state === 'wait' ? 'text-muted' : 'text-ink'}`}>{s}</span>
              </div>
            )
          })}
        </div>

        {finished && (
          <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-slate-700">
            <div className="font-medium text-ok">Отчёт принят (демонстрация)</div>
            <div className="mt-1 text-xs">
              Квитанция о приёме № {receiptNo} от {today.toLocaleDateString('ru-RU')}. В реальном
              режиме здесь будет настоящая квитанция ФНС.
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-slate-50"
          >
            {finished ? 'Закрыть' : 'Отмена'}
          </button>
        </div>
      </div>
    </div>
  )
}
