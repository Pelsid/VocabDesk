import type { ProgressSnapshot } from './progressTypes'
import { isWordMastered } from '../study/localClassifier'

export function countNavStats(ids: number[], snapshot: ProgressSnapshot, now: number) {
  const mastered = snapshot.mastered ?? {}
  const words = snapshot.words
  let due = 0
  let fresh = 0
  let learned = 0
  for (const id of ids) {
    if (isWordMastered(mastered, id)) {
      learned++
      continue
    }
    const s = words[String(id)] ?? null
    if (!s || s.bucket === 'new') {
      fresh++
      continue
    }
    if (s.bucket === 'review') learned++
    if (s.due <= now) due++
  }
  return { due, fresh, learned }
}
