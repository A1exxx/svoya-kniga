/**
 * Синхронизация рабочего стола с сервером. Переиспользует проверенные
 * exportBackup()/importBackup() (тот же формат, что локальная резервная копия):
 * весь кабинет = Record<ключ localStorage, значение>.
 */
import { exportBackup, importBackup } from './storage/storeAdmin'

/** Собрать весь локальный кабинет (все ключи svoyakniga.* кроме служебных). */
export function collectLocal(): Record<string, string> {
  return exportBackup().data
}

/** Применить пришедшие с сервера данные поверх локального хранилища (replace). */
export function applyServerData(data: Record<string, string>): void {
  importBackup(JSON.stringify({ app: 'svoyakniga', version: 1, data }), 'replace')
}

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0
  return h.toString(36) + ':' + s.length
}

/** Отпечаток локального состояния — чтобы не пушить, если ничего не менялось. */
export function localHash(): string {
  return djb2(JSON.stringify(collectLocal()))
}

/** Есть ли локально непустые данные (для решения «первый вход — залить локальное наверх»). */
export function hasLocalData(): boolean {
  return Object.keys(collectLocal()).length > 0
}
