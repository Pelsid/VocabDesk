import type { Database } from 'sql.js'
import type { CategoryStat } from '../db/rewordDb'
import { listWordIdsInCategory } from '../db/rewordDb'
import { getSchedule, isReviewStageForDictionaryPct, isWordMastered } from '../study/localClassifier'
import type { ProgressSnapshot } from './progressTypes'

/** Полосы Oxford из типичного бэкапа Reword — для ориентира B1→B2 (не экзамен CEFR). */
export const OXFORD_PATH_CATEGORY_IDS = [
  'oxford3000_a1',
  'oxford3000_a2',
  'oxford3000_b1',
  'oxford3000_b2',
  'oxford5000_b2',
] as const

export interface OxfordPathRow {
  id: string
  name: string
  wordCount: number
  learnedCount: number
  localPct: number
}

export function computeOxfordPathRows(
  db: Database,
  categories: CategoryStat[],
  snapshot: ProgressSnapshot,
): OxfordPathRow[] {
  const rows: OxfordPathRow[] = []
  for (const id of OXFORD_PATH_CATEGORY_IDS) {
    const c = categories.find((x) => x.id === id)
    if (!c) continue
    const ids = listWordIdsInCategory(db, id)
    const learnedLocal = ids.reduce((acc, wid) => {
      const sched = getSchedule(snapshot.words, wid)
      const mastered = isWordMastered(snapshot.mastered, wid)
      return acc + (isReviewStageForDictionaryPct(sched, mastered) ? 1 : 0)
    }, 0)
    const localPct = ids.length ? Math.round((learnedLocal / ids.length) * 100) : 0
    rows.push({ id, name: c.name, wordCount: ids.length, learnedCount: learnedLocal, localPct })
  }
  return rows
}

export function pctTone(pct: number): 'ok' | 'teal' | 'accent' | 'warn' {
  if (pct >= 70) return 'ok'
  if (pct >= 50) return 'teal'
  if (pct >= 35) return 'accent'
  return 'warn'
}
