<script setup lang="ts">
import type { Database } from 'sql.js'
import { computed, onMounted, ref, watch } from 'vue'
import './App.css'
import './redesign.css'
import DictionaryView from './components/DictionaryView.vue'
import LearnView from './components/LearnView.vue'
import ProgressBrowseView from './components/ProgressBrowseView.vue'
import UploadScreen from './components/UploadScreen.vue'
import DataMenu from './components/DataMenu.vue'
import GroqUsageBadge from './components/GroqUsageBadge.vue'
import AppSidebar, { type AppTab } from './components/AppSidebar.vue'
import ChatView from './components/ChatView.vue'
import GrammarView from './components/GrammarView.vue'
import { IDB_KEYS, ensureBackupCacheMigrated, idbGet, idbPut } from './lib/backupIdb'
import { getStudyStreak } from './lib/dailyLearned'
import { loadProgress } from './lib/progressStorage'
import { listCategoryStats, openRewordDatabase } from './db/rewordDb'
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

const progress = useProgressStore()

const db = ref<Database | null>(null)
const backupBuffer = ref<ArrayBuffer | null>(null)
const busy = ref(false)
const hydrating = ref(true)
const err = ref<string | null>(null)
const tab = ref<Tab>('learn')
const selectedCategoryId = ref<string | null>(null)
const sidebarOpen = ref(false)
const startWordId = ref<number | null>(null)

onMounted(() => {
  void (async () => {
    try {
      await ensureBackupCacheMigrated()
      const buf = await idbGet<ArrayBuffer>(IDB_KEYS.backupBuffer)
      if (!buf) {
        hydrating.value = false
        return
      }
      const database = await openRewordDatabase(buf)
      backupBuffer.value = buf
      db.value = database
    } catch (e) {
      err.value = e instanceof Error ? e.message : String(e)
    } finally {
      hydrating.value = false
    }
  })()
})

watch(db, (d) => {
  if (!d) return
  const snap = loadProgress()
  if (Object.keys(snap.words).length > 0) return
  progress.importFromRewordBackupDb(d, 'mergeOverwrite')
})

const categories = computed(() => (db.value ? listCategoryStats(db.value) : []))

const streak = computed(() => {
  void progress.revision
  return getStudyStreak()
})

async function handlePick(file: File) {
  busy.value = true
  err.value = null
  try {
    const buf = await file.arrayBuffer()
    await idbPut(IDB_KEYS.backupBuffer, buf)
    await idbPut(IDB_KEYS.backupMeta, { name: file.name, savedAt: Date.now() })
    const database = await openRewordDatabase(buf)
    backupBuffer.value = buf
    db.value = database
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function replaceBackup(buffer: ArrayBuffer, meta: { name: string }) {
  await idbPut(IDB_KEYS.backupBuffer, buffer)
  await idbPut(IDB_KEYS.backupMeta, { ...meta, savedAt: Date.now() })
  const database = await openRewordDatabase(buffer)
  backupBuffer.value = buffer
  db.value = database
}

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
</script>

<template>
  <div v-if="hydrating" class="upload-screen">
    <div class="upload-card">
      <div class="muted">Загрузка кэша словаря из браузера…</div>
    </div>
  </div>

  <UploadScreen v-else-if="!db" :busy="busy" :error="err" @pick="handlePick" />

  <div v-else class="app">
    <AppSidebar :tab="tab" :open="sidebarOpen" :streak="streak" @navigate="go" @close="sidebarOpen = false">
      <template #usage>
        <GroqUsageBadge />
      </template>
      <template #data>
        <DataMenu :db="db" :backup-buffer="backupBuffer" :on-replace-backup="replaceBackup" />
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
          :db="db"
          :categories="categories"
          :selected-id="selectedCategoryId"
          @select-category="selectedCategoryId = $event"
        />
        <LearnView
          v-else-if="tab === 'learn'"
          :db="db"
          :active-category-id="selectedCategoryId"
          :start-word-id="startWordId"
          @navigate="go"
          @consumed-start-word="onConsumedStartWord"
        />
        <ProgressBrowseView
          v-else-if="tab === 'repeat'"
          :db="db"
          mode="due_now"
          :active-category-id="selectedCategoryId"
          @repeat-word="onRepeatWord"
        />
        <ProgressBrowseView
          v-else-if="tab === 'learned'"
          :db="db"
          mode="learned_review"
          :active-category-id="selectedCategoryId"
        />
        <ProgressBrowseView
          v-else-if="tab === 'newWords'"
          :db="db"
          mode="new_words"
          :active-category-id="selectedCategoryId"
        />
        <GrammarView v-else-if="tab === 'grammar'" />
        <ChatView v-else />
      </main>
    </div>
  </div>
</template>
