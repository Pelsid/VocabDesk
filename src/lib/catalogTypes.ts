export type DictionaryKind = 'level' | 'thematic' | 'other'

export const ORPHAN_DICTIONARY_ID = '__orphans__'

export type WordFilter = 'all' | 'new' | 'learning' | 'review'

export interface CategoryStat {
  id: string
  name: string
  isCustom: boolean
  isSelected: boolean
  canEdit?: boolean
  customIcon: string | null
  wordCount: number
  learnedCount: number
  kind?: DictionaryKind
  cefr?: string | null
}

export interface WordRow {
  id: number
  word: string
  rus: string | null
  transcription: string | null
  pos?: number | null
  qRec: number
  qRep: number
  examplesRus: string | null
  pictureId: number | null
  picSource: string | null
  picSourceId: string | null
  picBlobLen: number
  levels?: string[]
  isOwn?: boolean
  dictionaryIds?: string[]
}

export type WordRelationKind = 'related' | 'synonym' | 'antonym' | 'form' | 'collocation'

export interface WordRelation {
  wordId: number
  relatedWordId: number
  relation: WordRelationKind
  note: string | null
  other: WordRow
}
