export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2'

export interface GrammarExample {
  en: string
  ru: string
  /** Когда форма уместна */
  note?: string
}

export interface GrammarLesson {
  /** Стабильный id, например a2-present-perfect */
  id: string
  level: CefrLevel
  /** Заголовок по-русски */
  title: string
  /** 1–2 предложения «зачем это» */
  gist: string
  /** Схема формы: have/has + V3 */
  form: string
  rules: string[]
  examples: GrammarExample[]
  /** Типичные ошибки с русского */
  pitfalls: string[]
  /** id соседних тем */
  seeAlso: string[]
}
