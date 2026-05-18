import type { Database } from 'sql.js'
import { defineStore } from 'pinia'
import { applyGrade as srsApply } from '../lib/srs'
import { clearProgressStorage, loadProgress, saveProgress } from '../lib/progressStorage'
import type { Grade, ImportMode, ProgressSnapshot, UserPrefs } from '../lib/progressTypes'
import { appendWeakHit } from '../lib/weakWordLog'
import {
  extractRewordProgress,
  listDbWordIds,
  scheduleFromRewordRow,
} from '../lib/rewordSchedule'

export const useProgressStore = defineStore('progress', {
  state: (): { snapshot: ProgressSnapshot; revision: number } => ({
    snapshot: loadProgress(),
    revision: 0,
  }),
  actions: {
    refresh() {
      this.snapshot = loadProgress()
      this.revision += 1
    },
    gradeWord(wordId: number, grade: Grade) {
      const now = Date.now()
      const prev = this.snapshot
      const prevSched = prev.words[String(wordId)] ?? null
      const nextSched = srsApply(prevSched, grade, now, prev.prefs)
      let next: ProgressSnapshot = { ...prev, words: { ...prev.words, [String(wordId)]: nextSched } }
      next = appendWeakHit(next, wordId, grade)
      saveProgress(next)
      this.snapshot = next
      this.revision += 1
    },
    markWordMastered(wordId: number) {
      const prev = this.snapshot
      const key = String(wordId)
      const mastered = { ...(prev.mastered ?? {}), [key]: true as const }
      const next: ProgressSnapshot = { ...prev, mastered }
      saveProgress(next)
      this.snapshot = next
      this.revision += 1
    },
    updatePrefs(patch: Partial<UserPrefs>) {
      const prev = this.snapshot
      const next: ProgressSnapshot = { ...prev, prefs: { ...prev.prefs, ...patch } }
      saveProgress(next)
      this.snapshot = next
      this.revision += 1
    },
    importFromRewordBackupDb(db: Database, mode: ImportMode): number {
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
      this.snapshot = next
      this.revision += 1
      return updated
    },
    clearProgressOnly() {
      clearProgressStorage()
      this.refresh()
    },
  },
})
