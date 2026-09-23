<script setup lang="ts">
import type { GameWord } from '../../game/gameTypes'

defineProps<{
  words: GameWord[]
}>()

const DOTS = ['var(--accent)', 'var(--teal)', 'var(--status-new)', 'var(--warn)']

function dot(index: number) {
  return DOTS[index % DOTS.length]
}
</script>

<template>
  <section class="panel game-card" aria-label="Слова уровня">
    <h2>Слова уровня</h2>
    <ul class="game-word-list">
      <li v-for="(word, index) in words" :key="word.id">
        <span class="game-dot" :style="{ background: dot(index) }" aria-hidden="true" />
        <span class="game-word-en">{{ word.english }}</span>
        <span class="game-word-arrow" aria-hidden="true">→</span>
        <span class="game-word-ru">{{ word.translation }}</span>
      </li>
    </ul>
  </section>
</template>
