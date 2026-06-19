import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOrg } from './orgStore'
import { persistKey } from '../lib/storage/idb'
import { logChange, diffFields } from '../lib/storage/storeAdmin'

/**
 * Тип операции платёжки (как в Эльбе — список при создании списания).
 * От типа зависят: нужен ли получатель-контрагент, учитывается ли в УСН расход,
 * бюджетные ли реквизиты (ЕНС/травматизм) и текст назначения по умолчанию.
 */
export type PaymentKind =
  | 'contractor' // Оплата поставщику / контрагенту
  | 'supplier_advance' // Аванс поставщику
  | 'customer_refund' // Возврат покупателю
  | 'salary' // Выплата зарплаты
  | 'ens' // Налоги и взносы (ЕНС)
  | 'injury' // Взносы на травматизм (СФР)
  | 'transfer' // Перевод между своими счетами
  | 'accountable' // Выдача под отчёт
  | 'personal' // Личные нужды ИП (вывод на личный счёт)
  | 'loan_interest' // Проценты по кредиту
  | 'loan_repay' // Возврат кредита / займа
  | 'other' // Прочее списание

interface PaymentKindMeta {
  label: string
  group: 'Расходы' | 'Налоги и взносы' | 'Прочее'
  /** Нужен ли контрагент-получатель (иначе получатель подставляется/необязателен). */
  needsPayee: boolean
  /** По умолчанию учитывать в расходах УСН (Доходы−Расходы). */
  taxableDefault: boolean
}

/** Справочник типов операций платёжки. Порядок = порядок в выпадающем списке. */
export const PAYMENT_KINDS: Record<PaymentKind, PaymentKindMeta> = {
  contractor: { label: 'Оплата поставщику / контрагенту', group: 'Расходы', needsPayee: true, taxableDefault: true },
  supplier_advance: { label: 'Аванс поставщику', group: 'Расходы', needsPayee: true, taxableDefault: false },
  customer_refund: { label: 'Возврат покупателю', group: 'Расходы', needsPayee: true, taxableDefault: false },
  salary: { label: 'Выплата зарплаты', group: 'Расходы', needsPayee: false, taxableDefault: true },
  accountable: { label: 'Выдача под отчёт', group: 'Расходы', needsPayee: false, taxableDefault: false },
  ens: { label: 'Налоги и взносы (ЕНС)', group: 'Налоги и взносы', needsPayee: false, taxableDefault: false },
  injury: { label: 'Взносы на травматизм (СФР)', group: 'Налоги и взносы', needsPayee: false, taxableDefault: false },
  transfer: { label: 'Перевод между своими счетами', group: 'Прочее', needsPayee: false, taxableDefault: false },
  personal: { label: 'Личные нужды ИП', group: 'Прочее', needsPayee: false, taxableDefault: false },
  loan_interest: { label: 'Проценты по кредиту', group: 'Прочее', needsPayee: true, taxableDefault: false },
  loan_repay: { label: 'Возврат кредита / займа', group: 'Прочее', needsPayee: true, taxableDefault: false },
  other: { label: 'Прочее списание', group: 'Прочее', needsPayee: false, taxableDefault: false },
}

/** Совместимость: словарь подписей (использовался до справочника PAYMENT_KINDS). */
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = Object.fromEntries(
  Object.entries(PAYMENT_KINDS).map(([k, v]) => [k, v.label])
) as Record<PaymentKind, string>

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
  vat?: string // ставка НДС в платеже: 'none' | '5' | '7' | '10' | '20' | '22'
  taxable?: boolean // учитывать в расходах УСН (после оплаты)
  planDate?: string // когда заплатить (план), YYYY-MM-DD
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
