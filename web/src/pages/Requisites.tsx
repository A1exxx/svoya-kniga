import { useOrg } from '../state/orgStore'
import { type UsnObject } from '../lib/taxcore'
import { Card, Field, Note, inputClass } from '../components/ui'

export function Requisites() {
  const { activeOrg, updateActiveOrg } = useOrg()
  const o = activeOrg

  const text = (key: keyof typeof o, label: string, placeholder = '', hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        placeholder={placeholder}
        value={(o[key] as string) ?? ''}
        onChange={(e) => updateActiveOrg({ [key]: e.target.value } as never)}
      />
    </Field>
  )

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Реквизиты</h1>
          <p className="mt-1 text-sm text-muted">
            Данные ИП, банк и система налогообложения. Сохраняются автоматически и используются в
            расчётах и документах. Переключить или добавить ИП можно слева внизу.
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Появится позже"
          className="cursor-not-allowed rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400"
        >
          Заполнить по ИНН (в разработке)
        </button>
      </header>

      <div className="space-y-5">
        <Card title="Организация">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('name', 'Краткое название', 'ИП Иванов')}
            {text('fio', 'ФИО предпринимателя', 'Иванов Иван Иванович')}
            {text('inn', 'ИНН', '123456789012')}
            {text('ogrnip', 'ОГРНИП', '312345678901234')}
            {text('regDate', 'Дата регистрации', '', 'в формате ГГГГ-ММ-ДД')}
            {text('okved', 'Основной ОКВЭД', '62.01')}
            <div className="sm:col-span-2">{text('address', 'Адрес', 'г. Москва, ...')}</div>
          </div>
        </Card>

        <Card title="Расчётный счёт">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('bankAccount', 'Расчётный счёт', '40802810...')}
            {text('bik', 'БИК банка', '044525...')}
            <div className="sm:col-span-2">{text('bankName', 'Название банка', 'Т-Банк / Сбербанк / ...')}</div>
          </div>
        </Card>

        <Card title="Система налогообложения">
          <div className="space-y-4">
            <Field label="Объект УСН">
              <div className="grid max-w-md grid-cols-2 gap-2">
                {(
                  [
                    ['income', 'Доходы 6%'],
                    ['income_minus', 'Доходы − расходы 15%'],
                  ] as [UsnObject, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => updateActiveOrg({ usnObject: val })}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      o.usnObject === val
                        ? 'border-brand-500 bg-brand-50 text-brand-600'
                        : 'border-line text-muted hover:border-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Региональная ставка, %"
              hint="оставьте пустым для базовой (6% или 15%); регион может снизить"
            >
              <input
                type="number"
                step="any"
                min={0}
                className={`${inputClass} max-w-[180px]`}
                placeholder="базовая"
                value={o.regionalRate ?? ''}
                onChange={(e) =>
                  updateActiveOrg({
                    regionalRate: e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                  })
                }
              />
            </Field>

            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-100"
                checked={o.hasEmployees}
                onChange={(e) => updateActiveOrg({ hasEmployees: e.target.checked })}
              />
              <span className="text-sm text-ink">Есть наёмные работники</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-100"
                checked={o.vat}
                onChange={(e) => updateActiveOrg({ vat: e.target.checked })}
              />
              <span className="text-sm text-ink">
                Плательщик НДС на УСН <span className="text-muted">(доход свыше порога)</span>
              </span>
            </label>
          </div>
        </Card>

        <Note>
          Данные хранятся локально в браузере (демо-режим) и сразу применяются в расчётах. Объект и
          ставка отсюда используются на экране «Налоги».
        </Note>
      </div>
    </div>
  )
}
