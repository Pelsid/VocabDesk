import { getLesson, GRAMMAR_LESSONS } from '../grammar/catalog'
import type { GrammarLesson } from '../grammar/types'

const LEMMA_LESSONS: Record<string, string[]> = {
  be: ['a1-to-be'],
  been: ['a2-present-perfect', 'b1-pp-vs-past'],
  being: ['a1-present-continuous', 'a2-passive'],
  am: ['a1-to-be'],
  is: ['a1-to-be', 'a1-there-is'],
  are: ['a1-to-be'],
  was: ['a1-past-simple', 'a2-past-continuous'],
  were: ['a1-past-simple', 'a2-past-continuous'],
  have: ['a1-have-got', 'a2-present-perfect'],
  has: ['a1-have-got', 'a2-present-perfect'],
  had: ['b1-past-perfect'],
  will: ['a2-will-going-to', 'b1-future-forms'],
  would: ['b1-second-conditional', 'b1-wish'],
  can: ['a1-can'],
  could: ['a1-can', 'b1-modals-deduction'],
  must: ['a2-modals-obligation'],
  should: ['a2-modals-obligation', 'b2-had-better'],
  may: ['b1-modals-deduction'],
  might: ['b1-modals-deduction'],
  if: ['a2-first-conditional', 'b1-second-conditional'],
  although: ['b1-although-despite'],
  despite: ['b1-although-despite'],
  used: ['b1-used-to'],
  going: ['a1-going-to', 'a2-will-going-to'],
  the: ['a1-articles-plurals', 'b1-articles'],
  a: ['a1-articles-plurals'],
  an: ['a1-articles-plurals'],
  this: ['a1-this-that'],
  that: ['a1-this-that', 'a2-relative-basic'],
  these: ['a1-this-that'],
  those: ['a1-this-that'],
  some: ['a1-some-any'],
  any: ['a1-some-any'],
  there: ['a1-there-is'],
  which: ['a2-relative-basic', 'b1-defining-relative'],
  who: ['a2-relative-basic', 'b1-defining-relative'],
  whose: ['b1-defining-relative', 'b2-non-defining-relative'],
  remember: ['b2-remember-try'],
  try: ['b2-remember-try'],
  wish: ['b1-wish', 'b2-wish-if-only'],
  better: ['a2-comparatives', 'b2-had-better'],
  get: ['a2-gerund-infinitive', 'b1-gerund-infinitive'],
  take: ['a2-gerund-infinitive'],
  put: ['a2-gerund-infinitive'],
  look: ['a2-gerund-infinitive'],
  go: ['a1-going-to', 'a2-gerund-infinitive'],
  come: ['a2-gerund-infinitive'],
  make: ['a2-gerund-infinitive'],
  back: ['a2-gerund-infinitive', 'a1-prepositions'],
}

const PHRASAL_HEADS = new Set([
  'get',
  'take',
  'put',
  'look',
  'go',
  'come',
  'give',
  'make',
  'set',
  'turn',
  'break',
  'carry',
  'pick',
  'run',
  'hold',
  'keep',
  'bring',
  'call',
  'back',
])

function addLesson(hits: GrammarLesson[], id: string) {
  const lesson = getLesson(id)
  if (!lesson || hits.some((h) => h.id === lesson.id)) return
  hits.push(lesson)
}

export function relatedGrammarForWord(lemma: string, oxfordLevels?: string[]): GrammarLesson[] {
  const w = lemma.toLowerCase().trim()
  const hits: GrammarLesson[] = []
  for (const id of LEMMA_LESSONS[w] ?? []) addLesson(hits, id)

  if (w.includes(' ') || w.includes('-') || PHRASAL_HEADS.has(w)) {
    addLesson(hits, 'a2-gerund-infinitive')
    addLesson(hits, 'a1-prepositions')
  }

  if (hits.length < 3) {
    for (const lesson of GRAMMAR_LESSONS) {
      const blob = `${lesson.title} ${lesson.gist} ${lesson.examples.map((e) => e.en).join(' ')}`.toLowerCase()
      if (blob.split(/[^a-z']+/).includes(w)) addLesson(hits, lesson.id)
      if (hits.length >= 3) break
    }
  }

  if (hits.length === 0 && oxfordLevels?.[0]) {
    const lv = oxfordLevels[0].replace(/[^a-z0-9]/gi, '').toUpperCase()
    const fallback = GRAMMAR_LESSONS.find((l) => l.level === lv)
    if (fallback) addLesson(hits, fallback.id)
  }

  return hits.slice(0, 3)
}

export function lemmasRelatedToLesson(lessonId: string): string[] {
  const out: string[] = []
  for (const [lemma, ids] of Object.entries(LEMMA_LESSONS)) {
    if (ids.includes(lessonId)) out.push(lemma)
  }
  return out.slice(0, 8)
}
