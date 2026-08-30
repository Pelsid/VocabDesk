import type { CategoryStat, WordRow } from '../lib/catalogTypes'
import type { Grade, ProgressSnapshot, UserPrefs } from '../lib/progressTypes'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    throw new Error(text.slice(0, 240) || `HTTP ${res.status}`)
  }
  if (!res.ok) {
    const err =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : text
    throw new Error(err || `HTTP ${res.status}`)
  }
  return parsed as T
}

export interface DailyPayload {
  todayCount: number
  days: string[]
  streak: number
  weekFlags: boolean[]
}

export interface BootstrapPayload {
  dictionaries: CategoryStat[]
  dictionaryWordIds: Record<string, number[]>
  progress: ProgressSnapshot
  daily: DailyPayload
  hasGroqKey: boolean
}

export function fetchBootstrap() {
  return api<BootstrapPayload>('/api/bootstrap.php')
}

export function fetchWordsByIds(ids: number[]) {
  if (!ids.length) return Promise.resolve([] as WordRow[])
  return api<{ words: WordRow[] }>(`/api/words.php?action=ids&ids=${ids.join(',')}`).then((r) => r.words)
}

export function fetchWordsInDictionary(dictionaryId: string, q = '') {
  const qs = new URLSearchParams({ dictionaryId, q })
  return api<{ words: WordRow[] }>(`/api/words.php?${qs}`).then((r) => r.words)
}

export function searchWords(q: string) {
  const qs = new URLSearchParams({ action: 'search', q })
  return api<{ words: WordRow[] }>(`/api/words.php?${qs}`).then((r) => r.words)
}

export function fetchQuizRus(args: {
  scope: 'selected' | 'category'
  categoryId: string | null
  exclude: number
  limit?: number
}) {
  const qs = new URLSearchParams({
    action: 'quiz_rus',
    scope: args.scope,
    exclude: String(args.exclude),
    limit: String(args.limit ?? 48),
  })
  if (args.categoryId) qs.set('categoryId', args.categoryId)
  return api<{ rus: string[] }>(`/api/words.php?${qs}`).then((r) => r.rus)
}

export function postGrade(wordId: number, grade: Grade) {
  return api<{
    wordId: number
    schedule: ProgressSnapshot['words'][string]
    mastered: boolean
    weakWordLog: ProgressSnapshot['weakWordLog']
    daily: DailyPayload
  }>('/api/progress.php', {
    method: 'PUT',
    body: JSON.stringify({ action: 'grade', wordId, grade }),
  })
}

export function postMaster(wordId: number) {
  return api<{
    wordId: number
    schedule: ProgressSnapshot['words'][string]
    mastered: boolean
    daily: DailyPayload
  }>('/api/progress.php', {
    method: 'PUT',
    body: JSON.stringify({ action: 'master', wordId }),
  })
}

export function postResetProgress() {
  return api<{ progress: ProgressSnapshot; daily: DailyPayload }>('/api/progress.php', {
    method: 'PUT',
    body: JSON.stringify({ action: 'reset' }),
  })
}

export function putSettings(body: { prefs?: Partial<UserPrefs>; groqApiKey?: string }) {
  return api<{ prefs: UserPrefs; hasGroqKey: boolean }>('/api/settings.php', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function fetchSettings() {
  return api<{ prefs: UserPrefs; hasGroqKey: boolean }>('/api/settings.php')
}
