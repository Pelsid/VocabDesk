import type { CategoryStat, WordRelation, WordRelationKind, WordRow } from '../lib/catalogTypes'
import type { Grade, ProgressSnapshot, UserPrefs } from '../lib/progressTypes'

export class UnauthorizedError extends Error {
  readonly status = 401
  constructor(message = 'Требуется вход') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-VD-Request': '1',
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
  if (res.status === 401) {
    const err =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : 'Требуется вход'
    onUnauthorized?.()
    throw new UnauthorizedError(err)
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

export interface AuthUser {
  id: number
  email: string
  displayName: string
}

export interface DailyPayload {
  todayCount: number
  days: string[]
  dayCounts?: Record<string, number>
  streak: number
  weekFlags: boolean[]
}

export interface BootstrapPayload {
  dictionaries: CategoryStat[]
  dictionaryWordIds: Record<string, number[]>
  progress: ProgressSnapshot
  daily: DailyPayload
  hasGroqKey: boolean
  orphanWordCount?: number
}

export function fetchMe() {
  return api<{ user: AuthUser | null }>('/api/auth.php?action=me')
}

export function postRegister(body: { email: string; password: string; displayName?: string }) {
  return api<{ user: AuthUser }>('/api/auth.php?action=register', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function postLogin(body: { email: string; password: string }) {
  return api<{ user: AuthUser }>('/api/auth.php?action=login', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function postLogout(allDevices = false) {
  return api<{ ok: true }>('/api/auth.php?action=logout', {
    method: 'POST',
    body: JSON.stringify({ allDevices }),
  })
}

export function putChangePassword(currentPassword: string, newPassword: string) {
  return api<{ ok: true }>('/api/auth.php?action=changePassword', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export function deleteAccount(password: string) {
  return api<{ ok: true }>('/api/auth.php?action=account', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  })
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

export function postCreateDictionary(name: string, iconKey?: string) {
  return api<{ dictionary: CategoryStat }>('/api/dictionaries.php', {
    method: 'POST',
    body: JSON.stringify({ action: 'create', name, iconKey }),
  }).then((r) => r.dictionary)
}

export function putRenameDictionary(dictionaryId: string, name: string, iconKey?: string) {
  return api<{ dictionary: CategoryStat }>('/api/dictionaries.php', {
    method: 'PUT',
    body: JSON.stringify({ action: 'rename', dictionaryId, name, iconKey }),
  }).then((r) => r.dictionary)
}

export function putSetDictionarySelected(dictionaryId: string, isSelected: boolean) {
  return api<{ dictionary: CategoryStat }>('/api/dictionaries.php', {
    method: 'PUT',
    body: JSON.stringify({ action: 'setSelected', dictionaryId, isSelected }),
  }).then((r) => r.dictionary)
}

export function deleteDictionary(dictionaryId: string) {
  return api<{ ok: true }>('/api/dictionaries.php', {
    method: 'DELETE',
    body: JSON.stringify({ action: 'delete', dictionaryId }),
  })
}

export function putAddWords(dictionaryId: string, wordIds: number[]) {
  return api<{ dictionary: CategoryStat }>('/api/dictionaries.php', {
    method: 'PUT',
    body: JSON.stringify({ action: 'addWords', dictionaryId, wordIds }),
  }).then((r) => r.dictionary)
}

export function putRemoveWords(dictionaryId: string, wordIds: number[]) {
  return api<{ dictionary: CategoryStat }>('/api/dictionaries.php', {
    method: 'PUT',
    body: JSON.stringify({ action: 'removeWords', dictionaryId, wordIds }),
  }).then((r) => r.dictionary)
}

export function postCreateWord(body: {
  dictionaryId: string
  lemma: string
  rus?: string
  transcription?: string
  examples?: { o: string; t: string }[]
}) {
  return api<{
    word: WordRow
    reused: boolean
    suggestGlobal: WordRow[]
    dictionary: CategoryStat | null
  }>('/api/user_words.php', {
    method: 'POST',
    body: JSON.stringify({ action: 'create', ...body }),
  })
}

export function putUpdateWord(body: {
  wordId: number
  lemma?: string
  rus?: string
  transcription?: string
  examples?: { o: string; t: string }[]
}) {
  return api<{ word: WordRow }>('/api/user_words.php', {
    method: 'PUT',
    body: JSON.stringify({ action: 'update', ...body }),
  }).then((r) => r.word)
}

export function deleteUserWord(wordId: number) {
  return api<{ ok: true }>('/api/user_words.php', {
    method: 'DELETE',
    body: JSON.stringify({ action: 'delete', wordId }),
  })
}

export function fetchOrphanWords() {
  return api<{ words: WordRow[] }>('/api/user_words.php?action=orphans').then((r) => r.words)
}

export function postPurgeOrphans() {
  return api<{ ok: true }>('/api/user_words.php', {
    method: 'POST',
    body: JSON.stringify({ action: 'purgeOrphans' }),
  })
}

export function fetchWordRelations(wordId: number) {
  return api<{ relations: WordRelation[] }>(`/api/user_words.php?action=relations&wordId=${wordId}`).then(
    (r) => r.relations,
  )
}

export function putLinkWords(body: {
  wordId: number
  relatedWordId: number
  relation?: WordRelationKind
  note?: string
}) {
  return api<{ relations: WordRelation[] }>('/api/user_words.php', {
    method: 'PUT',
    body: JSON.stringify({ action: 'link', ...body }),
  }).then((r) => r.relations)
}

export function deleteWordLink(wordId: number, relatedWordId: number, relation: WordRelationKind) {
  return api<{ relations: WordRelation[] }>('/api/user_words.php', {
    method: 'DELETE',
    body: JSON.stringify({ action: 'unlink', wordId, relatedWordId, relation }),
  }).then((r) => r.relations)
}
