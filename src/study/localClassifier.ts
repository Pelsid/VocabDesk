import type { WordFilter } from '../lib/catalogTypes'
import type { CardSchedule } from '../lib/progressTypes'

/** Режимы глобальных вкладок «Новое» / «Повторение» / «Изученное» */
export type ProgressBrowseMode = 'new_words' | 'due_now' | 'learned_review'

export function getSchedule(map: Record<string, CardSchedule>, id: number): CardSchedule | null {
  return map[String(id)] ?? null
}

export function isWordMastered(mastered: Record<string, true> | undefined, wordId: number): boolean {
  return Boolean(mastered?.[String(wordId)])
}

/** Попадает ли карточка в выбранную вкладку прогресса (в пределах области слов из бэкапа). */
export function matchesProgressBrowse(
  wordId: number,
  sched: CardSchedule | null,
  mode: ProgressBrowseMode,
  now: number,
  mastered?: Record<string, true>,
): boolean {
  if (isWordMastered(mastered, wordId)) {
    return mode === 'learned_review'
  }
  if (mode === 'new_words') return !sched || sched.bucket === 'new'
  if (mode === 'learned_review') return !!sched && sched.bucket === 'review'
  // due_now — всё, что по SRS должно быть показано сейчас (не «новые» без очереди)
  if (!sched || sched.bucket === 'new') return false
  return sched.due <= now
}

export function matchesLocalFilter(
  sched: CardSchedule | null,
  filter: WordFilter,
  wordId: number,
  mastered?: Record<string, true>,
): boolean {
  if (isWordMastered(mastered, wordId)) return filter === 'all' || filter === 'review'
  if (filter === 'all') return true
  if (!sched || sched.bucket === 'new') return filter === 'new'
  if (sched.bucket === 'learning') return filter === 'learning'
  if (sched.bucket === 'relearn') return filter === 'learning'
  if (sched.bucket === 'review') return filter === 'review'
  return false
}

/** Строгая «закреплённость» — для бейджа и долгих интервалов */
export function isLocallyMature(sched: CardSchedule | null): boolean {
  return !!sched && sched.bucket === 'review' && sched.intervalDays >= 14 && sched.reps >= 4
}

/** Доля для прогресс-бара — слова «вышли на повторение», аналог порога прогресса Q≥3 в файле экспорта */
export function isReviewStageForDictionaryPct(sched: CardSchedule | null, wordMastered?: boolean): boolean {
  if (wordMastered) return true
  return !!sched && sched.bucket === 'review'
}
