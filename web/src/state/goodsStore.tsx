import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOrg } from './orgStore'
import { persistKey } from '../lib/storage/idb'
import { logChange, diffFields } from '../lib/storage/storeAdmin'

export type GoodKind = 'service' | 'product'

/** Позиция номенклатуры (товар или услуга) в справочнике организации. */
export interface Good {
  id: string
  kind: GoodKind
  name: string
  unit: string // единица измерения (шт, ч, услуга, кг…)
  price: number
  note: string
}

export const GOOD_KIND_LABEL: Record<GoodKind, string> = {
  service: 'Услуга',
  product: 'Товар',
}

const KEY = 'svoyakniga.goods.v1'
type Store = Record<string, Good[]> // orgId -> номенклатура

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'good-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

function load(): Store {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || '{}') as Store) || {}
  } catch {
    return {}
  }
}

interface GoodsCtxValue {
  goods: Good[]
  addGood: () => string
  updateGood: (id: string, patch: Partial<Good>) => void
  removeGood: (id: string) => void
}

const Ctx = createContext<GoodsCtxValue | null>(null)

export function GoodsProvider({ children }: { children: ReactNode }) {
  const { activeOrgId } = useOrg()
  const [store, setStore] = useState<Store>(load)

  useEffect(() => {
    persistKey(KEY, JSON.stringify(store))
  }, [store])

  const goods = store[activeOrgId] ?? []

  const addGood = (): string => {
    const id = makeId()
    const g: Good = { id, kind: 'service', name: '', unit: 'усл.', price: 0, note: '' }
    logChange('Номенклатура', 'create', 'Новая позиция')
    setStore((s) => ({ ...s, [activeOrgId]: [...(s[activeOrgId] ?? []), g] }))
    return id
  }

  const updateGood = (id: string, patch: Partial<Good>) => {
    const old = goods.find((g) => g.id === id)
    if (old) {
      const d = diffFields(old, patch)
      if (d) logChange('Номенклатура', 'update', old.name || 'позиция', d)
    }
    setStore((s) => ({
      ...s,
      [activeOrgId]: (s[activeOrgId] ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }))
  }

  const removeGood = (id: string) => {
    const old = goods.find((g) => g.id === id)
    if (old) logChange('Номенклатура', 'delete', old.name || 'позиция')
    setStore((s) => ({ ...s, [activeOrgId]: (s[activeOrgId] ?? []).filter((g) => g.id !== id) }))
  }

  return (
    <Ctx.Provider value={{ goods, addGood, updateGood, removeGood }}>{children}</Ctx.Provider>
  )
}

export function useGoods(): GoodsCtxValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useGoods must be used within GoodsProvider')
  return ctx
}
