import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  applyGravity,
  buildSpawnQueue,
  createBoard,
  findColorRuns,
  findMatchPair,
  isMatch,
  isWordTile,
  planFills,
  tilesFromFills,
} from './boardLogic'
import { boardSizeForViewport, levelConfig, newWordsForLevel, pointsForCombo } from './gameConfig'
import { getGameWords } from './getGameWords'
import type { GamePhase, GameTile, GameWord, LevelConfig, LevelResult, ScoreFloater, SpawnItem, TileLink } from './gameTypes'

const MATCH_MS = 460
const GRAVITY_MS = 300
const SPAWN_MS = 280
const WRONG_MS = 420
const HINT_MS = 1600
const BURN_MS = 280
const MAX_COLOR_CASCADES = 8

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve(null))
  })
}

export interface MatchGameOptions {
  /** Сюда позже можно отдать результат в progress store или API. */
  onLevelResult?: (result: LevelResult) => void
}

export function useMatchGame(options: MatchGameOptions = {}) {
  const phase = ref<GamePhase>('loading')
  const level = ref(1)
  const words = ref<GameWord[]>([])
  const board = ref<GameTile[]>([])
  const boardSize = ref(boardSizeForViewport(typeof window === 'undefined' ? 1280 : window.innerWidth))
  const config = ref<LevelConfig>(levelConfig(1, boardSize.value))
  const score = ref(0)
  const combo = ref(0)
  const bestCombo = ref(0)
  const wordsFound = ref(0)
  const timeLeft = ref(0)
  const hintsLeft = ref(config.value.hints)
  const selectedId = ref<string | null>(null)
  const hintIds = ref<string[]>([])
  const wrongMessage = ref('')
  const floaters = ref<ScoreFloater[]>([])
  const link = ref<TileLink | null>(null)
  const enteringIds = ref<string[]>([])

  const newWords = computed(() => newWordsForLevel(level.value))

  let spawnQueue: SpawnItem[] = []
  let seq = 0
  let floaterSeq = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let hintTimer: ReturnType<typeof setTimeout> | null = null
  let runId = 0
  let ended = false
  let alive = true

  function nextId() {
    seq += 1
    return `t${seq}`
  }

  function stopTimer() {
    if (timer) clearInterval(timer)
    timer = null
  }

  function startTimer() {
    stopTimer()
    timer = setInterval(() => {
      if (phase.value !== 'playing') return
      if (timeLeft.value <= 1) {
        timeLeft.value = 0
        stopTimer()
        finish('timeout')
        return
      }
      timeLeft.value -= 1
    }, 1000)
  }

  function clearHint() {
    if (hintTimer) clearTimeout(hintTimer)
    hintTimer = null
    hintIds.value = []
    if (board.value.some((tile) => tile.state === 'hint')) {
      board.value = board.value.map((tile) => (tile.state === 'hint' ? { ...tile, state: 'normal' } : tile))
    }
  }

  function finish(reason: 'complete' | 'timeout') {
    if (ended) return
    ended = true
    stopTimer()
    clearHint()
    selectedId.value = null
    phase.value = reason
    const result: LevelResult = {
      level: level.value,
      score: score.value,
      wordsFound: wordsFound.value,
      targetWords: config.value.pairsToFind,
      bestCombo: bestCombo.value,
      newWords: newWords.value,
      reason,
    }
    options.onLevelResult?.(result)
  }

  function pushFloater(a: GameTile, b: GameTile, points: number) {
    const size = boardSize.value || 1
    const x = ((a.col + b.col) / 2 + 0.5) * (100 / size)
    const y = ((a.row + b.row) / 2 + 0.5) * (100 / size)
    floaterSeq += 1
    const id = floaterSeq
    floaters.value = [...floaters.value, { id, text: `+${points}`, x, y }]
    window.setTimeout(() => {
      if (!alive) return
      floaters.value = floaters.value.filter((item) => item.id !== id)
    }, 700)
  }

  function mark(ids: string[], state: GameTile['state']) {
    const set = new Set(ids)
    board.value = board.value.map((tile) => (set.has(tile.id) ? { ...tile, state } : tile))
  }

  async function begin(nextLevelNumber: number) {
    const token = ++runId
    ended = false
    stopTimer()
    clearHint()
    phase.value = 'loading'
    selectedId.value = null
    wrongMessage.value = ''
    link.value = null
    floaters.value = []
    enteringIds.value = []
    score.value = 0
    combo.value = 0
    bestCombo.value = 0
    wordsFound.value = 0
    const size = boardSizeForViewport(window.innerWidth)
    boardSize.value = size
    const cfg = levelConfig(nextLevelNumber, size)
    config.value = cfg
    level.value = cfg.id
    const loaded = await getGameWords(cfg.wordCount)
    if (!alive || token !== runId) return
    words.value = loaded
    board.value = createBoard(loaded, size, nextId)
    spawnQueue = buildSpawnQueue(loaded, cfg.pairsToFind)
    timeLeft.value = cfg.timeSec
    hintsLeft.value = cfg.hints
    phase.value = 'playing'
    startTimer()
  }

  async function dropAndRefill(token: number): Promise<boolean> {
    const grav = applyGravity(board.value, boardSize.value)
    board.value = grav.tiles
    await wait(GRAVITY_MS)
    if (!alive || token !== runId) return false
    const planned = planFills(spawnQueue, words.value, grav.holes, board.value)
    spawnQueue = planned.queue
    const spawned = tilesFromFills(planned.fills, words.value, nextId)
    enteringIds.value = spawned.map((tile) => tile.id)
    board.value = [...board.value.map((tile) => ({ ...tile, state: 'normal' as const })), ...spawned]
    await nextTick()
    await nextFrame()
    if (!alive || token !== runId) return false
    enteringIds.value = []
    await wait(SPAWN_MS)
    if (!alive || token !== runId) return false
    board.value = board.value.map((tile) => (tile.state === 'normal' ? tile : { ...tile, state: 'normal' }))
    return true
  }

  async function resolveColorCascades(token: number): Promise<boolean> {
    for (let step = 0; step < MAX_COLOR_CASCADES; step++) {
      const ids = findColorRuns(board.value, boardSize.value)
      if (!ids.length) return true
      mark(ids, 'matched')
      await wait(BURN_MS)
      if (!alive || token !== runId) return false
      const remove = new Set(ids)
      board.value = board.value.filter((tile) => !remove.has(tile.id))
      const filled = await dropAndRefill(token)
      if (!filled) return false
    }
    return true
  }

  async function resolveMatch(a: GameTile, b: GameTile) {
    const token = runId
    phase.value = 'resolving'
    selectedId.value = null
    clearHint()
    combo.value += 1
    if (combo.value > bestCombo.value) bestCombo.value = combo.value
    const gained = pointsForCombo(combo.value)
    score.value += gained
    wordsFound.value += 1
    mark([a.id, b.id], 'matched')
    link.value = { a: a.id, b: b.id }
    pushFloater(a, b, gained)
    await wait(MATCH_MS)
    if (!alive || token !== runId) return
    link.value = null
    const removed = new Set([a.id, b.id])
    board.value = board.value.filter((tile) => !removed.has(tile.id))
    const filled = await dropAndRefill(token)
    if (!filled) return
    const cleared = await resolveColorCascades(token)
    if (!cleared) return
    if (wordsFound.value >= config.value.pairsToFind) {
      finish('complete')
      return
    }
    if (timeLeft.value <= 0) {
      finish('timeout')
      return
    }
    phase.value = 'playing'
  }

  async function resolveWrong(a: GameTile, b: GameTile) {
    const token = runId
    phase.value = 'resolving'
    selectedId.value = null
    combo.value = Math.max(0, combo.value - 1)
    wrongMessage.value = 'Это не пара'
    mark([a.id, b.id], 'wrong')
    await wait(WRONG_MS)
    if (!alive || token !== runId) return
    mark([a.id, b.id], 'normal')
    wrongMessage.value = ''
    if (timeLeft.value <= 0) {
      finish('timeout')
      return
    }
    phase.value = 'playing'
  }

  function selectTile(id: string) {
    if (phase.value !== 'playing') return
    const tile = board.value.find((item) => item.id === id)
    if (!tile || !isWordTile(tile)) return
    if (!selectedId.value) {
      selectedId.value = id
      mark([id], 'selected')
      return
    }
    if (selectedId.value === id) {
      selectedId.value = null
      mark([id], 'normal')
      return
    }
    const first = board.value.find((item) => item.id === selectedId.value)
    if (!first || !isWordTile(first)) {
      selectedId.value = id
      mark([id], 'selected')
      return
    }
    selectedId.value = null
    if (isMatch(first, tile)) void resolveMatch(first, tile)
    else void resolveWrong(first, tile)
  }

  function useHint() {
    if (phase.value !== 'playing' || hintsLeft.value <= 0) return
    const pair = findMatchPair(board.value)
    if (!pair) return
    hintsLeft.value -= 1
    if (selectedId.value) {
      mark([selectedId.value], 'normal')
      selectedId.value = null
    }
    hintIds.value = [pair[0].id, pair[1].id]
    mark(hintIds.value, 'hint')
    if (hintTimer) clearTimeout(hintTimer)
    hintTimer = setTimeout(() => {
      hintIds.value = []
      if (!alive) return
      board.value = board.value.map((tile) => (tile.state === 'hint' ? { ...tile, state: 'normal' } : tile))
    }, HINT_MS)
  }

  function onResize() {
    if (phase.value !== 'playing' || wordsFound.value !== 0 || score.value !== 0) return
    const size = boardSizeForViewport(window.innerWidth)
    if (size === boardSize.value) return
    void begin(level.value)
  }

  onMounted(() => {
    window.addEventListener('resize', onResize)
    void begin(1)
  })

  onUnmounted(() => {
    alive = false
    runId += 1
    stopTimer()
    if (hintTimer) clearTimeout(hintTimer)
    window.removeEventListener('resize', onResize)
  })

  function nextLevel() {
    void begin(level.value + 1)
  }

  function retry() {
    void begin(level.value)
  }

  return {
    phase,
    level,
    config,
    words,
    board,
    boardSize,
    score,
    combo,
    bestCombo,
    wordsFound,
    timeLeft,
    hintsLeft,
    hintIds,
    wrongMessage,
    floaters,
    link,
    enteringIds,
    newWords,
    selectTile,
    useHint,
    nextLevel,
    retry,
  }
}
