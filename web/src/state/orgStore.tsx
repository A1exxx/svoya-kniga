import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_YEAR, type UsnObject } from '../lib/taxcore'

/** Организация (ИП): реквизиты + система налогообложения + рабочие финансы. */
export interface Org {
  id: string
  name: string // короткое имя для переключателя
  // Реквизиты
  inn: string
  ogrnip: string
  fio: string
  regDate: string // YYYY-MM-DD
  address: string
  okved: string
  // Банк
  bankAccount: string
  bik: string
  bankName: string
  // Брендинг для печатных форм (data URL изображения)
  logo?: string
  signature?: string
  stamp?: string
  // Система налогообложения
  usnObject: UsnObject
  regionalRate: number | null // ставка в %, null = базовая из параметров
  hasEmployees: boolean
  vat: boolean
  // Рабочие финансы (для расчёта)
  year: number
  income: number
  expenses: number
}

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'org-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

function demoOrg(): Org {
  return {
    id: 'demo',
    name: 'ИП Демонстрация',
    inn: '',
    ogrnip: '',
    fio: '',
    regDate: '',
    address: '',
    okved: '',
    bankAccount: '',
    bik: '',
    bankName: '',
    usnObject: 'income',
    regionalRate: null,
    hasEmployees: false,
    vat: false,
    year: DEFAULT_YEAR,
    income: 2_400_000,
    expenses: 0,
  }
}

function blankOrg(): Org {
  return {
    ...demoOrg(),
    id: makeId(),
    name: 'Новый ИП',
    income: 0,
  }
}

const KEY = 'svoyakniga.orgs.v2'

interface Persisted {
  orgs: Org[]
  activeOrgId: string
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Persisted
      if (p.orgs?.length) {
        const activeOrgId = p.orgs.some((o) => o.id === p.activeOrgId) ? p.activeOrgId : p.orgs[0].id
        return { orgs: p.orgs, activeOrgId }
      }
    }
  } catch {
    /* ignore */
  }
  const d = demoOrg()
  return { orgs: [d], activeOrgId: d.id }
}

interface OrgCtxValue {
  orgs: Org[]
  activeOrgId: string
  activeOrg: Org
  refreshTick: number
  setActiveOrgId: (id: string) => void
  addOrg: () => void
  updateOrg: (id: string, patch: Partial<Org>) => void
  updateActiveOrg: (patch: Partial<Org>) => void
  removeOrg: (id: string) => void
  forceRefresh: () => void
}

const OrgCtx = createContext<OrgCtxValue | null>(null)

export function OrgProvider({ children }: { children: ReactNode }) {
  const [{ orgs, activeOrgId }, setState] = useState<Persisted>(load)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ orgs, activeOrgId }))
    } catch {
      /* ignore */
    }
  }, [orgs, activeOrgId])

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0]

  const setActiveOrgId = (id: string) => setState((s) => ({ ...s, activeOrgId: id }))

  const addOrg = () =>
    setState((s) => {
      const o = blankOrg()
      return { orgs: [...s.orgs, o], activeOrgId: o.id }
    })

  const updateOrg = (id: string, patch: Partial<Org>) =>
    setState((s) => ({ ...s, orgs: s.orgs.map((o) => (o.id === id ? { ...o, ...patch } : o)) }))

  const updateActiveOrg = (patch: Partial<Org>) => updateOrg(activeOrgId, patch)

  const removeOrg = (id: string) =>
    setState((s) => {
      if (s.orgs.length <= 1) return s // не удаляем последнюю
      const orgs = s.orgs.filter((o) => o.id !== id)
      const activeOrgId = s.activeOrgId === id ? orgs[0].id : s.activeOrgId
      return { orgs, activeOrgId }
    })

  const forceRefresh = () => setRefreshTick((t) => t + 1)

  return (
    <OrgCtx.Provider
      value={{
        orgs,
        activeOrgId,
        activeOrg,
        refreshTick,
        setActiveOrgId,
        addOrg,
        updateOrg,
        updateActiveOrg,
        removeOrg,
        forceRefresh,
      }}
    >
      {children}
    </OrgCtx.Provider>
  )
}

export function useOrg(): OrgCtxValue {
  const ctx = useContext(OrgCtx)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
