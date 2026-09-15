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

export type CategoryScopeMode = 'reword' | 'custom'

export interface SrsPresetLoad {
  newPerSession: number
  reviewPerSession: number
}

export type SrsPresetOverrides = Record<string, SrsPresetLoad>

export type IntervalUnit = 'min' | 'hour' | 'day'

export interface GradeIntervalPref {
  value: number
  unit: IntervalUnit
}

export type CardPromptLang = 'en' | 'ru' | 'mixed'

export interface UserPrefs {
  /** Новых карточек за сессию (верхняя граница) */
  newPerSession: number
  /** Повторений за сессию */
  reviewPerSession: number
  /** Интервал после «выпуска» из learning */
  graduatingIntervalDays: number
  /** Бонус для Easy при выпуске */
  easyIntervalDays: number
  /**
   * Цель новых слов на день. Также ограничивает, сколько новых карточек попадёт в сессию.
   */
  dailyGoalWords: number
  /**
   * Словари сессии: все доступные или только отмеченные «в обучении».
   */
  sessionDictScope: 'all' | 'selected'
  /**
   * Область «все выбранные»: брать словари с флагом из бэкапа Reword или свой список ID категорий.
   */
  categoryScopeMode: CategoryScopeMode
  /** При categoryScopeMode === custom — какие CATEGORY.ID входят в смешанную область */
  customCategoryIds: string[]
  /** Активный именованный профиль SRS или null после ручной правки ползунков */
  srsPresetId: string | null
  /** Пользовательские цель и повторы для кнопок интенсивности */
  srsPresetOverrides: SrsPresetOverrides
  /** Интервал кнопки «Сложно» */
  gradeAgainInterval: GradeIntervalPref
  /** Интервал кнопки «Неуверенно» */
  gradeHardInterval: GradeIntervalPref
  /** Интервал кнопки «Легко» */
  gradeEasyInterval: GradeIntervalPref
  /** Язык лица карточки для новых слов */
  newWordPrompt: CardPromptLang
  /** Язык лица карточки для повторов */
  reviewWordPrompt: CardPromptLang
  /** Показывать картинки на карточке */
  showPictures: boolean
  /** Версия дефолтов карточки — для разового переноса интервалов */
  studyPrefsVersion: number
  /** Имя в приветствии на главной */
  displayName: string
  theme: 'dark' | 'light'
  notificationsEnabled: boolean
}

export const DEFAULT_PREFS: UserPrefs = {
  newPerSession: 15,
  reviewPerSession: 20,
  graduatingIntervalDays: 1,
  easyIntervalDays: 15,
  dailyGoalWords: 15,
  sessionDictScope: 'selected',
  categoryScopeMode: 'reword',
  customCategoryIds: [],
  srsPresetId: null,
  srsPresetOverrides: {},
  gradeAgainInterval: { value: 10, unit: 'min' },
  gradeHardInterval: { value: 5, unit: 'day' },
  gradeEasyInterval: { value: 15, unit: 'day' },
  newWordPrompt: 'en',
  reviewWordPrompt: 'en',
  showPictures: true,
  studyPrefsVersion: 2,
  displayName: '',
  theme: 'dark',
  notificationsEnabled: false,
}

/** Фрагмент настроек для SQL-области «selected». */
export interface CategoryScopePrefs {
  categoryScopeMode: CategoryScopeMode
  customCategoryIds: string[]
}

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export type ImportMode = 'replaceAll' | 'mergeMissing' | 'mergeOverwrite'

export interface WeakWordHit {
  id: number
  g: 'again' | 'hard'
  at: number
}

export interface ProgressSnapshot {
  v: 1
  words: Record<string, CardSchedule>
  prefs: UserPrefs
  /** Слова, вручную исключённые из SRS (не попадают в «Учить» / новое / срочные повторы) */
  mastered?: Record<string, true>
  /** Последние ответы «Снова» / «Сложно» (по одному свежему попаданию на слово) — для экспорта */
  weakWordLog?: WeakWordHit[]
}

export const PROGRESS_LS_KEY = 'vocabdesk-progress-v2'

export function emptySnapshot(): ProgressSnapshot {
  return { v: 1, words: {}, prefs: { ...DEFAULT_PREFS }, mastered: {}, weakWordLog: [] }
}
