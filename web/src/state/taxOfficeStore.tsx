import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOrg } from './orgStore'
import type { ReconciliationKind } from '../lib/fns/gateway'

/** Запись сальдо ЕНС (вносится вручную из ЛК ФНС). */
export interface EnsBalanceEntry {
  id: string
  date: string // YYYY-MM-DD
  saldo: number // > 0 переплата, < 0 долг
  note: string
}

/** Запрос сверки с налоговой. */
export interface ReconRequest {
  id: string
  kind: ReconciliationKind
  requestedAt: string
  status: 'requested' | 'received'
  note: string
}

/** Письмо/требование от ФНС или СФР. */
export interface OfficeLetter {
  id: string
  authority: 'fns' | 'sfr'
  type: string // требование / уведомление / письмо
  date: string
  subject: string
  deadline: string // срок ответа (YYYY-MM-DD) или ''
  status: 'new' | 'in_progress' | 'answered'
  body: string
}

interface TaxOfficeData {
  balances: EnsBalanceEntry[]
  recons: ReconRequest[]
  letters: OfficeLetter[]
}

const KEY = 'svoyakniga.taxoffice.v1'
type Store = Record<string, TaxOfficeData>

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'to-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

function load(): Store {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || '{}') as Store) || {}
  } catch {
    return {}
  }
}

const EMPTY: TaxOfficeData = { balances: [], recons: [], letters: [] }

interface TaxOfficeCtxValue {
  data: TaxOfficeData
  addBalance: (e: Omit<EnsBalanceEntry, 'id'>) => void
  removeBalance: (id: string) => void
  addRecon: (kind: ReconciliationKind, note: string) => void
  setReconStatus: (id: string, status: ReconRequest['status']) => void
  removeRecon: (id: string) => void
  addLetter: (l: Omit<OfficeLetter, 'id'>) => void
  updateLetter: (id: string, patch: Partial<OfficeLetter>) => void
  removeLetter: (id: string) => void
}

const Ctx = createContext<TaxOfficeCtxValue | null>(null)

export function TaxOfficeProvider({ children }: { children: ReactNode }) {
  const { activeOrgId } = useOrg()
  const [store, setStore] = useState<Store>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch {
      /* ignore */
    }
  }, [store])

  const data = store[activeOrgId] ?? EMPTY

  const patchData = (fn: (d: TaxOfficeData) => TaxOfficeData) =>
    setStore((s) => ({ ...s, [activeOrgId]: fn(s[activeOrgId] ?? EMPTY) }))

  const value: TaxOfficeCtxValue = {
    data,
    addBalance: (e) =>
      patchData((d) => ({ ...d, balances: [{ id: makeId(), ...e }, ...d.balances] })),
    removeBalance: (id) => patchData((d) => ({ ...d, balances: d.balances.filter((b) => b.id !== id) })),
    addRecon: (kind, note) =>
      patchData((d) => ({
        ...d,
        recons: [
          { id: makeId(), kind, requestedAt: new Date().toISOString().slice(0, 10), status: 'requested', note },
          ...d.recons,
        ],
      })),
    setReconStatus: (id, status) =>
      patchData((d) => ({ ...d, recons: d.recons.map((r) => (r.id === id ? { ...r, status } : r)) })),
    removeRecon: (id) => patchData((d) => ({ ...d, recons: d.recons.filter((r) => r.id !== id) })),
    addLetter: (l) => patchData((d) => ({ ...d, letters: [{ id: makeId(), ...l }, ...d.letters] })),
    updateLetter: (id, patch) =>
      patchData((d) => ({ ...d, letters: d.letters.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
    removeLetter: (id) => patchData((d) => ({ ...d, letters: d.letters.filter((x) => x.id !== id) })),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTaxOffice(): TaxOfficeCtxValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTaxOffice must be used within TaxOfficeProvider')
  return ctx
}
