import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Decimal from 'decimal.js'
import { useOrg, type Org } from './orgStore'
import { calcVatUsn, getParams } from '../lib/taxcore'
import { persistKey } from '../lib/storage/idb'
import { logChange, diffFields } from '../lib/storage/storeAdmin'

export interface DocItem {
  id: string
  name: string
  qty: number
  price: number
  unit?: string // единица измерения (шт, услуга, кг…) — колонка «Ед.» в счёте
}

export type DocType = 'invoice' | 'act' | 'waybill' | 'upd' | 'contract'
export type VatMode = 'none' | '5' | '7' | '10' | '20' | '22'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
/** Направление: исходящие (мы выставляем) или входящие (получены от поставщиков). */
export type DocDirection = 'outgoing' | 'incoming'

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  invoice: 'Счёт',
  act: 'Акт',
  waybill: 'Накладная',
  upd: 'УПД',
  contract: 'Договор',
}

/** Вид договора (для печатной формы). */
export type ContractKind = 'services' | 'supply' | 'work' | 'rent' | 'nda' | 'offer'

export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = {
  services: 'Возмездного оказания услуг',
  supply: 'Поставки',
  work: 'Подряда',
  rent: 'Аренды',
  nda: 'О неразглашении (NDA)',
  offer: 'Публичная оферта',
}

export interface Doc {
  id: string
  type: DocType
  direction: DocDirection
  number: string
  date: string // YYYY-MM-DD
  buyer: string // для входящих — поставщик («от кого»)
  buyerDetails: string // ИНН/адрес контрагента (свободный текст)
  items: DocItem[]
  vatMode: VatMode
  contractKind?: ContractKind // только для type === 'contract'
  note: string
  paymentStatus: PaymentStatus
  paidDate?: string // YYYY-MM-DD
  linkedOpId?: string // id операции в «Деньгах», созданной при отметке «оплачен»
}

const KEY = 'svoyakniga.docs.v1'
type Store = Record<string, Doc[]>

/** Ставка НДС по умолчанию для нового счёта — из выбранного режима НДС организации. */
export function defaultDocVatMode(org: Org): VatMode {
  if (!org.vat) return 'none'
  switch (org.vatMode) {
    case 'rate5':
      return '5'
    case 'rate7':
      return '7'
    case 'rate10':
      return '10'
    case 'general':
      return String(getParams(org.year).vat_general_rate.toNumber()) as VatMode
    case 'none':
      return 'none'
    case 'auto':
    default:
      try {
        const r = calcVatUsn(org.year, org.income, { mode: 'auto' })
        if (r.exempt) return 'none'
        const n = r.rate.toNumber()
        return (n > 0 ? String(n) : 'none') as VatMode
      } catch {
        return 'none'
      }
  }
}

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'doc-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

let itemCounter = 0
/** Стабильный id строки документа (нужен для корректного React-key при удалении). */
export function makeItemId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'it-' + (itemCounter++).toString(36) + Math.floor(performance.now()).toString(36)
  }
}

/** Новая строка документа со стабильным id. */
export function newDocItem(name = '', qty = 1, price = 0, unit = 'шт'): DocItem {
  return { id: makeItemId(), name, qty, price, unit }
}

function load(): Store {
  try {
    const raw = (JSON.parse(localStorage.getItem(KEY) || '{}') as Store) || {}
    // Миграция: старые документы без направления → исходящие; строки без id получают id.
    for (const k of Object.keys(raw)) {
      raw[k] = (raw[k] ?? []).map((d) => ({
        ...d,
        direction: d.direction ?? 'outgoing',
        items: (d.items ?? []).map((it) => ({ ...it, id: it.id ?? makeItemId() })),
      }))
    }
    return raw
  } catch {
    return {}
  }
}

interface DocsCtxValue {
  docs: Doc[]
  addDoc: (type: DocType, direction?: DocDirection) => string
  updateDoc: (id: string, patch: Partial<Doc>) => void
  removeDoc: (id: string) => void
}

const DocsCtx = createContext<DocsCtxValue | null>(null)

export function DocsProvider({ children }: { children: ReactNode }) {
  const { activeOrgId, activeOrg } = useOrg()
  const [store, setStore] = useState<Store>(load)

  useEffect(() => {
    persistKey(KEY, JSON.stringify(store))
  }, [store])

  const docs = store[activeOrgId] ?? []

  const addDoc = (type: DocType, direction: DocDirection = 'outgoing'): string => {
    const id = makeId()
    const list = store[activeOrgId] ?? []
    const nextNumber = String(
      list.filter((d) => d.type === type && d.direction === direction).length + 1
    )
    const doc: Doc = {
      id,
      type,
      direction,
      number: nextNumber,
      date: new Date().toISOString().slice(0, 10),
      buyer: '',
      buyerDetails: '',
      items: [newDocItem()],
      // Для входящих ставку НДС вводит поставщик (по умолчанию без НДС); для исходящих — из реквизитов.
      vatMode: direction === 'incoming' ? 'none' : defaultDocVatMode(activeOrg),
      note: '',
      paymentStatus: 'unpaid',
    }
    logChange('Документ', 'create', `${DOC_TYPE_LABEL[type]} № ${nextNumber}`)
    setStore((s) => ({ ...s, [activeOrgId]: [...(s[activeOrgId] ?? []), doc] }))
    return id
  }

  const updateDoc = (id: string, patch: Partial<Doc>) => {
    const old = docs.find((d) => d.id === id)
    if (old) {
      const d = diffFields(old as unknown as Record<string, unknown>, patch as Record<string, unknown>)
      if (d) logChange('Документ', 'update', `${DOC_TYPE_LABEL[old.type]} № ${old.number}`, d)
    }
    setStore((s) => ({
      ...s,
      [activeOrgId]: (s[activeOrgId] ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }))
  }

  const removeDoc = (id: string) => {
    const old = docs.find((d) => d.id === id)
    if (old) logChange('Документ', 'delete', `${DOC_TYPE_LABEL[old.type]} № ${old.number}`)
    setStore((s) => ({ ...s, [activeOrgId]: (s[activeOrgId] ?? []).filter((d) => d.id !== id) }))
  }

  return (
    <DocsCtx.Provider value={{ docs, addDoc, updateDoc, removeDoc }}>{children}</DocsCtx.Provider>
  )
}

export function useDocs(): DocsCtxValue {
  const ctx = useContext(DocsCtx)
  if (!ctx) throw new Error('useDocs must be used within DocsProvider')
  return ctx
}

/** Итоги документа: сумма и (в т.ч.) НДС. Считаем на decimal.js (как остальной денежный код) —
 *  float-дрейф из qty×price утекал во входной НДС и декларацию. Округление до копеек. */
export function docTotals(doc: Doc) {
  const subtotalD = doc.items.reduce(
    (s, it) => s.plus(new Decimal(it.qty || 0).times(it.price || 0)),
    new Decimal(0)
  )
  const rate = doc.vatMode === 'none' ? 0 : Number(doc.vatMode)
  const vatD =
    rate > 0 ? subtotalD.minus(subtotalD.div(new Decimal(1).plus(new Decimal(rate).div(100)))) : new Decimal(0)
  const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
  return { subtotal: round2(subtotalD), rate, vat: round2(vatD) }
}

/**
 * Построчная разбивка НДС для печатной формы счёта (модель «НДС в т.ч.» — как в
 * docTotals). Возвращает по каждой строке сумму без НДС / НДС / с НДС, и итоги,
 * согласованные с docTotals (одна модель округления). */
export function docLineTotals(doc: Doc) {
  const { subtotal, rate, vat } = docTotals(doc)
  const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
  const divisor = new Decimal(1).plus(new Decimal(rate).div(100))
  const lines = doc.items.map((it) => {
    const gross = new Decimal(it.qty || 0).times(it.price || 0)
    const net = rate > 0 ? gross.div(divisor) : gross
    return { gross: round2(gross), net: round2(net), vat: round2(gross.minus(net)) }
  })
  return {
    rate,
    lines,
    totalNet: round2(new Decimal(subtotal).minus(vat)),
    totalVat: vat,
    totalGross: subtotal,
  }
}
