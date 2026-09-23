<script setup lang="ts">
import type { LevelEndReason } from '../../game/gameTypes'

defineProps<{
  open: boolean
  reason: LevelEndReason | null
  score: number
  wordsFound: number
  targetWords: number
  bestCombo: number
  newWords: number
}>()

const emit = defineEmits<{
  next: []
  retry: []
  exit: []
}>()
</script>

<template>
  <div v-if="open" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="game-result-title">
    <div class="modal game-modal">
      <div class="modal-head">
        <div id="game-result-title" class="modal-title">
          {{ reason === 'complete' ? 'Уровень пройден!' : 'Время вышло' }}
        </div>
      </div>
      <div class="modal-body">
        <dl class="game-result-list">
          <div>
            <dt>Очки</dt>
            <dd>+{{ score }}</dd>
          </div>
          <div>
            <dt>Найдено слов</dt>
            <dd>{{ wordsFound }} / {{ targetWords }}</dd>
          </div>
          <div>
            <dt>Комбо</dt>
            <dd>x{{ bestCombo }}</dd>
          </div>
          <div v-if="reason === 'complete' && newWords > 0">
            <dt>Новые слова</dt>
            <dd>+{{ newWords }}</dd>
          </div>
        </dl>
        <div class="row-btns">
          <button v-if="reason === 'complete'" type="button" class="btn-primary" autofocus @click="emit('next')">
            Следующий уровень
          </button>
          <button v-else type="button" class="btn-primary" autofocus @click="emit('retry')">
            Попробовать ещё раз
          </button>
          <button type="button" class="btn-quiet" @click="emit('exit')">Выйти из игры</button>
        </div>
      </div>
    </div>
  </div>
</template>
