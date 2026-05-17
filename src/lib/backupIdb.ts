/** Имя базы IndexedDB для кэша файла *.backup и метаданных. */
export const CACHE_INDEXED_DB = 'vocabdesk-cache-v1'
/** Прежнее имя (до ребренда) — только для однократной миграции. */
const LEGACY_CACHE_INDEXED_DB = 'myreword-local-v1'

const STORE = 'kv'

function openNamedDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbNamedGet<T>(dbName: string, key: string): Promise<T | undefined> {
  const db = await openNamedDb(dbName)
  const val = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return val
}

async function legacyClearIfExists(): Promise<void> {
  try {
    const db = await openNamedDb(LEGACY_CACHE_INDEXED_DB)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    /* старой базы может не быть */
  }
}

let migrationPromise: Promise<void> | null = null

/** Перед первым чтением кэша: перенести дамп из старой IndexedDB при необходимости. */
export function ensureBackupCacheMigrated(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const existingBuf = await idbNamedGet<ArrayBuffer>(CACHE_INDEXED_DB, IDB_KEYS.backupBuffer)
      if (existingBuf) return

      const legacyBuf = await idbNamedGet<ArrayBuffer>(LEGACY_CACHE_INDEXED_DB, IDB_KEYS.backupBuffer)
      if (!legacyBuf) return

      const legacyMeta = await idbNamedGet<BackupMeta>(LEGACY_CACHE_INDEXED_DB, IDB_KEYS.backupMeta)
      await idbPut(IDB_KEYS.backupBuffer, legacyBuf)
      if (legacyMeta) await idbPut(IDB_KEYS.backupMeta, legacyMeta)
    })()
  }
  return migrationPromise
}

function openDb(): Promise<IDBDatabase> {
  return openNamedDb(CACHE_INDEXED_DB)
}

export async function idbPut(key: string, value: unknown) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  const val = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return val
}

export async function idbDelete(key: string) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function idbClearAll() {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
  await legacyClearIfExists()
}

export interface BackupMeta {
  name: string
  savedAt: number
}

export const IDB_KEYS = {
  backupBuffer: 'backupBuffer',
  backupMeta: 'backupMeta',
} as const
