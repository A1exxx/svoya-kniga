import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOrg } from './orgStore'
import { persistKey } from '../lib/storage/idb'
import { logChange, diffFields } from '../lib/storage/storeAdmin'

/** Вид отпуска: очередной (оплачиваемый) / по уходу за ребёнком / без сохранения зарплаты. */
export type VacationType = 'regular' | 'childcare' | 'unpaid'

/** Событие отпуска сотрудника (период + вид). */
export interface VacationEvent {
  id: string
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
  type: VacationType
}

/** Событие больничного (период нетрудоспособности). */
export interface SickEvent {
  id: string
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
}

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
  /** День выплаты окончательной зарплаты (1–31) — уходит в задачи дашборда */
  salaryDay?: number
  /** Аванс, % от оклада (0 = без разбивки на аванс/расчёт) */
  advancePercent?: number
  /** Заработок по годам ПО МЕСЯЦАМ (12 значений янв..дек) — для баз отпускных/больничных */
  earningsByYear?: Record<number, number[]>
  /** Отработано рабочих дней по месяцам (12 значений янв..дек) на год; пусто = полный месяц */
  workedDaysByYear?: Record<number, number[]>
  /** Отпуска сотрудника (период + вид) */
  vacations?: VacationEvent[]
  /** Больничные сотрудника (периоды) */
  sickLeaves?: SickEvent[]
  /**
   * Начисления зарплаты ПО ФАКТУ: для каждого года — 12 флагов (начислен ли месяц).
   * Месяц без начисления НЕ показывается в «Зарплата по месяцам» (не заполняем вперёд).
   */
  accruedMonths?: Record<number, boolean[]>
  /** Выдача зарплаты по факту: 12 флагов на год — выплачена ли зарплата за месяц. */
  paidMonths?: Record<number, boolean[]>
  /**
   * Авто-учёт больничных и отпусков без оплаты в зарплате: при true рабочие дни месяца
   * уменьшаются на дни больничных/неоплачиваемых отпусков автоматически; при false — вручную.
   */
  autoSickVacation?: boolean
  /** Алименты: удерживать по исполнительному листу / соглашению */
  alimonyEnabled?: boolean
  /** Способ: доля от дохода (по числу детей) или твёрдая сумма */
  alimonyMode?: 'share' | 'fixed'
  /** Детей на алименты (1→1/4, 2→1/3, 3+→1/2) — для доли */
  alimonyChildren?: number
  /** Твёрдая сумма алиментов в месяц, ₽ */
  alimonyFixed?: number
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
  salaryDay: 10,
  advancePercent: 0,
  earningsByYear: {},
  vacations: [],
  sickLeaves: [],
  accruedMonths: {},
  paidMonths: {},
  autoSickVacation: false,
  alimonyEnabled: false,
  alimonyMode: 'share',
  alimonyChildren: 1,
  alimonyFixed: 0,
  msp: true,
}

/** Миграция заработка: старая схема (одно число на год) → массив 12 месяцев (число в декабрь). */
function migrateEarnings(e: Employee): Employee {
  const raw = e.earningsByYear
  if (!raw) return e
  const out: Record<number, number[]> = {}
  for (const [y, v] of Object.entries(raw)) {
    if (Array.isArray(v)) out[Number(y)] = v
    else out[Number(y)] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, Number(v) || 0] // годовое число → декабрь
  }
  return { ...e, earningsByYear: out }
}

function load(): Store {
  try {
    const raw = (JSON.parse(localStorage.getItem(KEY) || '{}') as Store) || {}
    // Бэкфилл дефолтов для записей из старой схемы (children, stazhMode, advance* и т.п.).
    for (const k of Object.keys(raw)) {
      raw[k] = (raw[k] ?? []).map((e) => migrateEarnings({ ...EMP_DEFAULTS, ...e }))
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
    persistKey(KEY, JSON.stringify(store))
  }, [store])

  const employees = store[activeOrgId] ?? []

  const addEmployee = (): string => {
    const id = makeId()
    const e: Employee = { ...EMP_DEFAULTS, id, salary: 60000, stazhYears: 5 }
    logChange('Сотрудник', 'create', 'Новый сотрудник')
    setStore((s) => ({ ...s, [activeOrgId]: [...(s[activeOrgId] ?? []), e] }))
    return id
  }

  const updateEmployee = (id: string, patch: Partial<Employee>) => {
    const old = employees.find((e) => e.id === id)
    if (old) {
      const d = diffFields(old, patch)
      if (d) logChange('Сотрудник', 'update', old.fio || 'сотрудник', d)
    }
    setStore((s) => ({
      ...s,
      [activeOrgId]: (s[activeOrgId] ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))
  }

  const removeEmployee = (id: string) => {
    const old = employees.find((e) => e.id === id)
    if (old) logChange('Сотрудник', 'delete', old.fio || 'сотрудник')
    setStore((s) => ({ ...s, [activeOrgId]: (s[activeOrgId] ?? []).filter((e) => e.id !== id) }))
  }

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
