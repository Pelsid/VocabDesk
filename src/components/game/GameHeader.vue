<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  level: number
  score: number
  scoreGoal: number
}>()

const pct = computed(() => {
  if (props.scoreGoal <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((props.score / props.scoreGoal) * 100)))
})
</script>

<template>
  <header class="game-header">
    <div>
      <h1 class="game-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
        </svg>
        Три в ряд
      </h1>
      <p class="game-sub muted">Соединяй английские слова и их переводы</p>
    </div>
    <div class="game-level">
      <div class="game-level-row">
        <span class="game-level-name">Уровень {{ level }}</span>
        <span>{{ score }} / {{ scoreGoal }}</span>
      </div>
      <div
        class="learn-progress-track"
        role="progressbar"
        :aria-valuenow="pct"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`Очки уровня: ${score} из ${scoreGoal}`"
      >
        <div class="learn-progress-value" :style="{ width: `${pct}%` }" />
      </div>
    </div>
  </header>
</template>
