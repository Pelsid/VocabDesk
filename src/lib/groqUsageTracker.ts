/** Локальный учёт вызовов Groq API (успешные ответы) для ориентира по RPM/RPD. Хранится в localStorage. */

const LS_KEY = 'vocabdesk-groq-requests-v1'
const PRUNE_MS = 26 * 60 * 60 * 1000
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * 60 * 1000

export const GROQ_USAGE_EVENT = 'vocabdesk-groq-usage'

/** Лимиты по таблице Groq для частых моделей (RPM / RPD). Неизвестная модель — осторожный дефолт. */
export function getGroqLimitsForModel(model: string): { rpm: number; rpd: number } {
  const m = [
    ['openai/gpt-oss-120b', { rpm: 30, rpd: 1000 }],
    ['openai/gpt-oss-20b', { rpm: 30, rpd: 1000 }],
    ['qwen/qwen3.6-27b', { rpm: 30, rpd: 1000 }],
    ['qwen/qwen3-32b', { rpm: 60, rpd: 1000 }],
    ['meta-llama/llama-4-scout-17b-16e-instruct', { rpm: 30, rpd: 1000 }],
    ['groq/compound', { rpm: 30, rpd: 250 }],
    ['whisper-large-v3', { rpm: 20, rpd: 2000 }],
  ] as const
  const hit = m.find(([id]) => id === model)
  return hit ? { ...hit[1] } : { rpm: 30, rpd: 1000 }
}

function loadTimestamps(): number[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  } catch {
    return []
  }
}

function saveTimestamps(times: number[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(times))
  } catch {
    /* квота / приватный режим */
  }
}

/** Успешный завершённый запрос к chat/completions (учитываем только после ответа 200). */
export function recordGroqRequest(): void {
  const now = Date.now()
  const times = loadTimestamps().filter((t) => now - t < PRUNE_MS)
  times.push(now)
  saveTimestamps(times)
  window.dispatchEvent(new CustomEvent(GROQ_USAGE_EVENT))
}

export function getGroqUsageSnapshot(now: number): { lastMinute: number; last24h: number } {
  const times = loadTimestamps().filter((t) => now - t < PRUNE_MS)
  return {
    lastMinute: times.filter((t) => now - t < MINUTE_MS).length,
    last24h: times.filter((t) => now - t < DAY_MS).length,
  }
}

export function clearGroqUsageLog(): void {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* */
  }
  window.dispatchEvent(new CustomEvent(GROQ_USAGE_EVENT))
}
