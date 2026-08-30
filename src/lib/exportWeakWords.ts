import type { WordRow } from './catalogTypes'
import type { ProgressSnapshot } from './progressTypes'

/** Текстовый список слов из журнала «Снова» / «Сложно» для разбора вне приложения. */
export function buildWeakWordsExportText(rows: WordRow[], snapshot: ProgressSnapshot): string {
  const log = snapshot.weakWordLog ?? []
  if (!log.length) return ''

  const byId = new Map(rows.map((w) => [w.id, w]))

  const lines: string[] = [
    '# VocabDesk — слова после оценок «Снова» и «Сложно»',
    '# Формат: слово<TAB>перевод<TAB>метаданные',
    '',
  ]

  for (const e of log) {
    const w = byId.get(e.id)
    if (!w) continue
    const meta = `id=${w.id}; grade=${e.g}; time=${new Date(e.at).toISOString()}`
    lines.push(`${w.word}\t${w.rus ?? ''}\t${meta}`)
  }

  return lines.join('\n')
}
