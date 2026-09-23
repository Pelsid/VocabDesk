import { BLOCK_COLORS, BLOCK_RATIO, COLOR_RUN } from './gameConfig'
import type { BlockColor, GameTile, GameWord, SpawnItem } from './gameTypes'

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

export function isWordTile(tile: GameTile): boolean {
  return tile.type === 'english' || tile.type === 'translation'
}

export function isMatch(a: GameTile, b: GameTile): boolean {
  return a.id !== b.id && a.wordId === b.wordId && a.type !== b.type && isWordTile(a) && isWordTile(b)
}

export function tileText(word: GameWord, type: 'english' | 'translation'): string {
  return type === 'english' ? word.english : word.translation
}

function makeTile(
  word: GameWord,
  type: 'english' | 'translation',
  row: number,
  col: number,
  nextId: () => string,
  state: GameTile['state'] = 'normal',
): GameTile {
  return {
    id: nextId(),
    wordId: word.id,
    text: tileText(word, type),
    type,
    row,
    col,
    state,
  }
}

function makeBlock(
  color: BlockColor,
  row: number,
  col: number,
  nextId: () => string,
  state: GameTile['state'] = 'normal',
): GameTile {
  return {
    id: nextId(),
    wordId: 0,
    text: '',
    type: 'block',
    color,
    row,
    col,
    state,
  }
}

function wordCellCount(total: number): number {
  let count = Math.round(total * (1 - BLOCK_RATIO))
  if (count % 2) count -= 1
  if (count < 2) count = 2
  if (count > total) count = total - (total % 2)
  return count
}

function sameBlock(tile: GameTile | null | undefined, color: BlockColor): boolean {
  return tile?.type === 'block' && tile.color === color
}

function runLengthIfPlaced(
  grid: (GameTile | null)[][],
  row: number,
  col: number,
  color: BlockColor,
  size: number,
): number {
  let left = 0
  for (let c = col - 1; c >= 0 && sameBlock(grid[row]?.[c], color); c--) left += 1
  let right = 0
  for (let c = col + 1; c < size && sameBlock(grid[row]?.[c], color); c++) right += 1
  let up = 0
  for (let r = row - 1; r >= 0 && sameBlock(grid[r]?.[col], color); r--) up += 1
  let down = 0
  for (let r = row + 1; r < size && sameBlock(grid[r]?.[col], color); r++) down += 1
  return Math.max(left + right + 1, up + down + 1)
}

function pickSafeColor(grid: (GameTile | null)[][], row: number, col: number, size: number): BlockColor {
  const order = shuffle(BLOCK_COLORS)
  let best: BlockColor = order[0] ?? 'teal'
  let bestLen = Number.POSITIVE_INFINITY
  for (const color of order) {
    const len = runLengthIfPlaced(grid, row, col, color, size)
    if (len < COLOR_RUN) return color
    if (len < bestLen) {
      best = color
      bestLen = len
    }
  }
  return best
}

export function createBoard(words: GameWord[], size: number, nextId: () => string): GameTile[] {
  if (!words.length || size < 2) return []
  const slots: { row: number; col: number }[] = []
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) slots.push({ row, col })
  }
  const shuffled = shuffle(slots)
  const wordCells = Math.min(wordCellCount(shuffled.length), shuffled.length - (shuffled.length % 2))
  const grid: (GameTile | null)[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => null))
  const tiles: GameTile[] = []
  const pairs = wordCells / 2
  for (let i = 0; i < pairs; i++) {
    const word = words[i % words.length]
    const a = shuffled[i * 2]
    const b = shuffled[i * 2 + 1]
    if (!word || !a || !b) continue
    const english = makeTile(word, 'english', a.row, a.col, nextId)
    const translation = makeTile(word, 'translation', b.row, b.col, nextId)
    tiles.push(english, translation)
    const rowA = grid[a.row]
    const rowB = grid[b.row]
    if (rowA) rowA[a.col] = english
    if (rowB) rowB[b.col] = translation
  }
  for (let i = wordCells; i < shuffled.length; i++) {
    const slot = shuffled[i]
    if (!slot) continue
    const color = pickSafeColor(grid, slot.row, slot.col, size)
    const block = makeBlock(color, slot.row, slot.col, nextId)
    tiles.push(block)
    const row = grid[slot.row]
    if (row) row[slot.col] = block
  }
  for (let attempt = 0; attempt < 24 && findColorRuns(tiles, size).length; attempt++) {
    const stuck = findColorRuns(tiles, size)
    const tile = tiles.find((item) => item.id === stuck[0] && item.type === 'block')
    if (!tile) break
    const row = grid[tile.row]
    if (row) row[tile.col] = null
    tile.color = pickSafeColor(grid, tile.row, tile.col, size)
    if (row) row[tile.col] = tile
  }
  return tiles
}

/** Очередь пополнения: иногда пара приходит не сразу, а через несколько тайлов. */
export function buildSpawnQueue(words: GameWord[], pairs: number): SpawnItem[] {
  if (!words.length) return []
  const queue: SpawnItem[] = []
  const hold: SpawnItem[] = []
  const steps = (pairs + words.length) * 2
  for (let i = 0; i < steps; i++) {
    const waiting = hold[0]
    if (waiting && (i % 3 === 0 || hold.length > 3)) {
      hold.shift()
      queue.push(waiting)
      continue
    }
    const word = words[i % words.length]
    const type: 'english' | 'translation' = i % 2 === 0 ? 'english' : 'translation'
    const mate: 'english' | 'translation' = type === 'english' ? 'translation' : 'english'
    queue.push({ wordId: word.id, type })
    if (i % 4 === 0) hold.push({ wordId: word.id, type: mate })
    else queue.push({ wordId: word.id, type: mate })
  }
  return [...queue, ...hold]
}

export function applyGravity(tiles: GameTile[], size: number): { tiles: GameTile[]; holes: { row: number; col: number }[] } {
  const next: GameTile[] = []
  const holes: { row: number; col: number }[] = []
  for (let col = 0; col < size; col++) {
    const column = tiles.filter((tile) => tile.col === col).sort((a, b) => b.row - a.row)
    column.forEach((tile, index) => {
      const row = size - 1 - index
      next.push({
        ...tile,
        row,
        col,
        state: tile.row === row ? 'normal' : 'falling',
      })
    })
    for (let row = 0; row < size - column.length; row++) holes.push({ row, col })
  }
  return { tiles: next, holes }
}

function cellAt(tiles: GameTile[], row: number, col: number): GameTile | null {
  return tiles.find((tile) => tile.row === row && tile.col === col) ?? null
}

function collectRun(line: (GameTile | null)[], into: Set<string>) {
  let start = 0
  while (start < line.length) {
    const tile = line[start]
    if (!tile || tile.type !== 'block' || !tile.color) {
      start += 1
      continue
    }
    let end = start + 1
    while (end < line.length && sameBlock(line[end], tile.color)) end += 1
    if (end - start >= COLOR_RUN) {
      for (let i = start; i < end; i++) {
        const item = line[i]
        if (item) into.add(item.id)
      }
    }
    start = end
  }
}

/** Горизонтальные и вертикальные серии цветных квадратов. Слова линию обрывают. */
export function findColorRuns(tiles: GameTile[], size: number): string[] {
  const ids = new Set<string>()
  for (let row = 0; row < size; row++) {
    const line: (GameTile | null)[] = []
    for (let col = 0; col < size; col++) line.push(cellAt(tiles, row, col))
    collectRun(line, ids)
  }
  for (let col = 0; col < size; col++) {
    const line: (GameTile | null)[] = []
    for (let row = 0; row < size; row++) line.push(cellAt(tiles, row, col))
    collectRun(line, ids)
  }
  return [...ids]
}

type HoleFill = {
  row: number
  col: number
  kind: 'block' | 'english' | 'translation'
  color?: BlockColor
  wordId?: number
}

function takeWord(queue: SpawnItem[], words: GameWord[], index: number): { item: SpawnItem; queue: SpawnItem[] } {
  const nextQueue = queue.slice()
  const next = nextQueue.shift()
  if (next) return { item: next, queue: nextQueue }
  const word = words[index % words.length] ?? words[0]
  if (!word) return { item: { wordId: 0, type: 'english' }, queue: nextQueue }
  nextQueue.unshift({ wordId: word.id, type: 'translation' })
  return { item: { wordId: word.id, type: 'english' }, queue: nextQueue }
}

function sidesOf(board: GameTile[], fills: HoleFill[]) {
  const english = new Set<number>()
  const translation = new Set<number>()
  for (const tile of board) {
    if (tile.type === 'english') english.add(tile.wordId)
    else if (tile.type === 'translation') translation.add(tile.wordId)
  }
  for (const fill of fills) {
    if (fill.kind === 'english' && fill.wordId != null) english.add(fill.wordId)
    else if (fill.kind === 'translation' && fill.wordId != null) translation.add(fill.wordId)
  }
  return { english, translation }
}

function hasPairSides(english: Set<number>, translation: Set<number>): boolean {
  for (const id of english) {
    if (translation.has(id)) return true
  }
  return false
}

function ensureVisiblePair(fills: HoleFill[], board: GameTile[], words: GameWord[], queue: SpawnItem[]): SpawnItem[] {
  const nextQueue = queue.slice()
  if (!words.length || !fills.length || hasPairSides(sidesOf(board, fills).english, sidesOf(board, fills).translation)) {
    return nextQueue
  }
  const sides = sidesOf(board, fills)
  let mate: SpawnItem | null = null
  for (const id of sides.english) {
    if (!sides.translation.has(id)) {
      mate = { wordId: id, type: 'translation' }
      break
    }
  }
  if (!mate) {
    for (const id of sides.translation) {
      if (!sides.english.has(id)) {
        mate = { wordId: id, type: 'english' }
        break
      }
    }
  }
  const host = fills.findIndex((fill) => fill.kind === 'block')
  const index = host >= 0 ? host : fills.length - 1
  const slot = fills[index]
  if (!slot) return nextQueue
  if (!mate) {
    const word = words[0]
    if (!word) return nextQueue
    fills[index] = { row: slot.row, col: slot.col, kind: 'english', wordId: word.id }
    const second = fills.findIndex((fill, fillIndex) => fillIndex !== index && fill.kind === 'block')
    const other = second >= 0 ? fills[second] : null
    if (other) fills[second] = { row: other.row, col: other.col, kind: 'translation', wordId: word.id }
    else nextQueue.unshift({ wordId: word.id, type: 'translation' })
    return nextQueue
  }
  if (slot.kind !== 'block' && slot.wordId != null) {
    nextQueue.unshift({ wordId: slot.wordId, type: slot.kind === 'translation' ? 'translation' : 'english' })
  }
  fills[index] = { row: slot.row, col: slot.col, kind: mate.type, wordId: mate.wordId }
  return nextQueue
}

export function planFills(
  queue: SpawnItem[],
  words: GameWord[],
  holes: { row: number; col: number }[],
  board: GameTile[],
): { fills: HoleFill[]; queue: SpawnItem[] } {
  let nextQueue = queue.slice()
  const fills: HoleFill[] = []
  if (!holes.length) return { fills, queue: nextQueue }
  holes.forEach((hole, index) => {
    if (words.length && Math.random() >= BLOCK_RATIO) {
      const taken = takeWord(nextQueue, words, index)
      nextQueue = taken.queue
      fills.push({ row: hole.row, col: hole.col, kind: taken.item.type, wordId: taken.item.wordId })
      return
    }
    const color = BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)] ?? 'teal'
    fills.push({ row: hole.row, col: hole.col, kind: 'block', color })
  })
  nextQueue = ensureVisiblePair(fills, board, words, nextQueue)
  return { fills, queue: nextQueue }
}

export function tilesFromFills(fills: HoleFill[], words: GameWord[], nextId: () => string): GameTile[] {
  const byId = new Map(words.map((word) => [word.id, word]))
  const fallback = words[0]
  return fills.map((fill) => {
    if (fill.kind === 'block') return makeBlock(fill.color ?? 'teal', fill.row, fill.col, nextId, 'new')
    const word = (fill.wordId != null && byId.get(fill.wordId)) || fallback
    if (!word) return makeBlock('teal', fill.row, fill.col, nextId, 'new')
    const type = fill.kind === 'translation' ? 'translation' : 'english'
    return makeTile(word, type, fill.row, fill.col, nextId, 'new')
  })
}

export function findMatchPair(tiles: GameTile[]): [GameTile, GameTile] | null {
  const english = new Map<number, GameTile>()
  for (const tile of tiles) {
    if (tile.type === 'english') english.set(tile.wordId, tile)
  }
  for (const tile of tiles) {
    if (tile.type !== 'translation') continue
    const mate = english.get(tile.wordId)
    if (mate && mate.id !== tile.id) return [mate, tile]
  }
  return null
}

export function boardHasPair(tiles: GameTile[]): boolean {
  return findMatchPair(tiles) != null
}
