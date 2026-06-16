import { useState } from 'react'
import { useOrg } from '../state/orgStore'
import {
  CONTRACTOR_TYPE_LABEL,
  useContractors,
  type ContractorType,
} from '../state/contractorsStore'
import { Card, Field, Note, inputClass } from '../components/ui'
import { IconPlus } from '../components/icons'

const TYPE_OPTIONS: { value: ContractorType; label: string }[] = [
  { value: 'ul', label: 'Юр. лицо' },
  { value: 'ip', label: 'ИП' },
  { value: 'person', label: 'Физ. лицо' },
]

export function Contractors() {
  const { activeOrg } = useOrg()
  const { contractors, addContractor, updateContractor, removeContractor } = useContractors()
  const [selectedId, setSelectedId] = useState<string | null>(contractors[0]?.id ?? null)

  const selected = contractors.find((c) => c.id === selectedId) ?? null
  const create = () => setSelectedId(addContractor())

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{activeOrg.name}</div>
          <h1 className="text-2xl font-semibold text-ink">Контрагенты</h1>
          <p className="mt-1 text-sm text-muted">
            Справочник покупателей и поставщиков. Используется при создании счетов и актов.
          </p>
        </div>
        <button
          type="button"
          onClick={create}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <IconPlus size={16} /> Добавить контрагента
        </button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Список */}
        <Card title="Список">
          {contractors.length === 0 ? (
            <p className="text-sm text-muted">Пока пусто. Добавьте первого контрагента.</p>
          ) : (
            <div className="space-y-1">
              {contractors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    c.id === selectedId ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-slate-50'
                  }`}
                >
                  <div className="font-medium text-ink">{c.name || 'Без названия'}</div>
                  <div className="text-xs text-muted">
                    {CONTRACTOR_TYPE_LABEL[c.type]}
                    {c.inn && ` · ИНН ${c.inn}`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Карточка */}
        {selected ? (
          <Card
            title={selected.name || 'Новый контрагент'}
            right={
              <button
                type="button"
                onClick={() => {
                  removeContractor(selected.id)
                  setSelectedId(null)
                }}
                className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-danger"
              >
                Удалить
              </button>
            }
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Тип">
                  <select
                    className={inputClass}
                    value={selected.type}
                    onChange={(e) => updateContractor(selected.id, { type: e.target.value as ContractorType })}
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={selected.type === 'person' ? 'ФИО' : 'Наименование'}>
                  <input
                    className={inputClass}
                    placeholder={selected.type === 'person' ? 'Иванов Иван Иванович' : 'ООО «Ромашка»'}
                    value={selected.name}
                    onChange={(e) => updateContractor(selected.id, { name: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ИНН">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    placeholder="7700000000"
                    value={selected.inn}
                    onChange={(e) => updateContractor(selected.id, { inn: e.target.value.replace(/\D/g, '') })}
                  />
                </Field>
                <Field label="КПП" hint={selected.type === 'ul' ? undefined : 'Только у юр. лиц'}>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    placeholder="770001001"
                    value={selected.kpp}
                    disabled={selected.type !== 'ul'}
                    onChange={(e) => updateContractor(selected.id, { kpp: e.target.value.replace(/\D/g, '') })}
                  />
                </Field>
              </div>

              <Field label="Адрес">
                <input
                  className={inputClass}
                  placeholder="г. Москва, ул. ..."
                  value={selected.address}
                  onChange={(e) => updateContractor(selected.id, { address: e.target.value })}
                />
              </Field>

              <Field label="Примечание">
                <input
                  className={inputClass}
                  placeholder="Контактное лицо, телефон, договор…"
                  value={selected.note}
                  onChange={(e) => updateContractor(selected.id, { note: e.target.value })}
                />
              </Field>
            </div>
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-muted">Выберите контрагента слева или добавьте нового.</p>
          </Card>
        )}
      </div>

      <div className="mt-5">
        <Note>
          Автозаполнение по ИНН из ЕГРЮЛ/ЕГРИП появится позже — пока реквизиты вводятся вручную.
          Данные хранятся локально в браузере по организации.
        </Note>
      </div>
    </div>
  )
}
