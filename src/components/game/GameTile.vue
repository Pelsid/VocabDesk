<script setup lang="ts">
import { computed } from 'vue'
import type { BlockColor, TileKind, TileState } from '../../game/gameTypes'

const props = defineProps<{
  tileId: string
  text: string
  type: TileKind
  color?: BlockColor
  row: number
  col: number
  state: TileState
  entering: boolean
  locked: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

function kindLabel(type: TileKind) {
  if (type === 'english') return 'английское слово'
  if (type === 'translation') return 'перевод'
  if (type === 'block') return 'цветной квадрат'
  if (type === 'bomb') return 'бомба'
  if (type === 'lightning') return 'молния'
  if (type === 'freeze') return 'заморозка'
  return 'подсказка'
}

const toneClass = computed(() => {
  if (props.type === 'block') return ['game-tile--block', `game-tile--${props.color ?? 'teal'}`]
  return [props.type === 'translation' ? 'game-tile--ru' : 'game-tile--en']
})

const label = computed(() => (props.type === 'block' ? 'цветной квадрат' : `${props.text}, ${kindLabel(props.type)}`))

const tileStyle = computed(() => {
  const shift = `((100% - (var(--n) + 1) * var(--gap)) / var(--n) + var(--gap))`
  return {
    top: `calc(var(--gap) + ${props.row} * ${shift})`,
    left: `calc(var(--gap) + ${props.col} * ${shift})`,
  }
})

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  if (!props.locked) emit('select', props.tileId)
}
</script>

<template>
  <button
    type="button"
    class="game-tile"
    :class="[
      ...toneClass,
      {
        'is-selected': state === 'selected',
        'is-matched': state === 'matched',
        'is-wrong': state === 'wrong',
        'is-hint': state === 'hint',
        'is-enter': entering,
      },
    ]"
    :style="tileStyle"
    :data-tile-id="tileId"
    :data-row="row"
    :data-col="col"
    :disabled="locked"
    :aria-pressed="state === 'selected'"
    :aria-label="label"
    :title="type === 'block' ? undefined : text"
    @keydown="onKeydown"
  >
    <span v-if="type !== 'block'" class="game-tile-label">{{ text }}</span>
    <span v-if="state === 'matched' && type !== 'block'" class="game-check" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <path d="m5 12 5 5L20 7" />
      </svg>
    </span>
  </button>
</template>
