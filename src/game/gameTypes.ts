/** Слово для мини-игры. id совпадает с каталогом, у mock — отрицательный. */
export interface GameWord {
  id: number
  english: string
  translation: string
  level: string
}

/**
 * english | translation — слова.
 * block — цветной квадрат без текста.
 * Остальные виды зарезервированы под бомбу, молнию, заморозку и плитку-подсказку.
 */
export type TileKind = 'english' | 'translation' | 'block' | 'bomb' | 'lightning' | 'freeze' | 'hint'

/** Четыре цвета пустых квадратов. Слова ими не красятся. */
export type BlockColor = 'teal' | 'ok' | 'warn' | 'sky'

export type TileState = 'normal' | 'selected' | 'matched' | 'wrong' | 'falling' | 'new' | 'hint'

export interface GameTile {
  id: string
  wordId: number
  text: string
  type: TileKind
  row: number
  col: number
  state: TileState
  color?: BlockColor
}

export interface LevelConfig {
  id: number
  wordCount: number
  pairsToFind: number
  scoreGoal: number
  timeSec: number
  hints: number
  boardSize: number
}

export type LevelEndReason = 'complete' | 'timeout'

/** Результат уровня — точка, куда позже можно отдать store или API. */
export interface LevelResult {
  level: number
  score: number
  wordsFound: number
  targetWords: number
  bestCombo: number
  newWords: number
  reason: LevelEndReason
}

export type GamePhase = 'loading' | 'playing' | 'resolving' | 'complete' | 'timeout'

export interface SpawnItem {
  wordId: number
  type: 'english' | 'translation'
}

export interface ScoreFloater {
  id: number
  text: string
  x: number
  y: number
}

export interface TileLink {
  a: string
  b: string
}
