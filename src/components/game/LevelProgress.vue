<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  found: number
  target: number
}>()

const pct = computed(() => {
  if (props.target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((props.found / props.target) * 100)))
})
</script>

<template>
  <section class="panel game-card" aria-label="Прогресс уровня">
    <h2>Прогресс уровня</h2>
    <div class="game-progress-row">
      <span>Найдено пар</span>
      <span>{{ found }} / {{ target }}</span>
    </div>
    <div
      class="learn-progress-track"
      role="progressbar"
      :aria-valuenow="found"
      aria-valuemin="0"
      :aria-valuemax="target"
      :aria-label="`Найдено пар: ${found} из ${target}`"
    >
      <div class="learn-progress-value" :style="{ width: `${pct}%` }" />
    </div>
  </section>
</template>
