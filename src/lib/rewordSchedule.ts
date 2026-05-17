import type { Database } from 'sql.js'
import { openRewordDatabase } from '../db/rewordDb'
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

export function scheduleToRewordColumns(s: CardSchedule): {
  qRec: number
  qRep: number
  eRec: number
  eRep: number
} {
  const eRec = clamp(s.ease, 1.3, 3.0)
  const eRep = eRec

  if (s.bucket === 'new') {
    return { qRec: 0, qRep: 0, eRec, eRep }
  }
  if (s.bucket === 'learning') {
    const q = clamp(1 + Math.min(2, s.step), 1, 2)
    return { qRec: q, qRep: q, eRec, eRep }
  }
  if (s.bucket === 'relearn') {
    return { qRec: 2, qRep: 2, eRec, eRep }
  }

  const mature = s.intervalDays >= 21 && s.reps >= 8
  const q = mature ? 4 : 3
  return { qRec: q, qRep: q, eRec, eRep }
}

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n))
}

export function extractRewordProgress(db: Database): RewordWordProgress[] {
  const stmt = db.prepare('SELECT ID, Q_REC, Q_REP, E_REC, E_REP FROM WORD')
  const rows: RewordWordProgress[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({
      id: Number(r.ID),
      qRec: Number(r.Q_REC ?? 0),
      qRep: Number(r.Q_REP ?? 0),
      eRec: Number(r.E_REC ?? 2.5),
      eRep: Number(r.E_REP ?? 2.5),
    })
  }
  stmt.free()
  return rows
}

export function applySchedulesToRewordDb(db: Database, words: Record<string, CardSchedule>) {
  const nowSec = Math.floor(Date.now() / 1000)
  for (const [idStr, sched] of Object.entries(words)) {
    const cols = scheduleToRewordColumns(sched)
    const id = Number(idStr)
    db.run(
      'UPDATE WORD SET Q_REC = ?, Q_REP = ?, E_REC = ?, E_REP = ?, T_REC = ? WHERE ID = ?',
      [cols.qRec, cols.qRep, cols.eRec, cols.eRep, nowSec, id],
    )
  }
}

export async function exportDatabaseWithSchedules(original: ArrayBuffer, words: Record<string, CardSchedule>) {
  const db = await openRewordDatabase(original.slice(0))
  applySchedulesToRewordDb(db, words)
  const bin = db.export()
  db.close()
  return bin
}

export function listDbWordIds(db: Database): Set<number> {
  const stmt = db.prepare('SELECT ID FROM WORD')
  const set = new Set<number>()
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    set.add(Number(r.ID))
  }
  stmt.free()
  return set
}
