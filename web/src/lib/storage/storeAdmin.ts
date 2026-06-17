/**
 * Локальное хранилище: снимки (снапшоты) с откатом, резервные копии (экспорт/импорт),
 * журнал действий и оценка занятого места.
 *
 * Сейчас данные лежат в localStorage по ключам `svoyakniga.*`. Снимок копирует ВСЕ
 * data-ключи (кроме токена/служебных), что даёт надёжный откат и бэкап без потери данных.
 *
 * Полный переход на IndexedDB + per-field журнал и серверная синхронизация — следующий
 * этап (он связан с переносом на сервер). См. docs/STORAGE-AND-AUDIT.md.
 */

import { idbReplaceAll } from './idb'

const PREFIX = 'svoyakniga.'
const SNAPSHOTS_KEY = 'svoyakniga.snapshots.v1'
const AUDIT_KEY = 'svoyakniga.audit.v1'
const TOKEN_KEY = 'svoyakniga.dadata.token'
const AUTO_KEY = 'svoyakniga.lastAutoSnapshot'
const EXCLUDE = new Set([SNAPSHOTS_KEY, AUDIT_KEY, TOKEN_KEY, AUTO_KEY])
const MAX_SNAPSHOTS = 20
const MAX_AUDIT = 500

export interface Snapshot {
  id: string
  label: string
  createdAt: string // ISO datetime
  data: Record<string, string> // ключ → сырое значение localStorage
}

export interface AuditEntry {
  id: string
  at: string
  action: string
  detail: string
}

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 's-' + Math.floor(performance.now() * 1000).toString(36)
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function dataKeys(): string[] {
  return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX) && !EXCLUDE.has(k))
}

// ---------- Журнал ----------

export function listAudit(): AuditEntry[] {
  try {
    return (JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]') as AuditEntry[]) || []
  } catch {
    return []
  }
}

export function logAudit(action: string, detail = ''): void {
  const list = listAudit()
  list.unshift({ id: makeId(), at: nowIso(), action, detail })
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, MAX_AUDIT)))
  } catch {
    /* ignore */
  }
}

export function clearAudit(): void {
  localStorage.removeItem(AUDIT_KEY)
}

const FIELD_HIDE = new Set(['logo', 'signature', 'stamp', 'id', 'linkedOpId'])

function fmtVal(v: unknown): string {
  if (v == null || v === '') return '∅'
  if (typeof v === 'object') return '…'
  return String(v)
}

/** JSON.stringify, не бросающий исключение (циклы/несериализуемое → уникальный маркер). */
function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? 'undefined'
  } catch {
    return '<unserializable:' + String(v) + '>'
  }
}

/** Человеческий diff изменённых полей: «оклад 60000→80000; дети 0→1». Картинки/служебные скрываются. */
export function diffFields(before: object | undefined, patch: object): string {
  const b = (before ?? {}) as Record<string, unknown>
  const p = patch as Record<string, unknown>
  const parts: string[] = []
  for (const k of Object.keys(p)) {
    if (FIELD_HIDE.has(k)) {
      parts.push(`${k}: изменено`)
      continue
    }
    // safeStringify: сравнение значений не должно бросать исключение и срывать мутацию стора.
    if (safeStringify(b[k]) === safeStringify(p[k])) continue
    parts.push(`${k}: ${fmtVal(b[k])}→${fmtVal(p[k])}`)
  }
  return parts.join('; ')
}

/** Запись в журнал об изменении сущности (создание/правка/удаление по полям). */
export function logChange(
  entity: string,
  action: 'create' | 'update' | 'delete',
  label: string,
  detail = ''
): void {
  const a = action === 'create' ? 'Создание' : action === 'delete' ? 'Удаление' : 'Изменение'
  logAudit(`${a}: ${entity}`, detail ? `${label} — ${detail}` : label)
}

// ---------- Снимки ----------

export function listSnapshots(): Snapshot[] {
  try {
    return (JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]') as Snapshot[]) || []
  } catch {
    return []
  }
}

function saveSnapshots(list: Snapshot[]): void {
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(list.slice(0, MAX_SNAPSHOTS)))
  } catch {
    /* ignore (квота) */
  }
}

function captureData(): Record<string, string> {
  const data: Record<string, string> = {}
  for (const k of dataKeys()) {
    const v = localStorage.getItem(k)
    if (v != null) data[k] = v
  }
  return data
}

export function createSnapshot(label: string): Snapshot {
  const snap: Snapshot = { id: makeId(), label, createdAt: nowIso(), data: captureData() }
  saveSnapshots([snap, ...listSnapshots()])
  logAudit('Снимок создан', label)
  return snap
}

/** Восстановить снимок: текущее состояние сперва сохраняется как «перед откатом». */
export function restoreSnapshot(id: string): boolean {
  const snap = listSnapshots().find((s) => s.id === id)
  if (!snap) return false
  createSnapshot('Перед откатом (авто)')
  // Удаляем текущие data-ключи и пишем сохранённые.
  for (const k of dataKeys()) localStorage.removeItem(k)
  for (const [k, v] of Object.entries(snap.data)) localStorage.setItem(k, v)
  void idbReplaceAll(captureData()) // зеркало IDB → пост-откатное состояние (иначе вернёт старое)
  logAudit('Откат к снимку', `${snap.label} (${snap.createdAt})`)
  return true
}

export function deleteSnapshot(id: string): void {
  saveSnapshots(listSnapshots().filter((s) => s.id !== id))
  logAudit('Снимок удалён', id)
}

export function downloadSnapshot(id: string): void {
  const snap = listSnapshots().find((s) => s.id === id)
  if (!snap) return
  download(`snapshot-${snap.createdAt.slice(0, 10)}.json`, JSON.stringify(snap, null, 2))
}

/** Автоснимок не чаще раза в сутки (вызывать при запуске приложения). */
export function maybeAutoSnapshot(): void {
  try {
    const last = localStorage.getItem(AUTO_KEY)
    const todayStr = nowIso().slice(0, 10)
    if (last === todayStr) return
    if (dataKeys().length === 0) return
    createSnapshot('Автосохранение при запуске')
    localStorage.setItem(AUTO_KEY, todayStr)
  } catch {
    /* ignore */
  }
}

// ---------- Резервная копия (экспорт/импорт) ----------

export interface Backup {
  app: 'svoyakniga'
  version: 1
  exportedAt: string
  data: Record<string, string>
}

export function exportBackup(): Backup {
  return { app: 'svoyakniga', version: 1, exportedAt: nowIso(), data: captureData() }
}

export function downloadBackup(): void {
  download(`svoyakniga-backup-${nowIso().slice(0, 10)}.json`, JSON.stringify(exportBackup(), null, 2))
  logAudit('Экспорт резервной копии')
}

/** Импорт: replace — заменить всё, merge — дописать поверх существующего. */
export function importBackup(json: string, mode: 'replace' | 'merge'): { ok: boolean; message: string } {
  let backup: Backup
  try {
    backup = JSON.parse(json) as Backup
  } catch {
    return { ok: false, message: 'Файл не распознан (не JSON).' }
  }
  if (backup?.app !== 'svoyakniga' || !backup.data) {
    return { ok: false, message: 'Это не резервная копия СвояКнига.' }
  }
  createSnapshot('Перед импортом (авто)')
  if (mode === 'replace') {
    for (const k of dataKeys()) localStorage.removeItem(k)
  }
  for (const [k, v] of Object.entries(backup.data)) {
    if (k.startsWith(PREFIX) && !EXCLUDE.has(k)) localStorage.setItem(k, v)
  }
  void idbReplaceAll(captureData()) // синхронизируем зеркало IDB с импортированным состоянием
  logAudit('Импорт резервной копии', mode)
  return { ok: true, message: 'Резервная копия загружена. Перезагрузите приложение.' }
}

// ---------- Хранилище ----------

export function storageUsage(): { keys: number; bytes: number; items: { key: string; bytes: number }[] } {
  const items = dataKeys().map((k) => ({ key: k, bytes: (localStorage.getItem(k) || '').length }))
  const snapBytes = (localStorage.getItem(SNAPSHOTS_KEY) || '').length
  items.push({ key: SNAPSHOTS_KEY, bytes: snapBytes })
  const bytes = items.reduce((s, it) => s + it.bytes, 0)
  return { keys: items.length, bytes, items: items.sort((a, b) => b.bytes - a.bytes) }
}

function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
