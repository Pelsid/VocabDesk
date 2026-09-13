import { defineStore } from 'pinia'
import { postGrade, postMaster, postResetProgress, putSettings, type DailyPayload } from '../api/client'
import { DEFAULT_PREFS, emptySnapshot, type Grade, type ProgressSnapshot, type UserPrefs } from '../lib/progressTypes'
import { appendWeakHit } from '../lib/weakWordLog'

function emptyDaily(): DailyPayload {
  return {
    todayCount: 0,
    days: [],
    dayCounts: {},
    streak: 0,
    weekFlags: [false, false, false, false, false, false, false],
  }
}

export const useProgressStore = defineStore('progress', {
  state: (): {
    snapshot: ProgressSnapshot
    daily: DailyPayload
    hasGroqKey: boolean
    revision: number
    busy: boolean
  } => ({
    snapshot: emptySnapshot(),
    daily: emptyDaily(),
    hasGroqKey: false,
    revision: 0,
    busy: false,
  }),
  actions: {
    hydrate(progress: ProgressSnapshot, daily?: DailyPayload, hasGroqKey?: boolean) {
      this.snapshot = {
        v: 1,
        words: progress.words ?? {},
        prefs: { ...DEFAULT_PREFS, ...progress.prefs },
        mastered: progress.mastered ?? {},
        weakWordLog: progress.weakWordLog ?? [],
      }
      if (daily) this.daily = daily
      if (hasGroqKey !== undefined) this.hasGroqKey = hasGroqKey
      this.revision += 1
    },
    async gradeWord(wordId: number, grade: Grade) {
      const res = await postGrade(wordId, grade)
      let next: ProgressSnapshot = {
        ...this.snapshot,
        words: { ...this.snapshot.words, [String(wordId)]: res.schedule },
      }
      if (res.weakWordLog) next = { ...next, weakWordLog: res.weakWordLog }
      else next = appendWeakHit(next, wordId, grade)
      this.snapshot = next
      this.daily = res.daily
      this.revision += 1
    },
    async markWordMastered(wordId: number) {
      const res = await postMaster(wordId)
      const mastered = { ...(this.snapshot.mastered ?? {}), [String(wordId)]: true as const }
      this.snapshot = { ...this.snapshot, words: { ...this.snapshot.words, [String(wordId)]: res.schedule }, mastered }
      this.daily = res.daily
      this.revision += 1
    },
    async updatePrefs(patch: Partial<UserPrefs>) {
      const prefs = { ...this.snapshot.prefs, ...patch }
      this.snapshot = { ...this.snapshot, prefs }
      this.revision += 1
      const res = await putSettings({ prefs })
      this.snapshot = { ...this.snapshot, prefs: res.prefs }
      this.hasGroqKey = res.hasGroqKey
    },
    async setGroqKey(key: string) {
      const res = await putSettings({ groqApiKey: key })
      this.hasGroqKey = res.hasGroqKey
      this.revision += 1
    },
    async clearProgressOnly() {
      const res = await postResetProgress()
      this.hydrate(res.progress, res.daily, this.hasGroqKey)
    },
  },
})
