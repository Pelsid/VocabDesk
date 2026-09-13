<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import './App.css'
import './redesign.css'
import DictionaryView from './components/DictionaryView.vue'
import LearnView from './components/LearnView.vue'
import ProgressBrowseView from './components/ProgressBrowseView.vue'
import GroqUsageBadge from './components/GroqUsageBadge.vue'
import AppSidebar, { type AppTab } from './components/AppSidebar.vue'
import AppBottomNav from './components/AppBottomNav.vue'
import AuthGate from './components/AuthGate.vue'
import ChatView from './components/ChatView.vue'
import GrammarView from './components/GrammarView.vue'
import HomeDashboard from './components/HomeDashboard.vue'
import ProfileView from './components/ProfileView.vue'
import { countNavStats } from './lib/navCounts'
import { applyTheme } from './lib/theme'
import { useAuthStore } from './stores/auth'
import { useCatalogStore } from './stores/catalog'
import { useProgressStore } from './stores/progress'

type Tab = AppTab

const PAGE_TITLE: Record<Tab, string> = {
  home: 'Главная',
  learn: 'Учить',
  dictionary: 'Словари',
  repeat: 'Повторение',
  learned: 'Изученное',
  newWords: 'Новое',
  grammar: 'Грамматика',
  chat: 'Чат с AI',
  profile: 'Настройки',
}

const auth = useAuthStore()
const catalog = useCatalogStore()
const progress = useProgressStore()

const hydrating = ref(true)
const err = ref<string | null>(null)
const tab = ref<Tab>('home')
const selectedCategoryId = ref<string | null>(null)
const sidebarOpen = ref(false)
const startWordId = ref<number | null>(null)
const autoStartLearn = ref(false)
const grammarLessonId = ref<string | null>(null)

async function loadApp() {
  hydrating.value = true
  err.value = null
  try {
    const boot = await catalog.loadBootstrap()
    progress.hydrate(boot.progress, boot.daily, boot.hasGroqKey)
    applyTheme(boot.progress.prefs.theme === 'light' ? 'light' : 'dark')
    tab.value = 'home'
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    hydrating.value = false
  }
}

onMounted(() => {
  void (async () => {
    await auth.init()
    if (auth.status === 'authed') {
      await loadApp()
      return
    }
    hydrating.value = false
  })()
})

watch(
  () => auth.status,
  (status, prev) => {
    if (status === 'authed' && prev === 'guest') {
      void loadApp()
    }
    if (status === 'guest' && prev === 'authed') {
      err.value = null
      hydrating.value = false
    }
  },
)

watch(
  () => progress.snapshot.prefs.theme,
  (theme) => applyTheme(theme === 'light' ? 'light' : 'dark'),
)

const navCounts = computed(() => {
  void progress.revision
  const prefs = {
    categoryScopeMode: progress.snapshot.prefs.categoryScopeMode ?? 'reword',
    customCategoryIds: progress.snapshot.prefs.customCategoryIds ?? [],
  }
  const ids = catalog.idsInScope('selected', null, prefs)
  return {
    ...countNavStats(ids, progress.snapshot, Date.now()),
    dictionaries: catalog.dictionaries.length,
  }
})

function go(next: Tab) {
  tab.value = next
  sidebarOpen.value = false
}

function startLearn() {
  autoStartLearn.value = true
  tab.value = 'learn'
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

function onConsumedAutoStart() {
  autoStartLearn.value = false
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
  <div v-if="auth.status === 'unknown' || (auth.status === 'authed' && hydrating)" class="upload-screen">
    <div class="upload-card">
      <div class="muted">Подключаемся к CoreWords…</div>
    </div>
  </div>

  <AuthGate v-else-if="auth.status !== 'authed'" />

  <div v-else-if="err" class="upload-screen">
    <div class="upload-card">
      <p class="alert">{{ err }}</p>
      <p class="muted small">Проверьте, что MariaDB запущена и каталог импортирован.</p>
    </div>
  </div>

  <div v-else class="app" :class="{ 'app--home': tab === 'home' }">
    <AppSidebar :tab="tab" :open="sidebarOpen" :counts="navCounts" @navigate="go" @close="sidebarOpen = false">
      <template #usage>
        <GroqUsageBadge />
      </template>
    </AppSidebar>

    <div class="app-body">
      <header v-if="tab !== 'home'" class="mobile-bar">
        <span class="mobile-bar-title">{{ PAGE_TITLE[tab] }}</span>
      </header>

      <main class="main">
        <HomeDashboard v-if="tab === 'home'" @navigate="go" @start-learn="startLearn" />
        <DictionaryView
          v-else-if="tab === 'dictionary'"
          :selected-id="selectedCategoryId"
          @select-category="selectedCategoryId = $event"
          @open-grammar="openGrammarLesson"
        />
        <LearnView
          v-else-if="tab === 'learn'"
          :active-category-id="selectedCategoryId"
          :start-word-id="startWordId"
          :auto-start="autoStartLearn"
          @navigate="go"
          @consumed-start-word="onConsumedStartWord"
          @consumed-auto-start="onConsumedAutoStart"
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
        <ProfileView v-else-if="tab === 'profile'" />
        <ChatView v-else />
      </main>
    </div>

    <AppBottomNav :tab="tab" @navigate="go" />
  </div>
</template>
