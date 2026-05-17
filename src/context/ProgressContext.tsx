import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Database } from 'sql.js'
import { applyGrade as srsApply } from '../lib/srs'
import { clearProgressStorage, loadProgress, saveProgress } from '../lib/progressStorage'
import type { Grade, ImportMode, ProgressSnapshot, UserPrefs } from '../lib/progressTypes'
import {
  extractRewordProgress,
  listDbWordIds,
  scheduleFromRewordRow,
} from '../lib/rewordSchedule'

export interface ProgressApi {
  snapshot: ProgressSnapshot
  revision: number
  refresh: () => void
  gradeWord: (wordId: number, grade: Grade) => void
  markWordMastered: (wordId: number) => void
  updatePrefs: (patch: Partial<UserPrefs>) => void
  importFromRewordBackupDb: (db: Database, mode: ImportMode) => number
  clearProgressOnly: () => void
}

const Ctx = createContext<ProgressApi | null>(null)

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ProgressSnapshot>(() => loadProgress())
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(() => {
    setSnapshot(loadProgress())
    setRevision((x) => x + 1)
  }, [])

  const gradeWord = useCallback((wordId: number, grade: Grade) => {
    const now = Date.now()
    setSnapshot((prev) => {
      const prevSched = prev.words[String(wordId)] ?? null
      const nextSched = srsApply(prevSched, grade, now, prev.prefs)
      const next: ProgressSnapshot = { ...prev, words: { ...prev.words, [String(wordId)]: nextSched } }
      saveProgress(next)
      return next
    })
    setRevision((x) => x + 1)
  }, [])

  const markWordMastered = useCallback((wordId: number) => {
    setSnapshot((prev) => {
      const key = String(wordId)
      const mastered = { ...(prev.mastered ?? {}), [key]: true as const }
      const next: ProgressSnapshot = { ...prev, mastered }
      saveProgress(next)
      return next
    })
    setRevision((x) => x + 1)
  }, [])

  const updatePrefs = useCallback((patch: Partial<UserPrefs>) => {
    setSnapshot((prev) => {
      const next: ProgressSnapshot = { ...prev, prefs: { ...prev.prefs, ...patch } }
      saveProgress(next)
      return next
    })
    setRevision((x) => x + 1)
  }, [])

  const importFromRewordBackupDb = useCallback((db: Database, mode: ImportMode): number => {
    const now = Date.now()
    const rows = extractRewordProgress(db)
    const valid = listDbWordIds(db)

    const prev = loadProgress()
    let words = { ...prev.words }
    let mastered = { ...(prev.mastered ?? {}) }
    let updated = 0

    if (mode === 'replaceAll') {
      words = {}
      mastered = {}
      for (const row of rows) {
        if (!valid.has(row.id)) continue
        words[String(row.id)] = scheduleFromRewordRow(row, now)
        updated++
      }
    } else if (mode === 'mergeMissing') {
      for (const row of rows) {
        if (!valid.has(row.id)) continue
        const key = String(row.id)
        if (words[key]) continue
        words[key] = scheduleFromRewordRow(row, now)
        updated++
      }
    } else {
      for (const row of rows) {
        if (!valid.has(row.id)) continue
        words[String(row.id)] = scheduleFromRewordRow(row, now)
        updated++
      }
      updated = rows.filter((r) => valid.has(r.id)).length
    }

    const next: ProgressSnapshot = { ...prev, words, mastered }
    saveProgress(next)
    setSnapshot(next)
    setRevision((x) => x + 1)
    return updated
  }, [])

  const clearProgressOnly = useCallback(() => {
    clearProgressStorage()
    refresh()
  }, [refresh])

  const api = useMemo(
    () => ({
      snapshot,
      revision,
      refresh,
      gradeWord,
      markWordMastered,
      updatePrefs,
      importFromRewordBackupDb,
      clearProgressOnly,
    }),
    [snapshot, revision, refresh, gradeWord, markWordMastered, updatePrefs, importFromRewordBackupDb, clearProgressOnly],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useProgress(): ProgressApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProgress: ProgressProvider отсутствует')
  return v
}
