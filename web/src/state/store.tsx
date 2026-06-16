import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_YEAR, type UsnObject } from '../lib/taxcore'

export interface TaxInputs {
  year: number
  usnObject: UsnObject
  income: number
  expenses: number
  hasEmployees: boolean
}

const DEFAULTS: TaxInputs = {
  year: DEFAULT_YEAR,
  usnObject: 'income',
  income: 2_400_000,
  expenses: 0,
  hasEmployees: false,
}

const KEY = 'svoyakniga.inputs.v1'

function load(): TaxInputs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<TaxInputs>) }
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULTS
}

interface TaxCtxValue {
  inputs: TaxInputs
  setInputs: (patch: Partial<TaxInputs>) => void
  reset: () => void
}

const TaxCtx = createContext<TaxCtxValue | null>(null)

export function TaxProvider({ children }: { children: ReactNode }) {
  const [inputs, setState] = useState<TaxInputs>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(inputs))
    } catch {
      /* ignore */
    }
  }, [inputs])

  const setInputs = (patch: Partial<TaxInputs>) => setState((s) => ({ ...s, ...patch }))
  const reset = () => setState(DEFAULTS)

  return <TaxCtx.Provider value={{ inputs, setInputs, reset }}>{children}</TaxCtx.Provider>
}

export function useTaxInputs(): TaxCtxValue {
  const ctx = useContext(TaxCtx)
  if (!ctx) throw new Error('useTaxInputs must be used within TaxProvider')
  return ctx
}
