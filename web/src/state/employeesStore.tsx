import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOrg } from './orgStore'

/** Сотрудник в штате организации (для расчётов и отчётности). */
export interface Employee {
  id: string
  fio: string
  position: string
  /** Оклад в месяц (гросс) */
  salary: number
  /** Детей для стандартного вычета */
  children: number
  /** Страховой стаж, лет (ручное значение / override) */
  stazhYears: number
  /** Как определять стаж: авто из даты приёма или вручную (по умолчанию auto) */
  stazhMode?: 'auto' | 'manual'
  /** Прежний стаж в месяцах (добавляется к авто-стажу) */
  stazhPriorMonths?: number
  /** Дата приёма на работу (для ЕФС-1 и авто-стажа) */
  hireDate: string // YYYY-MM-DD
  /** Дата увольнения (если уволен) */
  dismissalDate?: string // YYYY-MM-DD
  /** День выплаты аванса (1–31), для уведомлений/отображения */
  advanceDay?: number
  /** Аванс, % от оклада (0 = без разбивки на аванс/расчёт) */
  advancePercent?: number
  /** Заработок по годам (для баз отпускных/больничных) */
  earningsByYear?: Record<number, number>
  /** ИП в реестре МСП — льготный тариф взносов */
  msp: boolean
  // Личные данные (для печатных форм карточки)
  snils?: string
  passport?: string
  address?: string
  birthDate?: string // YYYY-MM-DD
}

const KEY = 'svoyakniga.employees.v1'
type Store = Record<string, Employee[]>

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'emp-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

const EMP_DEFAULTS: Omit<Employee, 'id'> = {
  fio: '',
  position: '',
  salary: 0,
  children: 0,
  stazhYears: 0,
  stazhMode: 'auto',
  stazhPriorMonths: 0,
  hireDate: '',
  advanceDay: 25,
  advancePercent: 0,
  earningsByYear: {},
  msp: true,
}

function load(): Store {
  try {
    const raw = (JSON.parse(localStorage.getItem(KEY) || '{}') as Store) || {}
    // Бэкфилл дефолтов для записей из старой схемы (children, stazhMode, advance* и т.п.).
    for (const k of Object.keys(raw)) {
      raw[k] = (raw[k] ?? []).map((e) => ({ ...EMP_DEFAULTS, ...e }))
    }
    return raw
  } catch {
    return {}
  }
}

interface EmployeesCtxValue {
  employees: Employee[]
  addEmployee: () => string
  updateEmployee: (id: string, patch: Partial<Employee>) => void
  removeEmployee: (id: string) => void
}

const Ctx = createContext<EmployeesCtxValue | null>(null)

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const { activeOrgId } = useOrg()
  const [store, setStore] = useState<Store>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch {
      /* ignore */
    }
  }, [store])

  const employees = store[activeOrgId] ?? []

  const addEmployee = (): string => {
    const id = makeId()
    const e: Employee = {
      id,
      fio: '',
      position: '',
      salary: 60000,
      children: 0,
      stazhYears: 5,
      stazhMode: 'auto',
      stazhPriorMonths: 0,
      hireDate: '',
      advanceDay: 25,
      advancePercent: 0,
      earningsByYear: {},
      msp: true,
    }
    setStore((s) => ({ ...s, [activeOrgId]: [...(s[activeOrgId] ?? []), e] }))
    return id
  }

  const updateEmployee = (id: string, patch: Partial<Employee>) =>
    setStore((s) => ({
      ...s,
      [activeOrgId]: (s[activeOrgId] ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))

  const removeEmployee = (id: string) =>
    setStore((s) => ({ ...s, [activeOrgId]: (s[activeOrgId] ?? []).filter((e) => e.id !== id) }))

  return (
    <Ctx.Provider value={{ employees, addEmployee, updateEmployee, removeEmployee }}>
      {children}
    </Ctx.Provider>
  )
}

export function useEmployees(): EmployeesCtxValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useEmployees must be used within EmployeesProvider')
  return ctx
}
