import type { ProgressSnapshot } from '../lib/progressTypes'

function shuffleInPlace<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
}

/** Формирует очередь ID на сессию: сначала просроченные review/relearn/learning, затем новые */
export function buildSessionQueue(args: { ids: number[]; snapshot: ProgressSnapshot; now: number }): number[] {
  const mastered = args.snapshot.mastered ?? {}
  const ids = args.ids.filter((id) => !mastered[String(id)])
  const prefs = args.snapshot.prefs
  const words = args.snapshot.words

  type Item = { id: number; sched: NonNullable<ProgressSnapshot['words'][string]> | null }
  const items: Item[] = ids.map((id) => ({ id, sched: words[String(id)] ?? null }))

  const reviewDue = items.filter((i) => i.sched?.bucket === 'review' && i.sched.due <= args.now)
  const relearnDue = items.filter((i) => i.sched?.bucket === 'relearn' && i.sched.due <= args.now)
  const learningDue = items.filter((i) => i.sched?.bucket === 'learning' && i.sched.due <= args.now)
  const news = items.filter((i) => !i.sched || i.sched.bucket === 'new')

  reviewDue.sort((a, b) => a.sched!.due - b.sched!.due)
  const intraday = [...relearnDue, ...learningDue].sort((a, b) => a.sched!.due - b.sched!.due)

  const pickRev = reviewDue.slice(0, prefs.reviewPerSession).map((x) => x.id)
  const budgetLeft = Math.max(0, prefs.reviewPerSession - pickRev.length)
  const pickIntra = intraday.slice(0, Math.min(budgetLeft, 120)).map((x) => x.id)

  const newIds = news.map((x) => x.id)
  shuffleInPlace(newIds)
  const newCap = Math.max(1, prefs.dailyGoalWords || prefs.newPerSession)
  const pickNew = newIds.slice(0, newCap)

  return [...pickRev, ...pickIntra, ...pickNew]
}

export function countDueSnapshot(args: { ids: number[]; snapshot: ProgressSnapshot; now: number }) {
  const mastered = args.snapshot.mastered ?? {}
  const ids = args.ids.filter((id) => !mastered[String(id)])
  const words = args.snapshot.words
  let due = 0
  let fresh = 0
  let learning = 0
  let dueReview = 0
  let dueHard = 0
  for (const id of ids) {
    const s = words[String(id)] ?? null
    if (!s || s.bucket === 'new') {
      fresh++
      continue
    }
    if (s.bucket === 'learning' || s.bucket === 'relearn') {
      learning++
      if (s.due <= args.now) {
        due++
        dueHard++
      }
      continue
    }
    if (s.bucket === 'review' && s.due <= args.now) {
      due++
      dueReview++
    }
  }
  return { total: ids.length, due, fresh, learning, dueReview, dueHard }
}
