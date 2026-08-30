<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import './App.css'
import './redesign.css'
import DictionaryView from './components/DictionaryView.vue'
import LearnView from './components/LearnView.vue'
import ProgressBrowseView from './components/ProgressBrowseView.vue'
import DataMenu from './components/DataMenu.vue'
import GroqUsageBadge from './components/GroqUsageBadge.vue'
import AppSidebar, { type AppTab } from './components/AppSidebar.vue'
import ChatView from './components/ChatView.vue'
import GrammarView from './components/GrammarView.vue'
import { useCatalogStore } from './stores/catalog'
import { useProgressStore } from './stores/progress'

type Tab = AppTab

const PAGE_TITLE: Record<Tab, string> = {
  learn: 'Учить',
  dictionary: 'Словари',
  repeat: 'Повторение',
  learned: 'Изученное',
  newWords: 'Новое',
  grammar: 'Грамматика',
  chat: 'Чат с AI',
}

const catalog = useCatalogStore()
const progress = useProgressStore()

const hydrating = ref(true)
const err = ref<string | null>(null)
const tab = ref<Tab>('learn')
const selectedCategoryId = ref<string | null>(null)
const sidebarOpen = ref(false)
const startWordId = ref<number | null>(null)
const grammarLessonId = ref<string | null>(null)

onMounted(() => {
  void (async () => {
    try {
      const boot = await catalog.loadBootstrap()
      progress.hydrate(boot.progress, boot.daily, boot.hasGroqKey)
    } catch (e) {
      err.value = e instanceof Error ? e.message : String(e)
    } finally {
      hydrating.value = false
    }
  })()
})

const streak = computed(() => {
  void progress.revision
  return progress.daily.streak
})

function go(next: Tab) {
  tab.value = next
  sidebarOpen.value = false
}

function onRepeatWord(id: number) {
  startWordId.value = id
  tab.value = 'learn'
  sidebarOpen.value = false
}

function onConsumedStartWord() {
  startWordId.value = null
}

function openGrammarLesson(id: string) {
  grammarLessonId.value = id
  tab.value = 'grammar'
  sidebarOpen.value = false
}

function onConsumedGrammarLesson() {
  grammarLessonId.value = null
}
</script>

<template>
  <div v-if="hydrating" class="upload-screen">
    <div class="upload-card">
      <div class="muted">Подключаемся к CoreWords…</div>
    </div>
  </div>

  <div v-else-if="err" class="upload-screen">
    <div class="upload-card">
      <p class="alert">{{ err }}</p>
      <p class="muted small">Проверьте, что MariaDB запущена и каталог импортирован.</p>
    </div>
  </div>

  <div v-else class="app">
    <AppSidebar :tab="tab" :open="sidebarOpen" :streak="streak" @navigate="go" @close="sidebarOpen = false">
      <template #usage>
        <GroqUsageBadge />
      </template>
      <template #data>
        <DataMenu />
      </template>
    </AppSidebar>

    <div class="app-body">
      <header class="mobile-bar">
        <button type="button" class="hamburger" aria-label="Открыть меню" @click="sidebarOpen = true">
          <span /><span /><span />
        </button>
        <span class="mobile-bar-title">{{ PAGE_TITLE[tab] }}</span>
      </header>

      <main class="main">
        <DictionaryView
          v-if="tab === 'dictionary'"
          :selected-id="selectedCategoryId"
          @select-category="selectedCategoryId = $event"
          @open-grammar="openGrammarLesson"
        />
        <LearnView
          v-else-if="tab === 'learn'"
          :active-category-id="selectedCategoryId"
          :start-word-id="startWordId"
          @navigate="go"
          @consumed-start-word="onConsumedStartWord"
          @open-grammar="openGrammarLesson"
        />
        <ProgressBrowseView
          v-else-if="tab === 'repeat'"
          mode="due_now"
          :active-category-id="selectedCategoryId"
          @repeat-word="onRepeatWord"
          @open-grammar="openGrammarLesson"
        />
        <ProgressBrowseView
          v-else-if="tab === 'learned'"
          mode="learned_review"
          :active-category-id="selectedCategoryId"
          @open-grammar="openGrammarLesson"
        />
        <ProgressBrowseView
          v-else-if="tab === 'newWords'"
          mode="new_words"
          :active-category-id="selectedCategoryId"
          @open-grammar="openGrammarLesson"
        />
        <GrammarView
          v-else-if="tab === 'grammar'"
          :start-lesson-id="grammarLessonId"
          @consumed-start-lesson="onConsumedGrammarLesson"
        />
        <ChatView v-else />
      </main>
    </div>
  </div>
</template>
