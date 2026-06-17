import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOrg } from './orgStore'
import type { InnStatus } from '../lib/innLookup'

export type ContractorType = 'ul' | 'ip' | 'person'

/** Контрагент (покупатель/поставщик) в справочнике организации. */
export interface Contractor {
  id: string
  type: ContractorType
  name: string // наименование организации или ФИО
  inn: string
  kpp: string // только для юр. лиц
  address: string
  note: string
  status?: InnStatus // результат проверки по ИНН (действующий/ликвидирован/…)
  regDate?: string // дата регистрации (YYYY-MM-DD)
  checkedAt?: string // когда проверяли (YYYY-MM-DD)
}

export const CONTRACTOR_TYPE_LABEL: Record<ContractorType, string> = {
  ul: 'Юр. лицо',
  ip: 'ИП',
  person: 'Физ. лицо',
}

const KEY = 'svoyakniga.contractors.v1'
type Store = Record<string, Contractor[]> // orgId -> контрагенты

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'ctr-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

function load(): Store {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || '{}') as Store) || {}
  } catch {
    return {}
  }
}

interface ContractorsCtxValue {
  contractors: Contractor[]
  addContractor: () => string
  updateContractor: (id: string, patch: Partial<Contractor>) => void
  removeContractor: (id: string) => void
}

const Ctx = createContext<ContractorsCtxValue | null>(null)

export function ContractorsProvider({ children }: { children: ReactNode }) {
  const { activeOrgId } = useOrg()
  const [store, setStore] = useState<Store>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch {
      /* ignore */
    }
  }, [store])

  const contractors = store[activeOrgId] ?? []

  const addContractor = (): string => {
    const id = makeId()
    const c: Contractor = { id, type: 'ul', name: '', inn: '', kpp: '', address: '', note: '' }
    setStore((s) => ({ ...s, [activeOrgId]: [...(s[activeOrgId] ?? []), c] }))
    return id
  }

  const updateContractor = (id: string, patch: Partial<Contractor>) =>
    setStore((s) => ({
      ...s,
      [activeOrgId]: (s[activeOrgId] ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))

  const removeContractor = (id: string) =>
    setStore((s) => ({ ...s, [activeOrgId]: (s[activeOrgId] ?? []).filter((c) => c.id !== id) }))

  return (
    <Ctx.Provider value={{ contractors, addContractor, updateContractor, removeContractor }}>
      {children}
    </Ctx.Provider>
  )
}

export function useContractors(): ContractorsCtxValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useContractors must be used within ContractorsProvider')
  return ctx
}

/** Строка реквизитов покупателя для печатной формы счёта/акта. */
export function contractorDetails(c: Contractor): string {
  const parts: string[] = []
  if (c.inn) parts.push('ИНН ' + c.inn)
  if (c.kpp) parts.push('КПП ' + c.kpp)
  if (c.address) parts.push(c.address)
  return parts.join(', ')
}
