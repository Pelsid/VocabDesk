import type { CefrLevel, GrammarLesson } from './types'
import { A1_LESSONS } from './lessons/a1'
import { A2_LESSONS } from './lessons/a2'
import { B1_LESSONS } from './lessons/b1'
import { B2_LESSONS } from './lessons/b2'

export const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']

export const GRAMMAR_LESSONS: GrammarLesson[] = [...A1_LESSONS, ...A2_LESSONS, ...B1_LESSONS, ...B2_LESSONS]

const byId = new Map(GRAMMAR_LESSONS.map((lesson) => [lesson.id, lesson]))

export function getLesson(id: string): GrammarLesson | undefined {
  return byId.get(id)
}

export function lessonsByLevel(level: CefrLevel | 'all'): GrammarLesson[] {
  if (level === 'all') return GRAMMAR_LESSONS
  return GRAMMAR_LESSONS.filter((lesson) => lesson.level === level)
}

export function searchLessons(query: string, level: CefrLevel | 'all'): GrammarLesson[] {
  const list = lessonsByLevel(level)
  const needle = query.trim().toLowerCase()
  if (!needle) return list
  return list.filter(
    (lesson) =>
      lesson.title.toLowerCase().includes(needle) ||
      lesson.gist.toLowerCase().includes(needle) ||
      lesson.form.toLowerCase().includes(needle) ||
      lesson.id.toLowerCase().includes(needle),
  )
}
