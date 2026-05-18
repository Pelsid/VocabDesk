import { stripHighlights } from './examples'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Нормализация для сравнения ответа в режиме cloze */
export function normalizeLemmaGuess(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^[''"]|[''"]$/g, '')
    .replace(/\s+/g, ' ')
}

export function lemmaMatchesGuess(lemma: string, guess: string): boolean {
  const a = normalizeLemmaGuess(lemma)
  const b = normalizeLemmaGuess(guess)
  if (!a || !b) return false
  return a === b
}

export interface ClozeLine {
  /** Предложение с пропуском */
  display: string
  /** Исходное EN-предложение (полное) */
  fullOriginal: string
}

/**
 * Берёт первый пример, где встречается lemma как целое слово, и подставляет пропуск.
 */
export function pickClozeLine(lemma: string, exampleOriginals: string[]): ClozeLine | null {
  const raw = lemma.trim()
  if (!raw) return null
  const re = new RegExp(`\\b${escapeRegExp(raw)}\\b`, 'i')
  for (const line of exampleOriginals) {
    const s = stripHighlights(line).trim()
    if (!s || !re.test(s)) continue
    const display = s.replace(re, '______')
    return { display, fullOriginal: s }
  }
  return null
}
