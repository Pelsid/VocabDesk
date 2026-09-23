<script setup lang="ts">
import { computed } from 'vue'
import type { LevelEndReason } from '../../game/gameTypes'
import { useMatchGame } from '../../game/useMatchGame'
import GameBoard from './GameBoard.vue'
import GameHeader from './GameHeader.vue'
import GameHintBar from './GameHintBar.vue'
import GameResultModal from './GameResultModal.vue'
import GameStats from './GameStats.vue'
import LevelProgress from './LevelProgress.vue'
import LevelWords from './LevelWords.vue'
import './game.css'

const emit = defineEmits<{
  exit: []
}>()

const {
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
  wrongMessage,
  floaters,
  link,
  enteringIds,
  newWords,
  selectTile,
  useHint,
  nextLevel,
  retry,
} = useMatchGame()

const locked = computed(() => phase.value !== 'playing')
const resultReason = computed<LevelEndReason | null>(() =>
  phase.value === 'complete' || phase.value === 'timeout' ? phase.value : null,
)
</script>

<template>
  <div class="game-page">
    <div class="game-main">
      <GameHeader :level="level" :score="score" :score-goal="config.scoreGoal" />
      <GameStats
        :score="score"
        :combo="combo"
        :words-found="wordsFound"
        :target-words="config.pairsToFind"
        :time-left="timeLeft"
      />
      <div class="game-toast-slot">
        <p v-if="wrongMessage" class="game-toast" role="status">{{ wrongMessage }}</p>
      </div>
      <div v-if="phase === 'loading'" class="game-loading muted">Собираем слова…</div>
      <div v-else class="game-stage">
        <GameBoard
          :tiles="board"
          :board-size="boardSize"
          :entering-ids="enteringIds"
          :link="link"
          :floaters="floaters"
          :locked="locked"
          @select="selectTile"
        />
        <GameHintBar :hints-left="hintsLeft" :disabled="locked" @hint="useHint" />
      </div>
    </div>
    <aside class="game-side">
      <LevelWords :words="words" />
      <LevelProgress :found="wordsFound" :target="config.pairsToFind" />
    </aside>
    <GameResultModal
      :open="resultReason != null"
      :reason="resultReason"
      :score="score"
      :words-found="wordsFound"
      :target-words="config.pairsToFind"
      :best-combo="bestCombo"
      :new-words="newWords"
      @next="nextLevel"
      @retry="retry"
      @exit="emit('exit')"
    />
  </div>
</template>
