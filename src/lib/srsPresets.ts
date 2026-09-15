import type { SrsPresetLoad, SrsPresetOverrides, UserPrefs } from './progressTypes'

export const GOAL_MIN = 5
export const GOAL_MAX = 99
export const REVIEW_MIN = 5
export const REVIEW_MAX = 500

export interface SrsPreset {
  id: string
  label: string
  description: string
  prefs: Pick<UserPrefs, 'newPerSession' | 'reviewPerSession' | 'graduatingIntervalDays' | 'easyIntervalDays'>
}

/** Именованные профили нагрузки SRS. */
export const SRS_PRESETS: SrsPreset[] = [
  {
    id: 'calm_b1',
    label: 'Спокойный',
    description: 'Мало новых, умеренные повторы — если перегруз.',
    prefs: { newPerSession: 10, reviewPerSession: 10, graduatingIntervalDays: 1, easyIntervalDays: 4 },
  },
  {
    id: 'steady_b2',
    label: 'Усердный',
    description: 'Баланс близок к умолчанию — долгая дистанция.',
    prefs: { newPerSession: 15, reviewPerSession: 20, graduatingIntervalDays: 1, easyIntervalDays: 4 },
  },
  {
    id: 'intensive',
    label: 'Интенсив',
    description: 'Больше новых карточек за сессию.',
    prefs: { newPerSession: 25, reviewPerSession: 30, graduatingIntervalDays: 1, easyIntervalDays: 3 },
  },
  {
    id: 'review_heavy',
    label: 'Упор на повторы',
    description: 'Мало новых, много долга — удобно перед фильмами/созвонами.',
    prefs: { newPerSession: 5, reviewPerSession: 50, graduatingIntervalDays: 1, easyIntervalDays: 5 },
  },
]

export function clampDailyGoal(n: number): number {
  return Math.max(GOAL_MIN, Math.min(GOAL_MAX, Math.floor(Number(n)) || GOAL_MIN))
}

export function clampReviews(n: number): number {
  return Math.max(REVIEW_MIN, Math.min(REVIEW_MAX, Math.floor(Number(n)) || REVIEW_MIN))
}

export function normalizeSrsPresetOverrides(raw: unknown): SrsPresetOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const allowed = new Map(SRS_PRESETS.map((p) => [p.id, p]))
  const out: SrsPresetOverrides = {}
  for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
    const base = allowed.get(id)
    if (!base || !row || typeof row !== 'object' || Array.isArray(row)) continue
    const rec = row as Partial<SrsPresetLoad>
    out[id] = {
      newPerSession: clampDailyGoal(rec.newPerSession ?? base.prefs.newPerSession),
      reviewPerSession: clampReviews(rec.reviewPerSession ?? base.prefs.reviewPerSession),
    }
  }
  return out
}

export function resolvedPresetLoad(p: SrsPreset, overrides?: SrsPresetOverrides | null): SrsPresetLoad {
  const o = overrides?.[p.id]
  return {
    newPerSession: clampDailyGoal(o?.newPerSession ?? p.prefs.newPerSession),
    reviewPerSession: clampReviews(o?.reviewPerSession ?? p.prefs.reviewPerSession),
  }
}

export function prefsFromSrsPreset(p: SrsPreset, overrides?: SrsPresetOverrides | null): Partial<UserPrefs> {
  const load = resolvedPresetLoad(p, overrides)
  return {
    ...p.prefs,
    ...load,
    dailyGoalWords: load.newPerSession,
    srsPresetId: p.id,
  }
}
