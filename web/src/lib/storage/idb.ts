/**
 * Минимальное key-value хранилище в IndexedDB как durable-зеркало localStorage.
 *
 * Данные приложения остаются в localStorage (синхронное чтение нужно React при старте),
 * но КАЖДАЯ запись зеркалируется в IndexedDB. Это даёт:
 *   • больше места (снимки/логотипы могут переполнить ~5 МБ localStorage);
 *   • восстановление: если localStorage очистили, при старте поднимаем данные из IDB.
 *
 * Полная миграция «единственный источник = IndexedDB + Repository + сервер» — следующий
 * этап (вместе с переносом на бэкенд). См. docs/STORAGE-AND-AUDIT.md.
 */

const DB_NAME = 'svoyakniga'
const STORE = 'kv'
const PREFIX = 'svoyakniga.'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

/** Зеркалировать значение в IDB (fire-and-forget; об ошибке предупреждаем в консоль). */
export async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => {
        console.warn('[svoyakniga] IDB-запись не удалась:', key)
        resolve()
      }
      tx.onabort = () => resolve()
    })
  } catch {
    /* ignore */
  }
}

/**
 * Полностью переписать зеркало IDB набором data-ключей. Вызывать после отката снимка и
 * импорта резервной копии — иначе зеркало хранит ДО-откатное состояние и при очистке
 * localStorage `recoverFromIdb` вернёт неверные данные.
 */
export async function idbReplaceAll(data: Record<string, string>): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      store.clear()
      for (const [k, v] of Object.entries(data)) store.put(v, k)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch {
    /* ignore */
  }
}

/** Прочитать все зеркалированные ключи приложения. */
export async function idbGetAll(): Promise<Record<string, string>> {
  const db = await openDb()
  if (!db) return {}
  try {
    return await new Promise<Record<string, string>>((resolve) => {
      const out: Record<string, string> = {}
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const req = store.openCursor()
      req.onsuccess = () => {
        const cur = req.result
        if (cur) {
          if (typeof cur.key === 'string' && cur.key.startsWith(PREFIX)) out[cur.key] = String(cur.value)
          cur.continue()
        } else {
          resolve(out)
        }
      }
      req.onerror = () => resolve(out)
    })
  } catch {
    return {}
  }
}

/**
 * Восстановление при старте: если в localStorage нет какого-то ключа, а в IDB он есть —
 * поднимаем его (данные не теряются после очистки localStorage). Вызывать до рендера.
 */
export async function recoverFromIdb(): Promise<number> {
  try {
    const mirror = await idbGetAll()
    let restored = 0
    for (const [k, v] of Object.entries(mirror)) {
      if (localStorage.getItem(k) == null) {
        localStorage.setItem(k, v)
        restored++
      }
    }
    return restored
  } catch {
    return 0
  }
}

/** Последняя ошибка записи в localStorage (для баннера «хранилище переполнено»). */
export let lastStorageError: string | null = null

/** Записать в localStorage и зеркало IDB одновременно. */
export function persistKey(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    // Квота переполнена — данные критичны, не молчим: лог + событие для баннера в UI.
    lastStorageError = (e as Error)?.name || 'StorageError'
    console.error('[svoyakniga] Не удалось сохранить в localStorage:', key, e)
    try {
      window.dispatchEvent(new CustomEvent('svk:storage-error', { detail: { key, error: lastStorageError } }))
    } catch {
      /* нет window */
    }
  }
  void idbSet(key, value)
}
