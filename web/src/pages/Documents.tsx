import { useState } from 'react'
import { useOrg } from '../state/orgStore'
import {
  DOC_TYPE_LABEL,
  docTotals,
  useDocs,
  type DocItem,
  type DocType,
  type PaymentStatus,
  type VatMode,
} from '../state/docsStore'
import { contractorDetails, useContractors } from '../state/contractorsStore'
import { useGoods } from '../state/goodsStore'
import { useOps } from '../state/opsStore'
import { formatRub, formatDate } from '../lib/format'
import { Card, Field, Note, inputClass } from '../components/ui'
import { IconPlus } from '../components/icons'
import { PrintModal } from '../components/PrintModal'
import { InvoiceDoc } from '../components/InvoiceDoc'
import { ContractDoc } from '../components/ContractDoc'

const VAT_OPTIONS: { value: VatMode; label: string }[] = [
  { value: 'none', label: 'Без НДС' },
  { value: '5', label: 'НДС 5%' },
  { value: '7', label: 'НДС 7%' },
  { value: '10', label: 'НДС 10%' },
  { value: '20', label: 'НДС 20%' },
]

const PAY_BADGE: Record<PaymentStatus, { label: string; cls: string }> = {
  unpaid: { label: 'Не оплачен', cls: 'bg-amber-50 text-warn' },
  partial: { label: 'Частично', cls: 'bg-brand-50 text-brand-600' },
  paid: { label: 'Оплачен', cls: 'bg-green-50 text-ok' },
}

const CREATE_BUTTONS: { type: DocType; primary?: boolean }[] = [
  { type: 'invoice', primary: true },
  { type: 'act' },
  { type: 'waybill' },
  { type: 'upd' },
  { type: 'contract' },
]

export function Documents() {
  const { activeOrg } = useOrg()
  const { docs, addDoc, updateDoc, removeDoc } = useDocs()
  const { contractors } = useContractors()
  const { goods } = useGoods()
  const { addOp, removeOp } = useOps()
  const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.id ?? null)
  const [printId, setPrintId] = useState<string | null>(null)

  const selected = docs.find((d) => d.id === selectedId) ?? null
  const printDoc = docs.find((d) => d.id === printId) ?? null

  const create = (type: DocType) => setSelectedId(addDoc(type))

  const setItem = (idx: number, patch: Partial<DocItem>) => {
    if (!selected) return
    const items = selected.items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    updateDoc(selected.id, { items })
  }
  const addItem = () => selected && updateDoc(selected.id, { items: [...selected.items, { name: '', qty: 1, price: 0 }] })
  const removeItem = (idx: number) =>
    selected && updateDoc(selected.id, { items: selected.items.filter((_, i) => i !== idx) })

  const pickContractor = (id: string) => {
    const c = contractors.find((x) => x.id === id)
    if (!selected || !c) return
    updateDoc(selected.id, { buyer: c.name, buyerDetails: contractorDetails(c) })
  }
  const addFromGood = (id: string) => {
    const g = goods.find((x) => x.id === id)
    if (!selected || !g) return
    updateDoc(selected.id, { items: [...selected.items, { name: g.name, qty: 1, price: g.price }] })
  }

  // Смена статуса оплаты: «Оплачен» → создаёт поступление в «Деньгах»; снятие — удаляет его.
  const onStatusChange = (v: PaymentStatus) => {
    if (!selected) return
    const today = new Date().toISOString().slice(0, 10)
    const patch: Partial<typeof selected> = {
      paymentStatus: v,
      paidDate: v === 'paid' ? today : undefined,
    }
    if (v === 'paid' && !selected.linkedOpId) {
      patch.linkedOpId = addOp({
        date: selected.date || today,
        kind: 'income',
        amount: docTotals(selected).subtotal,
        counterparty: selected.buyer,
        doc: `Счёт № ${selected.number}`,
        note: 'оплата по счёту',
        taxable: true,
      })
    } else if (v !== 'paid' && selected.linkedOpId) {
      removeOp(selected.linkedOpId)
      patch.linkedOpId = undefined
    }
    updateDoc(selected.id, patch)
  }

  // Мини-дебиторка: неоплаченные счета.
  const unpaid = docs.filter((d) => d.type === 'invoice' && d.paymentStatus !== 'paid')
  const debitorka = unpaid.reduce((s, d) => s + docTotals(d).subtotal, 0)

  const isInvoice = selected?.type === 'invoice'

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{activeOrg.name}</div>
          <h1 className="text-2xl font-semibold text-ink">Документы</h1>
          <p className="mt-1 text-sm text-muted">
            Счета, акты, накладные и УПД. Реквизиты продавца берутся из «Реквизитов».
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CREATE_BUTTONS.map(({ type, primary }) => (
            <button
              key={type}
              type="button"
              onClick={() => create(type)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                primary
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'border border-line text-ink hover:border-brand-300 hover:bg-brand-50'
              }`}
            >
              <IconPlus size={16} /> {DOC_TYPE_LABEL[type]}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Список документов */}
        <Card title="Документы">
          {debitorka > 0 && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-warn">
              Не оплачено: {unpaid.length} сч. на {formatRub(debitorka)}
            </div>
          )}
          {docs.length === 0 ? (
            <p className="text-sm text-muted">Пока нет документов. Создайте счёт, акт, накладную или УПД.</p>
          ) : (
            <div className="space-y-1">
              {docs.map((d) => {
                const { subtotal } = docTotals(d)
                const badge = d.type === 'invoice' ? PAY_BADGE[d.paymentStatus] : null
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      d.id === selectedId ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">
                        {DOC_TYPE_LABEL[d.type]} № {d.number}
                      </span>
                      {badge && (
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}
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
            title={`${DOC_TYPE_LABEL[selected.type]} № ${selected.number}`}
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

              {contractors.length > 0 && (
                <Field label="Выбрать из справочника контрагентов">
                  <select className={inputClass} value="" onChange={(e) => pickContractor(e.target.value)}>
                    <option value="">— выбрать контрагента —</option>
                    {contractors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || 'Без названия'}
                        {c.inn ? ` · ИНН ${c.inn}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={selected.type === 'act' || selected.type === 'contract' ? 'Заказчик' : 'Покупатель'}>
                  <input className={inputClass} placeholder="ООО «Ромашка»" value={selected.buyer} onChange={(e) => updateDoc(selected.id, { buyer: e.target.value })} />
                </Field>
                <Field label="ИНН / адрес покупателя">
                  <input className={inputClass} placeholder="ИНН 7700000000, г. Москва" value={selected.buyerDetails} onChange={(e) => updateDoc(selected.id, { buyerDetails: e.target.value })} />
                </Field>
              </div>

              {isInvoice && (
                <Field
                  label="Статус оплаты"
                  hint="при «Оплачен» создаётся поступление в «Деньгах» — попадёт в КУДиР и расчёт налога"
                >
                  <select
                    className={`${inputClass} max-w-[220px]`}
                    value={selected.paymentStatus}
                    onChange={(e) => onStatusChange(e.target.value as PaymentStatus)}
                  >
                    <option value="unpaid">Не оплачен</option>
                    <option value="partial">Частично оплачен</option>
                    <option value="paid">Оплачен</option>
                  </select>
                </Field>
              )}

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
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={addItem} className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-600">
                    <IconPlus size={14} /> Добавить строку
                  </button>
                  {goods.length > 0 && (
                    <select className={`${inputClass} max-w-[280px]`} value="" onChange={(e) => addFromGood(e.target.value)}>
                      <option value="">+ из товаров и услуг…</option>
                      {goods.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name || 'Без названия'} · {formatRub(g.price, { kopecks: true })}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
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
        <Note>
          Документы хранятся локально в браузере (демо). Реквизиты продавца (ИНН, банк)
          подтягиваются из раздела «Реквизиты», итог дублируется суммой прописью в печатной форме.
        </Note>
      </div>

      {printDoc && (
        <PrintModal title={`${DOC_TYPE_LABEL[printDoc.type]} № ${printDoc.number} — предпросмотр`} onClose={() => setPrintId(null)}>
          {printDoc.type === 'contract' ? (
            <ContractDoc org={activeOrg} doc={printDoc} />
          ) : (
            <InvoiceDoc org={activeOrg} doc={printDoc} />
          )}
        </PrintModal>
      )}
    </div>
  )
}
