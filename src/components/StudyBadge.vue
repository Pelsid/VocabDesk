<script setup lang="ts">
import type { CardSchedule } from '../lib/progressTypes'
import { formatDueLabel } from '../lib/srs'

const props = defineProps<{
  schedule: CardSchedule | null
  now?: number
  mastered?: boolean
}>()

function effectiveNow() {
  return props.now ?? Date.now()
}

function label(s: CardSchedule): string {
  if (s.bucket === 'learning') return 'изучение'
  if (s.bucket === 'relearn') return 'восстановление'
  if (s.bucket === 'review' && s.intervalDays >= 14 && s.reps >= 4) return 'закреплено'
  return 'повторение'
}

function badgeCls(s: CardSchedule): string {
  if (s.bucket === 'learning' || s.bucket === 'relearn') return 'stage stage-learn'
  if (s.bucket === 'review' && s.intervalDays >= 14 && s.reps >= 4) return 'stage stage-done'
  return 'stage stage-review'
}
</script>

<template>
  <span v-if="mastered" class="stage stage-mastered" title="Исключено из SRS по вашему выбору"> навсегда </span>
  <template v-else>
    <span v-if="!schedule || schedule.bucket === 'new'" class="stage stage-new" title="Локальный прогресс (этот сайт)">
      новое
    </span>
    <span
      v-else
      :class="badgeCls(schedule)"
      :title="`Локально · ${formatDueLabel(schedule, effectiveNow())} · интервал ~${Math.round(schedule.intervalDays)} дн · ease ${schedule.ease}`"
    >
      {{ label(schedule) }}
    </span>
  </template>
</template>
