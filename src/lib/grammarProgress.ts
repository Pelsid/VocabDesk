const LS_KEY = 'vocabdesk-grammar-v1'
const SELECTED_KEY = 'vocabdesk-grammar-selected'

interface GrammarProgressPayload {
  v: 1
  done: string[]
}

export function loadGrammarDone(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as GrammarProgressPayload
    if (parsed?.v !== 1 || !Array.isArray(parsed.done)) return new Set()
    return new Set(parsed.done.filter((x): x is string => typeof x === 'string' && x.length > 0))
  } catch {
    return new Set()
  }
}

function saveGrammarDone(done: Set<string>): void {
  try {
    const payload: GrammarProgressPayload = { v: 1, done: [...done] }
    localStorage.setItem(LS_KEY, JSON.stringify(payload))
  } catch {
    /* квота / приватный режим */
  }
}

export function isGrammarLessonDone(id: string): boolean {
  return loadGrammarDone().has(id)
}

export function toggleGrammarLessonDone(id: string): Set<string> {
  const next = loadGrammarDone()
  if (next.has(id)) next.delete(id)
  else next.add(id)
  saveGrammarDone(next)
  return next
}

export function clearGrammarDone(): Set<string> {
  saveGrammarDone(new Set())
  return new Set()
}

export function loadSelectedGrammarLessonId(): string | null {
  try {
    const id = sessionStorage.getItem(SELECTED_KEY)
    return id && id.trim() ? id : null
  } catch {
    return null
  }
}

export function saveSelectedGrammarLessonId(id: string | null): void {
  try {
    if (!id) sessionStorage.removeItem(SELECTED_KEY)
    else sessionStorage.setItem(SELECTED_KEY, id)
  } catch {
    /* ignore */
  }
}
