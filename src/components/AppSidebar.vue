<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { applyTheme, type ThemePref } from '../lib/theme'
import { useProgressStore } from '../stores/progress'

export type AppTab = 'home' | 'dictionary' | 'learn' | 'repeat' | 'learned' | 'newWords' | 'grammar' | 'chat' | 'profile'

const props = defineProps<{
  tab: AppTab
  open: boolean
  counts: { due: number; fresh: number; learned: number; dictionaries: number }
}>()

const emit = defineEmits<{
  navigate: [tab: AppTab]
  close: []
}>()

const progress = useProgressStore()
const { snapshot } = storeToRefs(progress)
const theme = computed<ThemePref>(() => (snapshot.value.prefs.theme === 'light' ? 'light' : 'dark'))

type NavItem = { id: AppTab; label: string; count?: number }
type NavGroup = { label?: string; items: NavItem[] }

const groups = computed<NavGroup[]>(() => [
  { items: [{ id: 'home', label: 'Главная' }] },
  {
    label: 'Обучение',
    items: [
      { id: 'learn', label: 'Учить' },
      { id: 'repeat', label: 'Повторение', count: props.counts.due },
      { id: 'newWords', label: 'Новое', count: props.counts.fresh },
      { id: 'learned', label: 'Изученное', count: props.counts.learned },
    ],
  },
  {
    label: 'Инструменты',
    items: [
      { id: 'dictionary', label: 'Словари', count: props.counts.dictionaries },
      { id: 'grammar', label: 'Грамматика' },
      { id: 'chat', label: 'Чат' },
    ],
  },
  {
    label: 'Аккаунт',
    items: [{ id: 'profile', label: 'Профиль' }],
  },
])

function go(id: AppTab) {
  emit('navigate', id)
  emit('close')
}

function toggleTheme() {
  const next: ThemePref = theme.value === 'light' ? 'dark' : 'light'
  applyTheme(next)
  void progress.updatePrefs({ theme: next })
}

function formatCount(n: number) {
  return n.toLocaleString('ru-RU')
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
      <div v-for="(group, gi) in groups" :key="gi" class="sidebar-group">
        <div v-if="group.label" class="sidebar-group-label">{{ group.label }}</div>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="sidebar-link"
          :class="{ active: tab === item.id }"
          @click="go(item.id)"
        >
          <span class="sidebar-ico" aria-hidden>
            <svg v-if="item.id === 'home'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
            </svg>
            <svg v-else-if="item.id === 'learn'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
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
            <svg v-else-if="item.id === 'chat'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="8" r="3.2" />
              <path d="M5 19.2c.8-3 3.4-4.7 7-4.7s6.2 1.7 7 4.7" />
            </svg>
          </span>
          <span class="sidebar-link-label">{{ item.label }}</span>
          <span v-if="item.count != null && item.count > 0" class="sidebar-count">{{ formatCount(item.count) }}</span>
        </button>
      </div>
    </nav>

    <div class="sidebar-foot">
      <slot name="usage" />
      <button type="button" class="sidebar-theme" @click="toggleTheme">
        <span aria-hidden>{{ theme === 'light' ? '☀️' : '🌙' }}</span>
        {{ theme === 'light' ? 'Светлая тема' : 'Тёмная тема' }}
      </button>
      <p class="sidebar-quote">Маленькие шаги каждый день приводят к большим результатам</p>
    </div>
  </aside>
</template>
