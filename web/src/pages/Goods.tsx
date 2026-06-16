import { useState } from 'react'
import { useOrg } from '../state/orgStore'
import { GOOD_KIND_LABEL, useGoods, type GoodKind } from '../state/goodsStore'
import { formatRub } from '../lib/format'
import { Card, Field, Note, inputClass } from '../components/ui'
import { IconPlus } from '../components/icons'

const KIND_OPTIONS: { value: GoodKind; label: string }[] = [
  { value: 'service', label: 'Услуга' },
  { value: 'product', label: 'Товар' },
]

export function Goods() {
  const { activeOrg } = useOrg()
  const { goods, addGood, updateGood, removeGood } = useGoods()
  const [selectedId, setSelectedId] = useState<string | null>(goods[0]?.id ?? null)

  const selected = goods.find((g) => g.id === selectedId) ?? null
  const create = () => setSelectedId(addGood())

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{activeOrg.name}</div>
          <h1 className="text-2xl font-semibold text-ink">Товары и услуги</h1>
          <p className="mt-1 text-sm text-muted">
            Номенклатура с ценами. Позиции подставляются в счета и акты одним кликом.
          </p>
        </div>
        <button
          type="button"
          onClick={create}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <IconPlus size={16} /> Добавить позицию
        </button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Список */}
        <Card title="Номенклатура">
          {goods.length === 0 ? (
            <p className="text-sm text-muted">Пока пусто. Добавьте товар или услугу.</p>
          ) : (
            <div className="space-y-1">
              {goods.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedId(g.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    g.id === selectedId ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-slate-50'
                  }`}
                >
                  <div className="font-medium text-ink">{g.name || 'Без названия'}</div>
                  <div className="text-xs text-muted">
                    {GOOD_KIND_LABEL[g.kind]} · {formatRub(g.price, { kopecks: true })} / {g.unit || '—'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Карточка */}
        {selected ? (
          <Card
            title={selected.name || 'Новая позиция'}
            right={
              <button
                type="button"
                onClick={() => {
                  removeGood(selected.id)
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
                    value={selected.kind}
                    onChange={(e) => updateGood(selected.id, { kind: e.target.value as GoodKind })}
                  >
                    {KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Наименование">
                  <input
                    className={inputClass}
                    placeholder="Разработка сайта"
                    value={selected.name}
                    onChange={(e) => updateGood(selected.id, { name: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Цена, ₽">
                  <input
                    type="number"
                    min={0}
                    className={`${inputClass} text-right`}
                    value={selected.price}
                    onChange={(e) => updateGood(selected.id, { price: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </Field>
                <Field label="Единица измерения">
                  <input
                    className={inputClass}
                    placeholder="шт, ч, усл."
                    value={selected.unit}
                    onChange={(e) => updateGood(selected.id, { unit: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Примечание">
                <input
                  className={inputClass}
                  placeholder="Артикул, описание…"
                  value={selected.note}
                  onChange={(e) => updateGood(selected.id, { note: e.target.value })}
                />
              </Field>
            </div>
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-muted">Выберите позицию слева или добавьте новую.</p>
          </Card>
        )}
      </div>

      <div className="mt-5">
        <Note>
          Цена указывается без учёта количества — оно задаётся в документе. Данные хранятся локально
          в браузере по организации.
        </Note>
      </div>
    </div>
  )
}
