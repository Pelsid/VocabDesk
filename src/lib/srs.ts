import type { CardSchedule, Grade, UserPrefs } from './progressTypes'

const MINUTE = 60_000
const DAY = 86_400_000

const LEARNING_STEPS_MS = [1 * MINUTE, 10 * MINUTE, 1 * DAY]

function clampEase(ease: number): number {
  return Math.min(3.0, Math.max(1.3, Math.round(ease * 1000) / 1000))
}

function adjustEase(ease: number, grade: Grade): number {
  const q = grade === 'again' ? 1 : grade === 'hard' ? 3 : grade === 'good' ? 4 : 5
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
  return clampEase(ease + delta)
}

export function defaultNew(now: number): CardSchedule {
  return {
    bucket: 'new',
    due: now,
    ease: 2.5,
    intervalDays: 0,
    step: 0,
    reps: 0,
    lapses: 0,
  }
}

/** Перевод качества ответа в интервал (упрощённый SM-2) */
export function applyGrade(
  prev: CardSchedule | null,
  grade: Grade,
  now: number,
  prefs: UserPrefs,
): CardSchedule {
  const base = prev ?? defaultNew(now)

  if (base.bucket === 'new' || base.bucket === 'learning') {
    return gradeYoung(base, grade, now, prefs)
  }
  if (base.bucket === 'relearn') {
    return gradeRelearn(base, grade, now, prefs)
  }
  return gradeMature(base, grade, now, prefs)
}

function graduateReview(now: number, ease: number, intervalDays: number, reps: number): CardSchedule {
  return {
    bucket: 'review',
    due: now + intervalDays * DAY,
    ease,
    intervalDays,
    step: LEARNING_STEPS_MS.length,
    reps: Math.max(1, reps + 1),
    lapses: 0,
    lastReviewMs: now,
  }
}

function gradeYoung(s: CardSchedule, grade: Grade, now: number, prefs: UserPrefs): CardSchedule {
  const ease = s.ease

  if (grade === 'again') {
    return {
      bucket: 'learning',
      due: now + LEARNING_STEPS_MS[0],
      ease: clampEase(ease - 0.2),
      intervalDays: 0,
      step: 0,
      reps: 0,
      lapses: s.lapses + (s.bucket === 'new' ? 0 : 1),
      lastReviewMs: now,
    }
  }

  if (grade === 'hard') {
    const step = Math.max(0, s.step - 1)
    const delay = LEARNING_STEPS_MS[Math.min(step, LEARNING_STEPS_MS.length - 1)] * 1.5
    return {
      bucket: 'learning',
      due: now + delay,
      ease: clampEase(ease - 0.05),
      intervalDays: 0,
      step,
      reps: s.reps,
      lapses: s.lapses,
      lastReviewMs: now,
    }
  }

  if (grade === 'good') {
    const nextStep = s.bucket === 'new' ? 0 : s.step + 1
    if (nextStep >= LEARNING_STEPS_MS.length) {
      return graduateReview(now, ease, prefs.graduatingIntervalDays, 0)
    }
    return {
      bucket: 'learning',
      due: now + LEARNING_STEPS_MS[nextStep],
      ease,
      intervalDays: 0,
      step: nextStep,
      reps: s.reps,
      lapses: s.lapses,
      lastReviewMs: now,
    }
  }

  // easy — быстрый выпуск
  return graduateReview(now, clampEase(ease + 0.15), prefs.easyIntervalDays, 0)
}

function gradeRelearn(s: CardSchedule, grade: Grade, now: number, prefs: UserPrefs): CardSchedule {
  if (grade === 'again') {
    return {
      ...s,
      bucket: 'relearn',
      due: now + 10 * MINUTE,
      ease: clampEase(s.ease - 0.2),
      intervalDays: 0,
      step: 0,
      lapses: s.lapses + 1,
      lastReviewMs: now,
    }
  }

  if (grade === 'hard') {
    return {
      ...s,
      bucket: 'relearn',
      due: now + 12 * MINUTE,
      ease: clampEase(s.ease - 0.05),
      intervalDays: 0,
      lastReviewMs: now,
    }
  }

  if (grade === 'good') {
    const interval = Math.max(prefs.graduatingIntervalDays, s.intervalDays * 0.5 || 1)
    const ease = adjustEase(s.ease, 'good')
    return graduateReview(now, ease, interval, s.reps)
  }

  const interval = Math.max(prefs.easyIntervalDays, (s.intervalDays || 1) * s.ease)
  const ease = adjustEase(s.ease, 'easy')
  return graduateReview(now, ease, interval, s.reps)
}

function gradeMature(s: CardSchedule, grade: Grade, now: number, prefs: UserPrefs): CardSchedule {
  let ease = s.ease
  let interval = Math.max(1, s.intervalDays || 1)

  if (grade === 'again') {
    return {
      bucket: 'relearn',
      due: now + 10 * MINUTE,
      ease: clampEase(ease - 0.2),
      intervalDays: 0,
      step: 0,
      reps: s.reps,
      lapses: s.lapses + 1,
      lastReviewMs: now,
    }
  }

  if (grade === 'hard') {
    ease = adjustEase(ease, 'hard')
    interval = Math.max(1, Math.round(interval * 1.2))
    return graduateReview(now, ease, interval, s.reps)
  }

  if (grade === 'good') {
    ease = adjustEase(ease, 'good')
    if (s.reps === 0) interval = 1
    else if (s.reps === 1) interval = 6
    else interval = Math.max(1, Math.round(interval * ease))
    return graduateReview(now, ease, interval, s.reps)
  }

  ease = adjustEase(ease, 'easy')
  interval = Math.max(1, Math.round(interval * ease * 1.3))
  interval = Math.max(interval, prefs.easyIntervalDays)
  return graduateReview(now, ease, interval, s.reps)
}

export function formatDueLabel(sched: CardSchedule | null, now: number): string {
  if (!sched) return 'ещё не начато'
  const delta = sched.due - now
  if (delta <= 0) return 'готово сейчас'
  if (delta < 60_000) return `через ${Math.round(delta / 1000)} сек`
  if (delta < DAY) return `через ${Math.round(delta / MINUTE)} мин`
  return `через ${Math.round(delta / DAY)} д`
}
