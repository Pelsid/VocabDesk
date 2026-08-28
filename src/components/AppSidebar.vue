<script setup lang="ts">
export type AppTab = 'dictionary' | 'learn' | 'repeat' | 'learned' | 'newWords' | 'grammar' | 'chat'

const props = defineProps<{
  tab: AppTab
  open: boolean
  streak: number
}>()

const emit = defineEmits<{
  navigate: [tab: AppTab]
  close: []
}>()

const items: { id: AppTab; label: string }[] = [
  { id: 'learn', label: 'Учить' },
  { id: 'dictionary', label: 'Словари' },
  { id: 'repeat', label: 'Повторение' },
  { id: 'learned', label: 'Изученное' },
  { id: 'newWords', label: 'Новое' },
  { id: 'grammar', label: 'Грамматика' },
  { id: 'chat', label: 'Чат' },
]

function go(id: AppTab) {
  emit('navigate', id)
  emit('close')
}
</script>

<template>
  <div v-if="open" class="sidebar-backdrop" @click="emit('close')" />
  <aside class="app-sidebar" :class="{ open: props.open }" aria-label="Разделы">
    <div class="sidebar-brand">
      <span class="sidebar-logo" aria-hidden>en</span>
      <span class="sidebar-brand-name">VocabDesk</span>
    </div>

    <nav class="sidebar-nav">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="sidebar-link"
        :class="{ active: tab === item.id }"
        @click="go(item.id)"
      >
        <span class="sidebar-ico" aria-hidden>
          <svg v-if="item.id === 'learn'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <svg v-else-if="item.id === 'dictionary'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M8 7h8M8 11h6" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <svg v-else-if="item.id === 'repeat'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <svg v-else-if="item.id === 'learned'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 22c4-3.2 8-7.2 8-12a8 8 0 1 0-16 0c0 4.8 4 8.8 8 12z" />
            <path d="m9 11 2 2 4-4" />
          </svg>
          <svg v-else-if="item.id === 'newWords'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 3l2.2 6.6L21 12l-6.8 2.4L12 21l-2.2-6.6L3 12l6.8-2.4L12 3z" />
          </svg>
          <svg v-else-if="item.id === 'grammar'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <path d="M9 7h7M9 11h5M9 15h6" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
        </span>
        {{ item.label }}
      </button>
    </nav>

    <div class="sidebar-foot">
      <slot name="usage" />
      <slot name="data" />
      <div class="sidebar-streak" title="Подряд дней, когда вы оценивали хотя бы одну карточку">
        <span class="sidebar-streak-flame" aria-hidden>🔥</span>
        <div>
          <div class="sidebar-streak-label">Серия дней</div>
          <div class="sidebar-streak-n">{{ streak }}</div>
        </div>
      </div>
    </div>
  </aside>
</template>
