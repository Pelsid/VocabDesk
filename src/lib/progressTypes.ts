export type CardBucket = 'new' | 'learning' | 'review' | 'relearn'

/** Локальный SRS-снимок карточки (интервальное повторение в духе Anki-подобных клиентов) */
export interface CardSchedule {
  bucket: CardBucket
  /** Unix ms — когда карточка снова доступна */
  due: number
  /** SM-2 ease factor */
  ease: number
  /** Интервал в днях после выпуска в review (для learning может быть 0) */
  intervalDays: number
  /** Шаг в очереди обучения */
  step: number
  /** Успешные повторы в review */
  reps: number
  /** Срывы */
  lapses: number
  lastReviewMs?: number
}

export interface UserPrefs {
  /** Новых карточек за сессию (верхняя граница) */
  newPerSession: number
  /** Повторений за сессию */
  reviewPerSession: number
  /** Интервал после «выпуска» из learning */
  graduatingIntervalDays: number
  /** Бонус для Easy при выпуске */
  easyIntervalDays: number
  /** Цель «выучено сегодня» на экране «Учить» (только отображение и кольцо прогресса) */
  dailyGoalWords: number
}

export const DEFAULT_PREFS: UserPrefs = {
  newPerSession: 20,
  reviewPerSession: 200,
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  dailyGoalWords: 15,
}

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export type ImportMode = 'replaceAll' | 'mergeMissing' | 'mergeOverwrite'

export interface ProgressSnapshot {
  v: 1
  words: Record<string, CardSchedule>
  prefs: UserPrefs
  /** Слова, вручную исключённые из SRS (не попадают в «Учить» / новое / срочные повторы) */
  mastered?: Record<string, true>
}

export const PROGRESS_LS_KEY = 'vocabdesk-progress-v2'

export function emptySnapshot(): ProgressSnapshot {
  return { v: 1, words: {}, prefs: { ...DEFAULT_PREFS }, mastered: {} }
}
