import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOrg } from './orgStore'

export interface DocItem {
  name: string
  qty: number
  price: number
}

export type DocType = 'invoice' | 'act' | 'waybill' | 'upd' | 'contract'
export type VatMode = 'none' | '5' | '7' | '10' | '20'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  invoice: 'Счёт',
  act: 'Акт',
  waybill: 'Накладная',
  upd: 'УПД',
  contract: 'Договор',
}

export interface Doc {
  id: string
  type: DocType
  number: string
  date: string // YYYY-MM-DD
  buyer: string
  buyerDetails: string // ИНН/адрес покупателя (свободный текст)
  items: DocItem[]
  vatMode: VatMode
  note: string
  paymentStatus: PaymentStatus
  paidDate?: string // YYYY-MM-DD
  linkedOpId?: string // id операции в «Деньгах», созданной при отметке «оплачен»
}

const KEY = 'svoyakniga.docs.v1'
type Store = Record<string, Doc[]>

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'doc-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

function load(): Store {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || '{}') as Store) || {}
  } catch {
    return {}
  }
}

interface DocsCtxValue {
  docs: Doc[]
  addDoc: (type: DocType) => string
  updateDoc: (id: string, patch: Partial<Doc>) => void
  removeDoc: (id: string) => void
}

const DocsCtx = createContext<DocsCtxValue | null>(null)

export function DocsProvider({ children }: { children: ReactNode }) {
  const { activeOrgId } = useOrg()
  const [store, setStore] = useState<Store>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch {
      /* ignore */
    }
  }, [store])

  const docs = store[activeOrgId] ?? []

  const addDoc = (type: DocType): string => {
    const id = makeId()
    const list = store[activeOrgId] ?? []
    const nextNumber = String(list.filter((d) => d.type === type).length + 1)
    const doc: Doc = {
      id,
      type,
      number: nextNumber,
      date: new Date().toISOString().slice(0, 10),
      buyer: '',
      buyerDetails: '',
      items: [{ name: '', qty: 1, price: 0 }],
      vatMode: 'none',
      note: '',
      paymentStatus: 'unpaid',
    }
    setStore((s) => ({ ...s, [activeOrgId]: [...(s[activeOrgId] ?? []), doc] }))
    return id
  }

  const updateDoc = (id: string, patch: Partial<Doc>) =>
    setStore((s) => ({
      ...s,
      [activeOrgId]: (s[activeOrgId] ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }))

  const removeDoc = (id: string) =>
    setStore((s) => ({ ...s, [activeOrgId]: (s[activeOrgId] ?? []).filter((d) => d.id !== id) }))

  return (
    <DocsCtx.Provider value={{ docs, addDoc, updateDoc, removeDoc }}>{children}</DocsCtx.Provider>
  )
}

export function useDocs(): DocsCtxValue {
  const ctx = useContext(DocsCtx)
  if (!ctx) throw new Error('useDocs must be used within DocsProvider')
  return ctx
}

/** Итоги документа: сумма и (в т.ч.) НДС. */
export function docTotals(doc: Doc) {
  const subtotal = doc.items.reduce((s, it) => s + it.qty * it.price, 0)
  const rate = doc.vatMode === 'none' ? 0 : Number(doc.vatMode)
  const vat = rate > 0 ? subtotal - subtotal / (1 + rate / 100) : 0
  return { subtotal, rate, vat }
}
