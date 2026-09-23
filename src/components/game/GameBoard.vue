<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { GameTile, ScoreFloater, TileLink } from '../../game/gameTypes'
import GameTileButton from './GameTile.vue'

const props = defineProps<{
  tiles: GameTile[]
  boardSize: number
  enteringIds: string[]
  link: TileLink | null
  floaters: ScoreFloater[]
  locked: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const root = ref<HTMLElement | null>(null)

const entering = computed(() => new Set(props.enteringIds))

const linkLine = computed(() => {
  if (!props.link) return null
  const a = props.tiles.find((tile) => tile.id === props.link?.a)
  const b = props.tiles.find((tile) => tile.id === props.link?.b)
  if (!a || !b) return null
  const n = props.boardSize || 1
  const point = (tile: GameTile) => ({
    x: ((tile.col + 0.5) / n) * 100,
    y: ((tile.row + 0.5) / n) * 100,
  })
  return { a: point(a), b: point(b) }
})

let down: { id: string; x: number; y: number } | null = null

function tileIdFrom(target: EventTarget | Element | null) {
  const el = target instanceof Element ? target : null
  return el?.closest('[data-tile-id]')?.getAttribute('data-tile-id') ?? null
}

function clearPointer() {
  down = null
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', clearPointer)
}

function onPointerUp(event: PointerEvent) {
  const from = down
  clearPointer()
  if (!from || props.locked) return
  const under = document.elementFromPoint(event.clientX, event.clientY)
  const upId = tileIdFrom(under)
  if (upId && upId !== from.id) {
    emit('select', from.id)
    emit('select', upId)
    return
  }
  const moved = Math.hypot(event.clientX - from.x, event.clientY - from.y)
  if (moved < 14) emit('select', from.id)
}

function onPointerDown(event: PointerEvent) {
  if (props.locked || event.button !== 0) return
  const id = tileIdFrom(event.target)
  if (!id) return
  if (down) clearPointer()
  down = { id, x: event.clientX, y: event.clientY }
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', clearPointer)
}

function onKeydown(event: KeyboardEvent) {
  const key = event.key
  if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') return
  const current = event.target instanceof Element ? event.target.closest('[data-tile-id]') : null
  if (!current) return
  event.preventDefault()
  let row = Number(current.getAttribute('data-row'))
  let col = Number(current.getAttribute('data-col'))
  if (key === 'ArrowUp') row -= 1
  if (key === 'ArrowDown') row += 1
  if (key === 'ArrowLeft') col -= 1
  if (key === 'ArrowRight') col += 1
  row = Math.min(props.boardSize - 1, Math.max(0, row))
  col = Math.min(props.boardSize - 1, Math.max(0, col))
  root.value?.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)?.focus()
}

onUnmounted(() => {
  clearPointer()
})
</script>

<template>
  <div
    ref="root"
    class="game-board"
    :class="{ 'is-locked': locked }"
    :style="{ '--n': boardSize }"
    role="group"
    aria-label="Игровое поле. Выберите английское слово и его перевод."
    @pointerdown="onPointerDown"
    @keydown="onKeydown"
  >
    <GameTileButton
      v-for="tile in tiles"
      :key="tile.id"
      :tile-id="tile.id"
      :text="tile.text"
      :type="tile.type"
      :color="tile.color"
      :row="tile.row"
      :col="tile.col"
      :state="tile.state"
      :entering="entering.has(tile.id)"
      :locked="locked"
      @select="emit('select', $event)"
    />
    <svg v-if="linkLine" class="game-link" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <line :x1="linkLine.a.x" :y1="linkLine.a.y" :x2="linkLine.b.x" :y2="linkLine.b.y" />
    </svg>
    <span
      v-for="floater in floaters"
      :key="floater.id"
      class="game-floater"
      :style="{ '--x': `${floater.x}%`, '--y': `${floater.y}%` }"
    >
      {{ floater.text }}
    </span>
  </div>
</template>
