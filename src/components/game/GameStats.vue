<script setup lang="ts">
import { comboLabel, formatGameTime } from '../../game/gameConfig'

defineProps<{
  score: number
  combo: number
  wordsFound: number
  targetWords: number
  timeLeft: number
}>()
</script>

<template>
  <div class="game-stats" aria-label="Статистика игры">
    <div class="game-stat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="m12 3 2.2 6.6L21 12l-6.8 2.4L12 21l-2.2-6.6L3 12l6.8-2.4L12 3z" />
      </svg>
      <span>
        <span class="game-stat-label">Очки</span>
        <span class="game-stat-value">{{ score }}</span>
      </span>
    </div>
    <div class="game-stat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M12 3s5 4.2 5 8.2A5 5 0 1 1 7 11.2C7 7.2 12 3 12 3z" />
      </svg>
      <span>
        <span class="game-stat-label">Комбо</span>
        <span class="game-stat-value">{{ comboLabel(combo) }}</span>
      </span>
    </div>
    <div class="game-stat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2z" />
      </svg>
      <span>
        <span class="game-stat-label">Слов найдено</span>
        <span class="game-stat-value">{{ wordsFound }} / {{ targetWords }}</span>
      </span>
    </div>
    <div class="game-stat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
      <span>
        <span class="game-stat-label">Время</span>
        <span class="game-stat-value">{{ formatGameTime(timeLeft) }}</span>
      </span>
    </div>
  </div>
</template>
