import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_YEAR, type UsnObject } from '../lib/taxcore'
import { persistKey } from '../lib/storage/idb'
import { logChange, diffFields } from '../lib/storage/storeAdmin'

const orgLabel = (o: { name?: string; fio?: string; inn?: string }) =>
  o.name || o.fio || (o.inn ? `ИП ${o.inn}` : 'ИП')

/**
 * Выбранный режим НДС для ИП на УСН. `auto` — определять по доходу (как раньше);
 * остальные — явный выбор бухгалтера, который применяется сквозь всё приложение
 * (счета, декларация НДС, книга продаж). `general` = общая ставка года (20% до 2026, 22% с 2026).
 */
export type OrgVatMode = 'auto' | 'none' | 'rate5' | 'rate7' | 'rate10' | 'general'

/** Система налогообложения: УСН (упрощёнка) или ОСНО (общая — НДФЛ 13/15% + НДС). */
export type TaxSystem = 'usn' | 'osno'

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
  oktmo: string // код ОКТМО — нужен в уведомлениях ЕНС / КНД 1110355
  okpo: string // код ОКПО
  taxOfficeCode: string // код налоговой инспекции (КодНО в XML-формах ФНС)
  phone: string // контактный телефон
  email: string // контактный e-mail (печатается в шапке счёта)
  // Банк
  bankAccount: string
  bik: string
  bankName: string
  corrAccount: string // корр. счёт банка (Сч. № банка в платёжке/счёте)
  // Электронная подпись (КЭП)
  espOwner: string // владелец/серийный номер сертификата
  espValidTo: string // срок действия КЭП, YYYY-MM-DD
  // Брендинг для печатных форм (data URL изображения)
  logo?: string
  signature?: string
  stamp?: string
  // Система налогообложения
  taxSystem: TaxSystem // 'usn' (упрощёнка) или 'osno' (общая система)
  usnObject: UsnObject
  ausn: boolean // признак АУСН (автоматизированная УСН)
  tradeFee: boolean // плательщик торгового сбора
  regionalRate: number | null // ставка в %, null = базовая из параметров
  hasEmployees: boolean
  vat: boolean
  vatMode: OrgVatMode // выбранная ставка/режим НДС (применяется в счетах и декларации)
  // Рабочие финансы (для расчёта)
  year: number
  income: number
  expenses: number
  openingBalance: number // начальный остаток на счету (для «Остаток денег» в «Деньгах»)
  assignee: string // ответственный бухгалтер (имя/email) — режим бухфирмы
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
    oktmo: '',
    okpo: '',
    taxOfficeCode: '',
    phone: '',
    email: '',
    bankAccount: '',
    bik: '',
    bankName: '',
    corrAccount: '',
    espOwner: '',
    espValidTo: '',
    taxSystem: 'usn',
    usnObject: 'income',
    ausn: false,
    tradeFee: false,
    regionalRate: null,
    hasEmployees: false,
    vat: false,
    vatMode: 'auto',
    year: DEFAULT_YEAR,
    income: 2_400_000,
    expenses: 0,
    openingBalance: 0,
    assignee: '',
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
        // Бэкфилл новых полей (oktmo, vatMode и т.п.) для ранее сохранённых ИП.
        const base = demoOrg()
        const orgs = p.orgs.map((o) => ({ ...base, ...o }))
        const activeOrgId = orgs.some((o) => o.id === p.activeOrgId) ? p.activeOrgId : orgs[0].id
        return { orgs, activeOrgId }
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
    persistKey(KEY, JSON.stringify({ orgs, activeOrgId }))
  }, [orgs, activeOrgId])

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0]

  const setActiveOrgId = (id: string) => setState((s) => ({ ...s, activeOrgId: id }))

  const addOrg = () => {
    logChange('ИП', 'create', 'Новый ИП')
    setState((s) => {
      const o = blankOrg()
      return { orgs: [...s.orgs, o], activeOrgId: o.id }
    })
  }

  const updateOrg = (id: string, patch: Partial<Org>) => {
    const old = orgs.find((o) => o.id === id)
    if (old) {
      const d = diffFields(old, patch)
      if (d) logChange('ИП', 'update', orgLabel(old), d)
    }
    setState((s) => ({ ...s, orgs: s.orgs.map((o) => (o.id === id ? { ...o, ...patch } : o)) }))
  }

  const updateActiveOrg = (patch: Partial<Org>) => updateOrg(activeOrgId, patch)

  const removeOrg = (id: string) => {
    const old = orgs.find((o) => o.id === id)
    if (old && orgs.length > 1) logChange('ИП', 'delete', orgLabel(old))
    setState((s) => {
      if (s.orgs.length <= 1) return s // не удаляем последнюю
      const orgs = s.orgs.filter((o) => o.id !== id)
      const activeOrgId = s.activeOrgId === id ? orgs[0].id : s.activeOrgId
      return { orgs, activeOrgId }
    })
  }

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
