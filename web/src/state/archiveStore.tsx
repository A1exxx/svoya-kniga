import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useOrg, type Org } from './orgStore'
import type { Operation } from './opsStore'
import type { Doc } from './docsStore'
import type { Employee } from './employeesStore'
import { persistKey } from '../lib/storage/idb'

/** Что можно повторно открыть/распечатать из архива. */
export type ArchiveDocKind = 'declaration' | 'ens' | 'vat' | 'payroll' | null

/**
 * Снимок ВХОДНЫХ данных на момент сдачи. Храним входы (org/ops/docs), а не результат расчёта:
 * пересчёт из них детерминирован и не зависит от Decimal-сериализации. Это гарантирует, что
 * повторно открытая форма покажет ровно те цифры, что были поданы (а не текущие).
 */
export interface ArchiveSnapshot {
  org: Org
  ops: Operation[]
  docs: Doc[]
  employees: Employee[]
}

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
  /** Снимок входных данных на момент сдачи (для верной повторной печати). Опц. — старые записи без него. */
  snapshot?: ArchiveSnapshot
  /** Построчное уведомление (КНД 1110355) из «Полезных документов» — для повторной печати. */
  notificationRow?: { kbk: string; oktmo: string; period: string; year: number; amount: number; title: string }
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
    persistKey(KEY, JSON.stringify(store))
  }, [store])

  const records = store[activeOrgId] ?? []
  const archivedKeys = new Set(records.map((r) => r.taskKey))

  const addArchive = (rec: Omit<ArchiveRecord, 'id'>) =>
    setStore((s) => ({
      ...s,
      // Ограничиваем рост архива (со снимками каждая запись весит — не даём раздуть хранилище).
      [activeOrgId]: [{ id: makeId(), ...rec }, ...(s[activeOrgId] ?? [])].slice(0, 300),
    }))

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

/**
 * Снимок без тяжёлых base64-картинок org (logo/signature/stamp): они не нужны для повторной
 * печати декларации/уведомления, но раздувают каждую запись Архива на сотни КБ → быстрее упирается
 * в квоту localStorage. Для записей-уведомлений ops/docs/employees можно передать пустыми.
 */
export function makeArchiveSnapshot(
  org: Org,
  ops: Operation[] = [],
  docs: Doc[] = [],
  employees: Employee[] = []
): ArchiveSnapshot {
  const lean = { ...org }
  delete (lean as Partial<Org>).logo
  delete (lean as Partial<Org>).signature
  delete (lean as Partial<Org>).stamp
  return { org: lean, ops, docs, employees }
}

/** Определить, что за документ стоит за задачей календаря (для повторной печати). */
export function archiveDocKindFromTitle(title: string): ArchiveDocKind {
  if (title.includes('Декларация') && title.includes('НДС')) return 'vat'
  if (title.includes('Декларация')) return 'declaration'
  if (title.includes('Уведомление')) return 'ens'
  if (/6-НДФЛ|РСВ|ЕФС|персонифиц|зарплат/i.test(title)) return 'payroll'
  return null
}
