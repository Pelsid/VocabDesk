import type { CategoryStat } from './catalogTypes'
import { listWordIdsInCategory } from './catalogScope'
import { getSchedule, isReviewStageForDictionaryPct, isWordMastered } from '../study/localClassifier'
import type { ProgressSnapshot } from './progressTypes'

/** Полосы Oxford из типичного бэкапа Reword — для ориентира A1→C1 (не экзамен CEFR). */
export const OXFORD_PATH_CATEGORY_IDS = [
  'oxford3000_a1',
  'oxford3000_a2',
  'oxford3000_b1',
  'oxford3000_b2',
  'oxford5000_c1',
] as const

export interface OxfordPathRow {
  id: string
  name: string
  wordCount: number
  learnedCount: number
  localPct: number
}

export function computeOxfordPathRows(
  wordIdsByDict: Record<string, number[]>,
  categories: CategoryStat[],
  snapshot: ProgressSnapshot,
): OxfordPathRow[] {
  const rows: OxfordPathRow[] = []
  for (const id of OXFORD_PATH_CATEGORY_IDS) {
    const c = categories.find((x) => x.id === id)
    if (!c) continue
    const ids = listWordIdsInCategory(wordIdsByDict, id)
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

export function computeOxfordTotals(
  wordIdsByDict: Record<string, number[]>,
  snapshot: ProgressSnapshot,
): { learned: number; total: number } {
  const ids = new Set<number>()
  for (const id of OXFORD_PATH_CATEGORY_IDS) {
    for (const wid of listWordIdsInCategory(wordIdsByDict, id)) ids.add(wid)
  }
  let learned = 0
  for (const wid of ids) {
    const sched = getSchedule(snapshot.words, wid)
    const mastered = isWordMastered(snapshot.mastered, wid)
    if (isReviewStageForDictionaryPct(sched, mastered)) learned++
  }
  return { learned, total: ids.size }
}

export function estimateAccuracy(snapshot: ProgressSnapshot): number {
  let reps = 0
  let lapses = 0
  for (const s of Object.values(snapshot.words)) {
    reps += s.reps ?? 0
    lapses += s.lapses ?? 0
  }
  const den = reps + lapses
  return den ? Math.round((reps / den) * 100) : 0
}

export function shortOxfordLabel(name: string): string {
  const m = name.match(/\b(A1|A2|B1|B2|C1)\b/i)
  return m ? m[1].toUpperCase() : name.replace(/^Oxford\s+\d+\s*[—–-]\s*/i, '') || name
}

export function pctTone(pct: number): 'ok' | 'teal' | 'accent' | 'warn' {
  if (pct >= 70) return 'ok'
  if (pct >= 50) return 'teal'
  if (pct >= 35) return 'accent'
  return 'warn'
}

/** Цвет кольца прогресса: нижняя граница диапазона включена (10% → оранжевый). */
export function pctRingColor(pct: number): string {
  const n = Math.max(0, Math.min(100, pct))
  if (n < 10) return '#F43F5E'
  if (n < 25) return '#F97316'
  if (n < 40) return '#F59E0B'
  if (n < 60) return '#2DD4BF'
  if (n < 75) return '#38BDF8'
  if (n < 90) return '#34D399'
  return '#10B981'
}
