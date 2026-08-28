/** Счётчик оценённых карточек за календарный день и серия дней с занятиями. */

const LS_KEY = 'vocabdesk-daily-learned-v1'
const LS_KEY_LEGACY = 'myreword-daily-learned-v1'
const MAX_DAYS = 400

export interface DailyLearnedPayload {
  d: string
  n: number
  /** Календарные дни (YYYY-MM-DD), когда была хотя бы одна оценённая карточка */
  days: string[]
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return dt.toISOString().slice(0, 10)
}

function readPayload(): DailyLearnedPayload {
  try {
    let raw = localStorage.getItem(LS_KEY)
    if (!raw) {
      raw = localStorage.getItem(LS_KEY_LEGACY)
      if (raw) {
        try {
          localStorage.setItem(LS_KEY, raw)
          localStorage.removeItem(LS_KEY_LEGACY)
        } catch {
          /* ignore */
        }
      }
    }
    if (!raw) return { d: '', n: 0, days: [] }
    const p = JSON.parse(raw) as { d?: string; n?: number; days?: unknown }
    const days = Array.isArray(p.days)
      ? p.days.filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x))
      : []
    const d = String(p.d ?? '')
    const n = Math.max(0, Math.floor(Number(p.n) || 0))
    if (d && n > 0 && !days.includes(d)) days.push(d)
    return { d, n, days }
  } catch {
    return { d: '', n: 0, days: [] }
  }
}

function writePayload(p: DailyLearnedPayload): void {
  const days = [...new Set(p.days)].sort().slice(-MAX_DAYS)
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ d: p.d, n: p.n, days }))
    localStorage.removeItem(LS_KEY_LEGACY)
  } catch {
    /* ignore */
  }
}

export function getDailyLearnedCount(): number {
  const { d, n } = readPayload()
  return d !== todayYmd() ? 0 : n
}

export function bumpDailyLearned(): void {
  const d = todayYmd()
  const prev = readPayload()
  const n = prev.d === d ? prev.n : 0
  const days = prev.days.includes(d) ? prev.days : [...prev.days, d]
  writePayload({ d, n: n + 1, days })
}

/** Подряд идущие дни с занятиями: если сегодня ещё пусто — серия от вчера (день ещё не закончен). */
export function getStudyStreak(): number {
  const { days, d, n } = readPayload()
  const set = new Set(days)
  const today = todayYmd()
  if (d === today && n > 0) set.add(today)
  let cursor = set.has(today) ? today : shiftYmd(today, -1)
  if (!set.has(cursor)) return 0
  let streak = 0
  while (set.has(cursor)) {
    streak++
    cursor = shiftYmd(cursor, -1)
  }
  return streak
}

/** Была ли хотя бы одна карточка в календарный день YYYY-MM-DD. */
export function hadStudyOn(ymd: string): boolean {
  const { days, d, n } = readPayload()
  if (d === ymd && n > 0) return true
  return days.includes(ymd)
}

/** Последние 7 календарных дней (Пн…Вс текущей недели по локальному времени, ключи — UTC ISO date). */
export function getCurrentWeekStudyFlags(): boolean[] {
  const now = new Date()
  const day = now.getDay() === 0 ? 6 : now.getDay() - 1
  const monday = new Date(now)
  monday.setHours(12, 0, 0, 0)
  monday.setDate(monday.getDate() - day)
  const flags: boolean[] = []
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday)
    dt.setDate(monday.getDate() + i)
    flags.push(hadStudyOn(dt.toISOString().slice(0, 10)))
  }
  return flags
}
