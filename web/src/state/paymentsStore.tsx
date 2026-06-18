import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOrg } from './orgStore'
import { persistKey } from '../lib/storage/idb'
import { logChange, diffFields } from '../lib/storage/storeAdmin'

/** Вид платёжки: оплата контрагенту / пополнение ЕНС / перевод между своими счетами. */
export type PaymentKind = 'contractor' | 'ens' | 'transfer'

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  contractor: 'Оплата контрагенту',
  ens: 'Пополнение ЕНС (налоги и взносы)',
  transfer: 'Перевод между счетами',
}

/** Платёжное поручение (форма 0401060). Хранится локально по организации. */
export interface Payment {
  id: string
  number: string // № платёжного поручения
  date: string // YYYY-MM-DD — дата платёжки
  kind: PaymentKind
  amount: number
  // Получатель
  payeeName: string
  payeeInn: string
  payeeKpp: string
  payeeAccount: string
  payeeBank: string
  payeeBik: string
  purpose: string // назначение платежа
  status: 'pending' | 'paid'
  paidDate: string // когда оплачено (YYYY-MM-DD) или ''
  linkedOpId?: string // id операции-расхода в «Деньгах» после оплаты
}

const KEY = 'svoyakniga.payments.v1'
type Store = Record<string, Payment[]> // orgId -> платёжки

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'pay-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

function load(): Store {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || '{}') as Store) || {}
  } catch {
    return {}
  }
}

interface PaymentsCtxValue {
  payments: Payment[]
  addPayment: (p: Omit<Payment, 'id'>) => string
  updatePayment: (id: string, patch: Partial<Payment>) => void
  removePayment: (id: string) => void
}

const Ctx = createContext<PaymentsCtxValue | null>(null)

export function PaymentsProvider({ children }: { children: ReactNode }) {
  const { activeOrgId } = useOrg()
  const [store, setStore] = useState<Store>(load)

  useEffect(() => {
    persistKey(KEY, JSON.stringify(store))
  }, [store])

  const payments = store[activeOrgId] ?? []
  const label = (p: Pick<Payment, 'kind' | 'amount' | 'number'>) =>
    `${PAYMENT_KIND_LABEL[p.kind]} № ${p.number} на ${p.amount} ₽`

  const addPayment = (p: Omit<Payment, 'id'>): string => {
    const id = makeId()
    logChange('Платёжка', 'create', label(p))
    setStore((s) => ({ ...s, [activeOrgId]: [{ ...p, id }, ...(s[activeOrgId] ?? [])] }))
    return id
  }

  const updatePayment = (id: string, patch: Partial<Payment>) => {
    const old = payments.find((p) => p.id === id)
    if (old) {
      const d = diffFields(old, patch)
      if (d) logChange('Платёжка', 'update', label(old), d)
    }
    setStore((s) => ({
      ...s,
      [activeOrgId]: (s[activeOrgId] ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }

  const removePayment = (id: string) => {
    const old = payments.find((p) => p.id === id)
    if (old) logChange('Платёжка', 'delete', label(old))
    setStore((s) => ({ ...s, [activeOrgId]: (s[activeOrgId] ?? []).filter((p) => p.id !== id) }))
  }

  return (
    <Ctx.Provider value={{ payments, addPayment, updatePayment, removePayment }}>
      {children}
    </Ctx.Provider>
  )
}

export function usePayments(): PaymentsCtxValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePayments must be used within PaymentsProvider')
  return ctx
}
