import type { Grade, ProgressSnapshot } from './progressTypes'

const WEAK_LOG_CAP = 400

export function appendWeakHit(snapshot: ProgressSnapshot, wordId: number, grade: Grade): ProgressSnapshot {
  if (grade !== 'again' && grade !== 'hard') return snapshot
  const log = [...(snapshot.weakWordLog ?? [])]
  log.unshift({ id: wordId, g: grade, at: Date.now() })
  const seen = new Set<number>()
  const deduped: NonNullable<ProgressSnapshot['weakWordLog']> = []
  for (const e of log) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    deduped.push(e)
    if (deduped.length >= WEAK_LOG_CAP) break
  }
  return { ...snapshot, weakWordLog: deduped }
}
