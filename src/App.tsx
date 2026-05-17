import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Database } from 'sql.js'
import './App.css'
import { DictionaryView } from './components/DictionaryView'
import { LearnView } from './components/LearnView'
import { ProgressBrowseView } from './components/ProgressBrowseView'
import { UploadScreen } from './components/UploadScreen'
import { DataMenu } from './components/DataMenu'
import { ProgressProvider, useProgress } from './context/ProgressContext'
import { IDB_KEYS, ensureBackupCacheMigrated, idbGet, idbPut } from './lib/backupIdb'
import { loadProgress } from './lib/progressStorage'
import { listCategoryStats, openRewordDatabase } from './db/rewordDb'

type Tab = 'dictionary' | 'learn' | 'repeat' | 'learned' | 'newWords'

export default function App() {
  return (
    <ProgressProvider>
      <AppInner />
    </ProgressProvider>
  )
}

function AppInner() {
  const { importFromRewordBackupDb } = useProgress()
  const [db, setDb] = useState<Database | null>(null)
  const [backupBuffer, setBackupBuffer] = useState<ArrayBuffer | null>(null)
  const [busy, setBusy] = useState(false)
  const [hydrating, setHydrating] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('dictionary')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        await ensureBackupCacheMigrated()
        const buf = await idbGet<ArrayBuffer>(IDB_KEYS.backupBuffer)
        if (!buf) {
          setHydrating(false)
          return
        }
        const database = await openRewordDatabase(buf)
        setBackupBuffer(buf)
        setDb(database)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setHydrating(false)
      }
    })()
  }, [])

  /** Первый запуск: переносим прогресс из таблицы WORD файла бэкапа в локальный SRS (иначе прогресс в браузере остаётся пустым). */
  useEffect(() => {
    if (!db) return
    const snap = loadProgress()
    if (Object.keys(snap.words).length > 0) return
    importFromRewordBackupDb(db, 'mergeOverwrite')
  }, [db, importFromRewordBackupDb])

  const categories = useMemo(() => (db ? listCategoryStats(db) : []), [db])

  const handlePick = async (file: File) => {
    setBusy(true)
    setErr(null)
    try {
      const buf = await file.arrayBuffer()
      await idbPut(IDB_KEYS.backupBuffer, buf)
      await idbPut(IDB_KEYS.backupMeta, { name: file.name, savedAt: Date.now() })
      const database = await openRewordDatabase(buf)
      setBackupBuffer(buf)
      setDb(database)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const replaceBackup = useCallback(async (buffer: ArrayBuffer, meta: { name: string }) => {
    await idbPut(IDB_KEYS.backupBuffer, buffer)
    await idbPut(IDB_KEYS.backupMeta, { ...meta, savedAt: Date.now() })
    const database = await openRewordDatabase(buffer)
    setBackupBuffer(buffer)
    setDb(database)
  }, [])

  if (hydrating) {
    return (
      <div className="upload-screen">
        <div className="upload-card">
          <div className="muted">Загрузка кэша словаря из браузера…</div>
        </div>
      </div>
    )
  }

  if (!db) return <UploadScreen busy={busy} error={err} onPick={handlePick} />

  return (
    <div className="app">
      <header className="topbar">
        <nav className="tabs" aria-label="Разделы">
          <button type="button" className={tab === 'dictionary' ? 'active' : ''} onClick={() => setTab('dictionary')}>
            Словарь
          </button>
          <button type="button" className={tab === 'learn' ? 'active' : ''} onClick={() => setTab('learn')}>
            Учить
          </button>
          <button type="button" className={tab === 'repeat' ? 'active' : ''} onClick={() => setTab('repeat')}>
            Повторение
          </button>
          <button type="button" className={tab === 'learned' ? 'active' : ''} onClick={() => setTab('learned')}>
            Изученное
          </button>
          <button type="button" className={tab === 'newWords' ? 'active' : ''} onClick={() => setTab('newWords')}>
            Новое
          </button>
        </nav>
        <div className="topbar-right">
          <DataMenu backupBuffer={backupBuffer} onReplaceBackup={replaceBackup} />
        </div>
      </header>

      <main className="main">
        {tab === 'dictionary' ? (
          <DictionaryView
            db={db}
            categories={categories}
            selectedId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
          />
        ) : tab === 'learn' ? (
          <LearnView db={db} activeCategoryId={selectedCategoryId} />
        ) : tab === 'repeat' ? (
          <ProgressBrowseView db={db} mode="due_now" activeCategoryId={selectedCategoryId} />
        ) : tab === 'learned' ? (
          <ProgressBrowseView db={db} mode="learned_review" activeCategoryId={selectedCategoryId} />
        ) : (
          <ProgressBrowseView db={db} mode="new_words" activeCategoryId={selectedCategoryId} />
        )}
      </main>
    </div>
  )
}
