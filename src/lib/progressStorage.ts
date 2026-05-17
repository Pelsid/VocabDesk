import {
  DEFAULT_PREFS,
  PROGRESS_LS_KEY,
  type ProgressSnapshot,
  emptySnapshot,
} from './progressTypes'

/** Ключ прежней версии приложения — читается один раз для переноса в новый ключ. */
const PROGRESS_LS_LEGACY = 'myreword-progress-v2'

export function loadProgress(): ProgressSnapshot {
  try {
    let raw = localStorage.getItem(PROGRESS_LS_KEY)
    if (!raw) {
      raw = localStorage.getItem(PROGRESS_LS_LEGACY)
      if (raw) {
        try {
          localStorage.setItem(PROGRESS_LS_KEY, raw)
          localStorage.removeItem(PROGRESS_LS_LEGACY)
        } catch {
          /* квота/приватный режим — оставляем как есть */
        }
      }
    }
    if (!raw) return emptySnapshot()
    const parsed = JSON.parse(raw) as ProgressSnapshot
    if (parsed?.v !== 1 || typeof parsed.words !== 'object') return emptySnapshot()
    return {
      v: 1,
      words: parsed.words ?? {},
      prefs: { ...DEFAULT_PREFS, ...parsed.prefs },
      mastered:
        parsed.mastered && typeof parsed.mastered === 'object'
          ? { ...(parsed.mastered as Record<string, true>) }
          : {},
    }
  } catch {
    return emptySnapshot()
  }
}

export function saveProgress(s: ProgressSnapshot) {
  localStorage.setItem(PROGRESS_LS_KEY, JSON.stringify(s))
  localStorage.removeItem(PROGRESS_LS_LEGACY)
}

export function clearProgressStorage() {
  localStorage.removeItem(PROGRESS_LS_KEY)
  localStorage.removeItem(PROGRESS_LS_LEGACY)
}
