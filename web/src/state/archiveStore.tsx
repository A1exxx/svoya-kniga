import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOrg } from './orgStore'

/** Что можно повторно открыть/распечатать из архива. */
export type ArchiveDocKind = 'declaration' | 'ens' | 'vat' | 'payroll' | null

/** Запись в архиве сданного — задача, отмеченная «Сдано». */
export interface ArchiveRecord {
  id: string
  taskKey: string // title|due — чтобы убрать сданную задачу из актуальных
  kind: 'payment' | 'report' | 'notification' | 'task'
  docKind: ArchiveDocKind // что перерисовать при открытии
  title: string
  period: string // напр. «2026» или дата
  dueDate: string // YYYY-MM-DD
  submittedAt: string // YYYY-MM-DD
  amount: number | null
}

const KEY = 'svoyakniga.archive.v1'
type Store = Record<string, ArchiveRecord[]>

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'arc-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

function load(): Store {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || '{}') as Store) || {}
  } catch {
    return {}
  }
}

interface ArchiveCtxValue {
  records: ArchiveRecord[]
  archivedKeys: Set<string>
  addArchive: (rec: Omit<ArchiveRecord, 'id'>) => void
  removeArchive: (id: string) => void
}

const Ctx = createContext<ArchiveCtxValue | null>(null)

export function ArchiveProvider({ children }: { children: ReactNode }) {
  const { activeOrgId } = useOrg()
  const [store, setStore] = useState<Store>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch {
      /* ignore */
    }
  }, [store])

  const records = store[activeOrgId] ?? []
  const archivedKeys = new Set(records.map((r) => r.taskKey))

  const addArchive = (rec: Omit<ArchiveRecord, 'id'>) =>
    setStore((s) => ({ ...s, [activeOrgId]: [{ id: makeId(), ...rec }, ...(s[activeOrgId] ?? [])] }))

  const removeArchive = (id: string) =>
    setStore((s) => ({ ...s, [activeOrgId]: (s[activeOrgId] ?? []).filter((r) => r.id !== id) }))

  return (
    <Ctx.Provider value={{ records, archivedKeys, addArchive, removeArchive }}>{children}</Ctx.Provider>
  )
}

export function useArchive(): ArchiveCtxValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useArchive must be used within ArchiveProvider')
  return ctx
}

/** Определить, что за документ стоит за задачей календаря (для повторной печати). */
export function archiveDocKindFromTitle(title: string): ArchiveDocKind {
  if (title.includes('Декларация') && title.includes('НДС')) return 'vat'
  if (title.includes('Декларация')) return 'declaration'
  if (title.includes('Уведомление')) return 'ens'
  if (/6-НДФЛ|РСВ|ЕФС|персонифиц|зарплат/i.test(title)) return 'payroll'
  return null
}
