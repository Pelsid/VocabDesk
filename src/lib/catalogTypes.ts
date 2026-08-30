export type DictionaryKind = 'oxford' | 'thematic' | 'other'

export type WordFilter = 'all' | 'new' | 'learning' | 'review'

export interface CategoryStat {
  id: string
  name: string
  isCustom: boolean
  isSelected: boolean
  customIcon: string | null
  wordCount: number
  learnedCount: number
  kind?: DictionaryKind
  cefr?: string | null
  oxfordOverlap?: number
}

export interface WordRow {
  id: number
  word: string
  rus: string | null
  transcription: string | null
  qRec: number
  qRep: number
  examplesRus: string | null
  pictureId: number | null
  picSource: string | null
  picSourceId: string | null
  picBlobLen: number
  oxfordLevels?: string[]
}
