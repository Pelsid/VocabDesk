<script setup lang="ts">
import type { AppTab } from './AppSidebar.vue'

const props = defineProps<{ tab: AppTab }>()
const emit = defineEmits<{ navigate: [tab: AppTab] }>()

const items: { id: AppTab; label: string }[] = [
  { id: 'home', label: 'Главная' },
  { id: 'game', label: 'Игра' },
  { id: 'dictionary', label: 'Словари' },
  { id: 'grammar', label: 'Грамматика' },
  { id: 'chat', label: 'Чат' },
  { id: 'profile', label: 'Профиль' },
]

function active(id: AppTab) {
  if (id === 'home') return ['home', 'learn', 'repeat', 'learned', 'newWords'].includes(props.tab)
  return props.tab === id
}
</script>

<template>
  <nav class="app-bottom-nav" aria-label="Основные разделы">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="bottom-link"
      :class="{ active: active(item.id) }"
      @click="emit('navigate', item.id)"
    >
      <span class="bottom-ico" aria-hidden>
        <svg v-if="item.id === 'home'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
        </svg>
        <svg v-else-if="item.id === 'game'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
        </svg>
        <svg v-else-if="item.id === 'dictionary'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <svg v-else-if="item.id === 'grammar'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M9 7h7M9 11h5M9 15h6" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <svg v-else-if="item.id === 'chat'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 19.2c.8-3 3.4-4.7 7-4.7s6.2 1.7 7 4.7" />
        </svg>
      </span>
      {{ item.label }}
    </button>
  </nav>
</template>
