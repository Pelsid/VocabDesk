/** Счётчик оценённых карточек за календарный день (для экрана «Учить»). */

const LS_KEY = 'vocabdesk-daily-learned-v1'
const LS_KEY_LEGACY = 'myreword-daily-learned-v1'

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function readPayload(): { d: string; n: number } {
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
    if (!raw) return { d: '', n: 0 }
    const p = JSON.parse(raw) as { d: string; n: number }
    return { d: String(p.d ?? ''), n: Math.max(0, Math.floor(Number(p.n) || 0)) }
  } catch {
    return { d: '', n: 0 }
  }
}

export function getDailyLearnedCount(): number {
  const { d, n } = readPayload()
  return d !== todayYmd() ? 0 : n
}

export function bumpDailyLearned(): void {
  const d = todayYmd()
  try {
    const { d: pd, n: prev } = readPayload()
    const n = pd === d ? prev : 0
    localStorage.setItem(LS_KEY, JSON.stringify({ d, n: n + 1 }))
    localStorage.removeItem(LS_KEY_LEGACY)
  } catch {
    /* ignore */
  }
}
