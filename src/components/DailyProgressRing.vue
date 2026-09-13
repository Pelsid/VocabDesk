<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ done: number; goal: number; size?: number; stroke?: number }>(),
  { size: 108, stroke: 10 },
)

const r = computed(() => props.size / 2 - props.stroke)
const c = computed(() => 2 * Math.PI * r.value)
const offset = computed(() => {
  const pct = Math.min(1, props.done / Math.max(1, props.goal))
  return c.value * (1 - pct)
})
const mid = computed(() => props.size / 2)
</script>

<template>
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="learn-daily-ring" aria-hidden>
    <circle class="learn-ring-bg" :cx="mid" :cy="mid" :r="r" :stroke-width="stroke" />
    <circle
      class="learn-ring-fg"
      :cx="mid"
      :cy="mid"
      :r="r"
      :stroke-width="stroke"
      :stroke-dasharray="c"
      :stroke-dashoffset="offset"
      :transform="`rotate(-90 ${mid} ${mid})`"
    />
  </svg>
</template>
