<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ done: number; goal: number }>()

const r = 44
const c = 2 * Math.PI * r
const offset = computed(() => {
  const pct = Math.min(1, props.done / Math.max(1, props.goal))
  return c * (1 - pct)
})
</script>

<template>
  <svg width="108" height="108" viewBox="0 0 108 108" class="learn-daily-ring" aria-hidden>
    <circle class="learn-ring-bg" cx="54" cy="54" :r="r" />
    <circle
      class="learn-ring-fg"
      cx="54"
      cy="54"
      :r="r"
      :stroke-dasharray="c"
      :stroke-dashoffset="offset"
      transform="rotate(-90 54 54)"
    />
  </svg>
</template>
