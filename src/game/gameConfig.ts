import type { BlockColor, LevelConfig } from './gameTypes'

export const BOARD_SIZE = 8
export const MOBILE_BOARD_SIZE = 6
export const MOBILE_BOARD_BREAKPOINT = 720
export const BASE_SCORE = 50
export const HINTS_PER_LEVEL = 3
export const MAX_LEVEL_WORDS = 40
/** Доля клеток без слов. */
export const BLOCK_RATIO = 0.6
/** Сколько одинаковых цветных квадратов подряд сжигают линию. */
export const COLOR_RUN = 3
export const BLOCK_COLORS: BlockColor[] = ['teal', 'ok', 'warn', 'sky']

export function boardSizeForViewport(width: number): number {
  return width < MOBILE_BOARD_BREAKPOINT ? MOBILE_BOARD_SIZE : BOARD_SIZE
}

export function comboMultiplier(combo: number): number {
  if (combo <= 1) return 1
  if (combo === 2) return 1.2
  if (combo === 3) return 1.5
  return 2
}

export function pointsForCombo(combo: number): number {
  return Math.round(BASE_SCORE * comboMultiplier(combo))
}

/** Подпись серии в HUD: x1, x2, x3… */
export function comboLabel(combo: number): string {
  return `x${Math.max(1, combo)}`
}

export function levelConfig(n: number, boardSize = BOARD_SIZE): LevelConfig {
  const level = Math.max(1, Math.floor(n))
  const pairsToFind = 8 + (level - 1) * 4
  const wordCount = Math.min(MAX_LEVEL_WORDS, 6 + (level - 1) * 2)
  return {
    id: level,
    wordCount,
    pairsToFind,
    scoreGoal: pairsToFind * BASE_SCORE,
    timeSec: Math.max(60, 180 - (level - 1) * 15),
    hints: HINTS_PER_LEVEL,
    boardSize,
  }
}

/** Сколько новых слов добавляет уровень к пулу предыдущего. */
export function newWordsForLevel(level: number): number {
  const curr = levelConfig(level).wordCount
  if (level <= 1) return curr
  return curr - levelConfig(level - 1).wordCount
}

export function formatGameTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}
