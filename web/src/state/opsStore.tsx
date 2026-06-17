import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOrg } from './orgStore'
import { persistKey } from '../lib/storage/idb'
import { logChange, diffFields } from '../lib/storage/storeAdmin'

/** Хозяйственная операция (доход/расход) для КУДиР и расчёта. */
export interface Operation {
  id: string
  date: string // YYYY-MM-DD
  kind: 'income' | 'expense'
  amount: number
  counterparty: string
  doc: string // № первичного документа
  note: string
  taxable: boolean // учитывать в налоге УСН / КУДиР
}

const KEY = 'svoyakniga.ops.v1'
type Store = Record<string, Operation[]> // orgId -> операции

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'op-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

function load(): Store {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || '{}') as Store) || {}
  } catch {
    return {}
  }
}

interface OpsCtxValue {
  ops: Operation[] // операции активной организации
  addOp: (op: Omit<Operation, 'id'>) => string
  updateOp: (id: string, patch: Partial<Operation>) => void
  removeOp: (id: string) => void
}

const OpsCtx = createContext<OpsCtxValue | null>(null)

export function OpsProvider({ children }: { children: ReactNode }) {
  const { activeOrgId } = useOrg()
  const [store, setStore] = useState<Store>(load)

  useEffect(() => {
    persistKey(KEY, JSON.stringify(store))
  }, [store])

  const ops = store[activeOrgId] ?? []
  const opLabel = (o: Operation) =>
    `${o.kind === 'income' ? 'приход' : 'расход'} ${o.amount} ₽${o.counterparty ? ` (${o.counterparty})` : ''}`

  const addOp = (op: Omit<Operation, 'id'>): string => {
    const id = makeId()
    logChange('Операция', 'create', opLabel({ ...op, id }))
    setStore((s) => ({ ...s, [activeOrgId]: [...(s[activeOrgId] ?? []), { ...op, id }] }))
    return id
  }

  const updateOp = (id: string, patch: Partial<Operation>) => {
    const old = ops.find((o) => o.id === id)
    if (old) {
      const d = diffFields(old, patch)
      if (d) logChange('Операция', 'update', opLabel(old), d)
    }
    setStore((s) => ({
      ...s,
      [activeOrgId]: (s[activeOrgId] ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }))
  }

  const removeOp = (id: string) => {
    const old = ops.find((o) => o.id === id)
    if (old) logChange('Операция', 'delete', opLabel(old))
    setStore((s) => ({ ...s, [activeOrgId]: (s[activeOrgId] ?? []).filter((o) => o.id !== id) }))
  }

  return <OpsCtx.Provider value={{ ops, addOp, updateOp, removeOp }}>{children}</OpsCtx.Provider>
}

export function useOps(): OpsCtxValue {
  const ctx = useContext(OpsCtx)
  if (!ctx) throw new Error('useOps must be used within OpsProvider')
  return ctx
}
