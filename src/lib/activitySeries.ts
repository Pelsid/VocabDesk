function ymd(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}

function startOfWeek(now = new Date()): Date {
  const day = now.getDay() === 0 ? 6 : now.getDay() - 1
  const monday = new Date(now)
  monday.setHours(12, 0, 0, 0)
  monday.setDate(monday.getDate() - day)
  return monday
}

export function weekCounts(dayCounts: Record<string, number> | undefined, now = new Date()): number[] {
  const monday = startOfWeek(now)
  const out: number[] = []
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday)
    dt.setDate(monday.getDate() + i)
    out.push(dayCounts?.[ymd(dt)] ?? 0)
  }
  return out
}

export function prevWeekTotal(dayCounts: Record<string, number> | undefined, now = new Date()): number {
  const monday = startOfWeek(now)
  let sum = 0
  for (let i = 7; i >= 1; i--) {
    const dt = new Date(monday)
    dt.setDate(monday.getDate() - i)
    sum += dayCounts?.[ymd(dt)] ?? 0
  }
  return sum
}

export function monthWeekCounts(dayCounts: Record<string, number> | undefined, now = new Date()): number[] {
  const monday = startOfWeek(now)
  const out: number[] = []
  for (let w = 3; w >= 0; w--) {
    let sum = 0
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday)
      dt.setDate(monday.getDate() - w * 7 + i)
      sum += dayCounts?.[ymd(dt)] ?? 0
    }
    out.push(sum)
  }
  return out
}

export function allTimeTotal(dayCounts: Record<string, number> | undefined): number {
  if (!dayCounts) return 0
  return Object.values(dayCounts).reduce((a, n) => a + n, 0)
}
