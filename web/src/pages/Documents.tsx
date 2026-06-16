import { useState } from 'react'
import { useOrg } from '../state/orgStore'
import { docTotals, useDocs, type DocItem, type VatMode } from '../state/docsStore'
import { formatRub, formatDate } from '../lib/format'
import { Card, Field, Note, inputClass } from '../components/ui'
import { IconPlus } from '../components/icons'
import { PrintModal } from '../components/PrintModal'
import { InvoiceDoc } from '../components/InvoiceDoc'

const VAT_OPTIONS: { value: VatMode; label: string }[] = [
  { value: 'none', label: 'Без НДС' },
  { value: '5', label: 'НДС 5%' },
  { value: '7', label: 'НДС 7%' },
  { value: '10', label: 'НДС 10%' },
  { value: '20', label: 'НДС 20%' },
]

export function Documents() {
  const { activeOrg } = useOrg()
  const { docs, addDoc, updateDoc, removeDoc } = useDocs()
  const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.id ?? null)
  const [printId, setPrintId] = useState<string | null>(null)

  const selected = docs.find((d) => d.id === selectedId) ?? null
  const printDoc = docs.find((d) => d.id === printId) ?? null

  const create = (type: 'invoice' | 'act') => setSelectedId(addDoc(type))

  const setItem = (idx: number, patch: Partial<DocItem>) => {
    if (!selected) return
    const items = selected.items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    updateDoc(selected.id, { items })
  }
  const addItem = () => selected && updateDoc(selected.id, { items: [...selected.items, { name: '', qty: 1, price: 0 }] })
  const removeItem = (idx: number) =>
    selected && updateDoc(selected.id, { items: selected.items.filter((_, i) => i !== idx) })

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{activeOrg.name}</div>
          <h1 className="text-2xl font-semibold text-ink">Документы</h1>
          <p className="mt-1 text-sm text-muted">Счета на оплату и акты. Реквизиты продавца берутся из «Реквизитов».</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => create('invoice')}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <IconPlus size={16} /> Счёт
          </button>
          <button
            type="button"
            onClick={() => create('act')}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            <IconPlus size={16} /> Акт
          </button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* Список документов */}
        <Card title="Документы">
          {docs.length === 0 ? (
            <p className="text-sm text-muted">Пока нет документов. Создайте счёт или акт.</p>
          ) : (
            <div className="space-y-1">
              {docs.map((d) => {
                const { subtotal } = docTotals(d)
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      d.id === selectedId ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-medium text-ink">
                      {d.type === 'invoice' ? 'Счёт' : 'Акт'} № {d.number}
                    </div>
                    <div className="text-xs text-muted">
                      {formatDate(d.date)} · {formatRub(subtotal)}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {/* Редактор */}
        {selected ? (
          <Card
            title={`${selected.type === 'invoice' ? 'Счёт' : 'Акт'} № ${selected.number}`}
            right={
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPrintId(selected.id)}
                  className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  Печать / PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeDoc(selected.id)
                    setSelectedId(null)
                  }}
                  className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-danger"
                >
                  Удалить
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Номер">
                  <input className={inputClass} value={selected.number} onChange={(e) => updateDoc(selected.id, { number: e.target.value })} />
                </Field>
                <Field label="Дата">
                  <input type="date" className={inputClass} value={selected.date} onChange={(e) => updateDoc(selected.id, { date: e.target.value })} />
                </Field>
                <Field label="НДС">
                  <select className={inputClass} value={selected.vatMode} onChange={(e) => updateDoc(selected.id, { vatMode: e.target.value as VatMode })}>
                    {VAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={selected.type === 'invoice' ? 'Покупатель' : 'Заказчик'}>
                  <input className={inputClass} placeholder="ООО «Ромашка»" value={selected.buyer} onChange={(e) => updateDoc(selected.id, { buyer: e.target.value })} />
                </Field>
                <Field label="ИНН / адрес покупателя">
                  <input className={inputClass} placeholder="ИНN 7700000000, г. Москва" value={selected.buyerDetails} onChange={(e) => updateDoc(selected.id, { buyerDetails: e.target.value })} />
                </Field>
              </div>

              {/* Позиции */}
              <div>
                <div className="mb-2 text-sm font-medium text-ink">Позиции</div>
                <div className="space-y-2">
                  {selected.items.map((it, i) => (
                    <div key={i} className="grid grid-cols-[1fr_70px_110px_36px] gap-2">
                      <input className={inputClass} placeholder="Наименование" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                      <input type="number" min={0} className={`${inputClass} text-right`} value={it.qty} onChange={(e) => setItem(i, { qty: Math.max(0, Number(e.target.value) || 0) })} />
                      <input type="number" min={0} className={`${inputClass} text-right`} value={it.price} onChange={(e) => setItem(i, { price: Math.max(0, Number(e.target.value) || 0) })} />
                      <button type="button" onClick={() => removeItem(i)} className="cursor-pointer rounded-lg border border-line text-slate-400 transition-colors hover:text-danger">✕</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addItem} className="mt-2 flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-600">
                  <IconPlus size={14} /> Добавить строку
                </button>
              </div>

              <Field label="Примечание">
                <input className={inputClass} placeholder="Основание, комментарий…" value={selected.note} onChange={(e) => updateDoc(selected.id, { note: e.target.value })} />
              </Field>

              <div className="flex items-center justify-end gap-2 border-t border-line pt-3 text-sm">
                <span className="text-muted">Итого:</span>
                <span className="tnum text-lg font-semibold text-ink">{formatRub(docTotals(selected).subtotal, { kopecks: true })}</span>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-muted">Выберите документ слева или создайте новый.</p>
          </Card>
        )}
      </div>

      <div className="mt-5">
        <Note>Документы хранятся локально в браузере (демо). Реквизиты продавца (ИНН, банк) подтягиваются из раздела «Реквизиты».</Note>
      </div>

      {printDoc && (
        <PrintModal title={`${printDoc.type === 'invoice' ? 'Счёт' : 'Акт'} № ${printDoc.number} — предпросмотр`} onClose={() => setPrintId(null)}>
          <InvoiceDoc org={activeOrg} doc={printDoc} />
        </PrintModal>
      )}
    </div>
  )
}
