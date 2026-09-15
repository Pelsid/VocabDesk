import { DEFAULT_PREFS, type CardPromptLang, type Grade, type GradeIntervalPref, type IntervalUnit, type UserPrefs } from './progressTypes'

export const INTERVAL_UNITS: { id: IntervalUnit; label: string }[] = [
  { id: 'min', label: 'мин' },
  { id: 'hour', label: 'ч' },
  { id: 'day', label: 'дн' },
]

export const PROMPT_OPTIONS: { id: CardPromptLang; label: string }[] = [
  { id: 'en', label: 'Отображать слова на английском' },
  { id: 'ru', label: 'Отображать слова на русском' },
  { id: 'mixed', label: 'Отображать слова в смешанном режиме' },
]

export const GRADE_INTERVAL_ROWS: { key: 'gradeAgainInterval' | 'gradeHardInterval' | 'gradeEasyInterval'; label: string }[] = [
  { key: 'gradeAgainInterval', label: 'Сложно' },
  { key: 'gradeHardInterval', label: 'Неуверенно' },
  { key: 'gradeEasyInterval', label: 'Легко' },
]

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 86_400_000

export function clampIntervalValue(n: number): number {
  return Math.max(1, Math.min(999, Math.floor(Number(n)) || 1))
}

export function normalizeIntervalUnit(u: unknown): IntervalUnit {
  return u === 'hour' || u === 'day' || u === 'min' ? u : 'min'
}

export function normalizeGradeInterval(raw: unknown, fallback: GradeIntervalPref): GradeIntervalPref {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...fallback }
  const rec = raw as Partial<GradeIntervalPref>
  return {
    value: clampIntervalValue(rec.value ?? fallback.value),
    unit: normalizeIntervalUnit(rec.unit ?? fallback.unit),
  }
}

export function normalizeCardPrompt(raw: unknown): CardPromptLang {
  return raw === 'ru' || raw === 'mixed' || raw === 'en' ? raw : 'en'
}

export function gradeIntervalMs(pref: GradeIntervalPref): number {
  const v = clampIntervalValue(pref.value)
  if (pref.unit === 'min') return v * MINUTE
  if (pref.unit === 'hour') return v * HOUR
  return v * DAY
}

export function gradeIntervalDays(pref: GradeIntervalPref): number {
  const ms = gradeIntervalMs(pref)
  if (ms < DAY) return 0
  return Math.max(1, Math.round(ms / DAY))
}

export function formatGradeInterval(pref: GradeIntervalPref): string {
  const v = clampIntervalValue(pref.value)
  if (pref.unit === 'min') return `${v} мин`
  if (pref.unit === 'hour') return `${v} ч`
  return `${v} дн`
}

export function intervalPrefForGrade(prefs: UserPrefs, grade: Extract<Grade, 'again' | 'hard' | 'easy'>): GradeIntervalPref {
  if (grade === 'again') return prefs.gradeAgainInterval
  if (grade === 'hard') return prefs.gradeHardInterval
  return prefs.gradeEasyInterval
}

export function resolvePromptLang(pref: CardPromptLang, mixedPick: 'en' | 'ru'): 'en' | 'ru' {
  if (pref === 'mixed') return mixedPick
  return pref
}

export function normalizeStudyPrefs(raw?: Partial<UserPrefs> | null): Pick<
  UserPrefs,
  | 'gradeAgainInterval'
  | 'gradeHardInterval'
  | 'gradeEasyInterval'
  | 'newWordPrompt'
  | 'reviewWordPrompt'
  | 'showPictures'
  | 'studyPrefsVersion'
> {
  const stale = (raw?.studyPrefsVersion ?? 0) < 2
  return {
    gradeAgainInterval: normalizeGradeInterval(raw?.gradeAgainInterval, DEFAULT_PREFS.gradeAgainInterval),
    gradeHardInterval: stale
      ? { ...DEFAULT_PREFS.gradeHardInterval }
      : normalizeGradeInterval(raw?.gradeHardInterval, DEFAULT_PREFS.gradeHardInterval),
    gradeEasyInterval: stale
      ? { ...DEFAULT_PREFS.gradeEasyInterval }
      : normalizeGradeInterval(raw?.gradeEasyInterval, DEFAULT_PREFS.gradeEasyInterval),
    newWordPrompt: normalizeCardPrompt(raw?.newWordPrompt),
    reviewWordPrompt: normalizeCardPrompt(raw?.reviewWordPrompt),
    showPictures: raw?.showPictures !== false,
    studyPrefsVersion: 2,
  }
}
