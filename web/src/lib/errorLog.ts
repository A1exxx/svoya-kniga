/**
 * Локальный журнал ошибок рантайма — чтобы отслеживать баги и проще поддерживать приложение.
 * Ловит window.error, unhandledrejection и React-ошибки (через ErrorBoundary). Хранится локально
 * (кольцевой буфер). Виден в «Администрирование → Диагностика»; можно выгрузить файл для разбора.
 */

export type ErrorKind = 'error' | 'promise' | 'react' | 'manual'

export interface ErrorLogEntry {
  id: string
  at: string // ISO
  kind: ErrorKind
  message: string
  stack?: string
  where?: string // маршрут (location.hash) в момент ошибки
}

const KEY = 'svoyakniga.errorlog.v1'
const MAX = 50
export const APP_VERSION = '1.0 (локальная сборка)'

function makeId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'e-' + Math.floor(performance.now() * 1000).toString(36)
  }
}
const trunc = (s: string | undefined, n: number): string | undefined =>
  s == null ? undefined : s.length > n ? s.slice(0, n) + '…' : s

export function getErrorLog(): ErrorLogEntry[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || '[]') as ErrorLogEntry[]) || []
  } catch {
    return []
  }
}

export function logError(e: { kind: ErrorKind; message: string; stack?: string; where?: string }): void {
  // Логирование НИКОГДА не должно мешать приложению — всё в try/catch.
  try {
    const entry: ErrorLogEntry = {
      id: makeId(),
      at: new Date().toISOString(),
      kind: e.kind,
      message: trunc(e.message, 500) || '(без сообщения)',
      stack: trunc(e.stack, 2000),
      where: e.where,
    }
    const list = [entry, ...getErrorLog()].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* игнорируем сбой самого логгера */
  }
}

export function clearErrorLog(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

let installed = false
/** Глобальные перехватчики ошибок. Вызывать один раз при старте (main.tsx). */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (ev) => {
    const err = ev.error as Error | undefined
    console.error('[svoyakniga] ошибка:', err || ev.message)
    logError({ kind: 'error', message: ev.message || String(err), stack: err?.stack, where: location.hash })
  })
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason as { message?: string; stack?: string } | undefined
    console.error('[svoyakniga] необработанное отклонение промиса:', ev.reason)
    logError({ kind: 'promise', message: r?.message || String(ev.reason), stack: r?.stack, where: location.hash })
  })
}

/** Текст диагностики для выгрузки в файл (передать в поддержку/разработчику). */
export function buildDiagnostics(): string {
  const info = {
    app: 'СвояКнига',
    version: APP_VERSION,
    generatedAt: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    url: typeof location !== 'undefined' ? location.href : '',
    errors: getErrorLog(),
  }
  return JSON.stringify(info, null, 2)
}
