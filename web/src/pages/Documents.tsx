import { useState } from 'react'
import { useOrg } from '../state/orgStore'
import {
  DOC_TYPE_LABEL,
  CONTRACT_KIND_LABEL,
  docTotals,
  newDocItem,
  useDocs,
  type DocItem,
  type DocType,
  type DocDirection,
  type ContractKind,
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
import { WaybillDoc } from '../components/WaybillDoc'
import { UpdDoc } from '../components/UpdDoc'
import { SalesBookDoc } from '../components/SalesBookDoc'
import { PurchaseBookDoc } from '../components/PurchaseBookDoc'
import { VatDeclarationDoc } from '../components/VatDeclarationDoc'
import { SendDemoModal } from '../components/SendDemoModal'
import { compute } from '../lib/compute'
import { calcVatUsn } from '../lib/taxcore'
import { vatDeclarationXml, vatDeclarationFileName } from '../lib/vatDeclarationXml'
import { buildVatBooks } from '../lib/vatBooks'
import { downloadText } from '../lib/download'

const VAT_OPTIONS: { value: VatMode; label: string }[] = [
  { value: 'none', label: 'Без НДС' },
  { value: '5', label: 'НДС 5%' },
  { value: '7', label: 'НДС 7%' },
  { value: '10', label: 'НДС 10%' },
  { value: '20', label: 'НДС 20%' },
  { value: '22', label: 'НДС 22%' },
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
  const { addOp, removeOp, ops } = useOps()
  const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.id ?? null)
  const [printId, setPrintId] = useState<string | null>(null)
  const [vatView, setVatView] = useState<'book' | 'purchase' | 'decl' | null>(null)
  const [vatSend, setVatSend] = useState(false)
  const [direction, setDirection] = useState<DocDirection>('outgoing')
  const incoming = direction === 'incoming'

  // Входной НДС к вычету — из входящих документов со ставкой НДС (для общей ставки).
  const inputVat = docs
    .filter((d) => d.direction === 'incoming' && d.vatMode !== 'none')
    .reduce((s, d) => s + docTotals(d).vat, 0)

  // Книги продаж/покупок (раздел 9 / раздел 8 декларации НДС) — за год активного ИП.
  const vatBooks = buildVatBooks(docs, activeOrg.year)

  let vatRes: ReturnType<typeof compute>['vat'] = null
  if (activeOrg.vat) {
    try {
      const c = compute(activeOrg, ops)
      const vatIncome = c.quarterly ? c.byQuarter.reduce((s, q) => s + q.income, 0) : activeOrg.income
      vatRes = calcVatUsn(activeOrg.year, vatIncome, {
        mode: activeOrg.vatMode,
        incomeIncludesVat: true,
        inputVat,
      })
    } catch (e) {
      console.error('[svoyakniga] Ошибка расчёта НДС:', e)
      vatRes = null
    }
  }

  const selected = docs.find((d) => d.id === selectedId) ?? null
  const printDoc = docs.find((d) => d.id === printId) ?? null
  const dirDocs = docs.filter((d) => d.direction === direction)

  const create = (type: DocType) => setSelectedId(addDoc(type, direction))
  const switchDirection = (d: DocDirection) => {
    setDirection(d)
    setSelectedId(docs.find((x) => x.direction === d)?.id ?? null)
  }

  const setItem = (idx: number, patch: Partial<DocItem>) => {
    if (!selected) return
    const items = selected.items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    updateDoc(selected.id, { items })
  }
  const addItem = () => selected && updateDoc(selected.id, { items: [...selected.items, newDocItem()] })
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
    updateDoc(selected.id, { items: [...selected.items, newDocItem(g.name, 1, g.price)] })
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
      // Исходящий оплачен → приход (доход); входящий оплачен → расход.
      patch.linkedOpId = addOp({
        date: selected.date || today,
        kind: selected.direction === 'incoming' ? 'expense' : 'income',
        amount: docTotals(selected).subtotal,
        counterparty: selected.buyer,
        doc: `${DOC_TYPE_LABEL[selected.type]} № ${selected.number}`,
        note: selected.direction === 'incoming' ? 'оплата поставщику' : 'оплата по счёту',
        taxable: true,
      })
    } else if (v !== 'paid' && selected.linkedOpId) {
      removeOp(selected.linkedOpId)
      patch.linkedOpId = undefined
    }
    updateDoc(selected.id, patch)
  }

  // Дебиторка — неоплаченные исходящие счета (нам должны); кредиторка — неоплаченные входящие (мы должны).
  const outUnpaid = docs.filter(
    (d) => d.direction === 'outgoing' && d.type === 'invoice' && d.paymentStatus !== 'paid'
  )
  const inUnpaid = docs.filter((d) => d.direction === 'incoming' && d.paymentStatus !== 'paid')
  const debitorka = outUnpaid.reduce((s, d) => s + docTotals(d).subtotal, 0)
  const kreditorka = inUnpaid.reduce((s, d) => s + docTotals(d).subtotal, 0)

  const isInvoice = selected?.type === 'invoice'

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{activeOrg.name}</div>
          <h1 className="text-2xl font-semibold text-ink">Документы</h1>
          <p className="mt-1 text-sm text-muted">
            {incoming
              ? 'Входящие — счета и акты, полученные от поставщиков.'
              : 'Исходящие — счета, акты, накладные и УПД, которые вы выставляете.'}
          </p>
          <div className="mt-3 inline-flex rounded-lg border border-line p-0.5">
            {(
              [
                ['outgoing', 'Исходящие'],
                ['incoming', 'Входящие'],
              ] as [DocDirection, string][]
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => switchDirection(val)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  direction === val ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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

      {activeOrg.vat && (
        <Card title="НДС: книга продаж и декларация" className="mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setVatView('book')}
              className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              Книга продаж
            </button>
            <button
              type="button"
              onClick={() => setVatView('purchase')}
              className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              Книга покупок
            </button>
            <button
              type="button"
              onClick={() => setVatView('decl')}
              className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              Декларация НДС
            </button>
            <button
              type="button"
              disabled={!vatRes}
              onClick={() =>
                vatRes && downloadText(vatDeclarationFileName(activeOrg), vatDeclarationXml(activeOrg, vatRes, '24', vatBooks), 'application/xml;charset=windows-1251')
              }
              className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
            >
              Скачать XML
            </button>
            <button
              type="button"
              onClick={() => setVatSend(true)}
              className="cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Отправить (имитация)
            </button>
            {vatRes && !vatRes.exempt && vatRes.mode !== 'usn_lost' && (
              <span className="ml-auto text-sm text-muted">
                {vatRes.input_vat_deducted.toNumber() > 0 && (
                  <>входной НДС к вычету {formatRub(vatRes.input_vat_deducted.toNumber())} · </>
                )}
                НДС к уплате: <span className="tnum font-semibold text-ink">{formatRub(vatRes.vat.toNumber())}</span> · ставка {vatRes.rate.toNumber()}%
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            Книга продаж — из исходящих счетов/актов с НДС; книга покупок и вычет входного НДС — из
            входящих документов с НДС (вычет только при общей ставке 20/22/10%). Ставка по умолчанию —
            из «Реквизитов». Реальная сдача НДС — через оператора ЭДО (раздел «Налоговая»).
          </p>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Список документов */}
        <Card title={incoming ? 'Входящие' : 'Исходящие'}>
          {!incoming && debitorka > 0 && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-warn">
              Дебиторка: {outUnpaid.length} сч. на {formatRub(debitorka)} (нам должны)
            </div>
          )}
          {incoming && kreditorka > 0 && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-warn">
              Кредиторка: {inUnpaid.length} док. на {formatRub(kreditorka)} (мы должны)
            </div>
          )}
          {dirDocs.length === 0 ? (
            <p className="text-sm text-muted">
              {incoming
                ? 'Нет входящих документов. Добавьте полученный от поставщика счёт или акт.'
                : 'Пока нет документов. Создайте счёт, акт, накладную или УПД.'}
            </p>
          ) : (
            <div className="space-y-1">
              {dirDocs.map((d) => {
                const { subtotal } = docTotals(d)
                const badge = d.type === 'invoice' || incoming ? PAY_BADGE[d.paymentStatus] : null
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

              {selected.type === 'contract' && (
                <Field label="Вид договора">
                  <select
                    className={inputClass}
                    value={selected.contractKind ?? 'services'}
                    onChange={(e) => updateDoc(selected.id, { contractKind: e.target.value as ContractKind })}
                  >
                    {(Object.keys(CONTRACT_KIND_LABEL) as ContractKind[]).map((k) => (
                      <option key={k} value={k}>
                        {CONTRACT_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

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
                <Field
                  label={
                    incoming
                      ? 'Поставщик (от кого)'
                      : selected.type === 'act' || selected.type === 'contract'
                        ? 'Заказчик'
                        : 'Покупатель'
                  }
                >
                  <input className={inputClass} placeholder="ООО «Ромашка»" value={selected.buyer} onChange={(e) => updateDoc(selected.id, { buyer: e.target.value })} />
                </Field>
                <Field label={incoming ? 'ИНН / адрес поставщика' : 'ИНН / адрес покупателя'}>
                  <input className={inputClass} placeholder="ИНН 7700000000, г. Москва" value={selected.buyerDetails} onChange={(e) => updateDoc(selected.id, { buyerDetails: e.target.value })} />
                </Field>
              </div>

              {(isInvoice || incoming) && (
                <Field
                  label="Статус оплаты"
                  hint={
                    incoming
                      ? 'при «Оплачен» создаётся расход в «Деньгах»'
                      : 'при «Оплачен» создаётся поступление в «Деньгах» — попадёт в КУДиР и расчёт налога'
                  }
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
                    <div key={it.id} className="grid grid-cols-[1fr_70px_110px_36px] gap-2">
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
          ) : printDoc.type === 'waybill' ? (
            <WaybillDoc org={activeOrg} doc={printDoc} />
          ) : printDoc.type === 'upd' ? (
            <UpdDoc org={activeOrg} doc={printDoc} />
          ) : (
            <InvoiceDoc org={activeOrg} doc={printDoc} />
          )}
        </PrintModal>
      )}

      {vatView === 'book' && (
        <PrintModal title="Книга продаж — предпросмотр" onClose={() => setVatView(null)}>
          <SalesBookDoc org={activeOrg} docs={docs.filter((d) => d.direction === 'outgoing')} />
        </PrintModal>
      )}
      {vatView === 'purchase' && (
        <PrintModal title="Книга покупок — предпросмотр" onClose={() => setVatView(null)}>
          <PurchaseBookDoc org={activeOrg} docs={docs} />
        </PrintModal>
      )}
      {vatView === 'decl' && vatRes && (
        <PrintModal title="Декларация по НДС — предпросмотр" onClose={() => setVatView(null)}>
          <VatDeclarationDoc org={activeOrg} vat={vatRes} books={vatBooks} />
        </PrintModal>
      )}
      {vatSend && <SendDemoModal docTitle="Декларация по НДС" onClose={() => setVatSend(false)} />}
    </div>
  )
}
