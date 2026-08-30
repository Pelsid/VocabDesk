import type { CardSchedule } from './progressTypes'
import { defaultNew } from './srs'

export interface RewordWordProgress {
  id: number
  qRec: number
  qRep: number
  eRec: number
  eRep: number
}

export function scheduleFromRewordRow(row: RewordWordProgress, now: number): CardSchedule {
  const ease = clamp(row.eRec || row.eRep || 2.5, 1.3, 3.0)
  const q = Math.max(row.qRec, row.qRep)

  if (q <= 0) {
    return defaultNew(now)
  }

  if (q < 3) {
    const step = Math.min(2, Math.max(0, q - 1))
    return {
      bucket: 'learning',
      due: now,
      ease,
      intervalDays: 0,
      step,
      reps: 0,
      lapses: 0,
      lastReviewMs: now,
    }
  }

  const mature = q >= 4
  const intervalDays = mature ? 21 : Math.max(7, Math.round(ease * 3))

  return {
    bucket: 'review',
    due: now,
    ease,
    intervalDays,
    step: 99,
    reps: mature ? 10 : 4,
    lapses: 0,
    lastReviewMs: now,
  }
}

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n))
}
