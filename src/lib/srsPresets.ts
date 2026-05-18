import type { UserPrefs } from './progressTypes'

export interface SrsPreset {
  id: string
  label: string
  description: string
  prefs: Pick<UserPrefs, 'newPerSession' | 'reviewPerSession' | 'graduatingIntervalDays' | 'easyIntervalDays'>
}

/** Именованные профили нагрузки SRS — дополняют ползунки на экране «Учить». */
export const SRS_PRESETS: SrsPreset[] = [
  {
    id: 'calm_b1',
    label: 'Спокойный B1',
    description: 'Мало новых, умеренные повторы — если перегруз.',
    prefs: { newPerSession: 10, reviewPerSession: 120, graduatingIntervalDays: 1, easyIntervalDays: 4 },
  },
  {
    id: 'steady_b2',
    label: 'Ровный B2',
    description: 'Баланс близок к умолчанию — долгая дистанция.',
    prefs: { newPerSession: 20, reviewPerSession: 200, graduatingIntervalDays: 1, easyIntervalDays: 4 },
  },
  {
    id: 'intensive',
    label: 'Интенсив',
    description: 'Больше новых карточек за сессию.',
    prefs: { newPerSession: 40, reviewPerSession: 260, graduatingIntervalDays: 1, easyIntervalDays: 3 },
  },
  {
    id: 'review_heavy',
    label: 'Упор на повторы',
    description: 'Мало новых, много долга — удобно перед фильмами/созвонами.',
    prefs: { newPerSession: 8, reviewPerSession: 320, graduatingIntervalDays: 1, easyIntervalDays: 5 },
  },
]
