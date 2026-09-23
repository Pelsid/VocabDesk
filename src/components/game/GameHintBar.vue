<script setup lang="ts">
defineProps<{
  hintsLeft: number
  disabled: boolean
}>()

const emit = defineEmits<{
  hint: []
}>()
</script>

<template>
  <div class="game-hintbar">
    <p>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M9 18h6" />
        <path d="M10 21h4" />
        <path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6V17h5.4v-1.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z" />
      </svg>
      Соедини английское слово с его переводом
    </p>
    <button
      type="button"
      class="btn-quiet game-hint-btn"
      :disabled="disabled || hintsLeft <= 0"
      :aria-label="`Показать пару, осталось ${hintsLeft}`"
      @click="emit('hint')"
    >
      Показать пару ({{ hintsLeft }})
    </button>
  </div>
</template>
