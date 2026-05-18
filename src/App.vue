<script setup lang="ts">
import type { Database } from 'sql.js'
import { computed, onMounted, ref, watch } from 'vue'
import './App.css'
import DictionaryView from './components/DictionaryView.vue'
import LearnView from './components/LearnView.vue'
import ProgressBrowseView from './components/ProgressBrowseView.vue'
import UploadScreen from './components/UploadScreen.vue'
import DataMenu from './components/DataMenu.vue'
import GroqUsageBadge from './components/GroqUsageBadge.vue'
import { IDB_KEYS, ensureBackupCacheMigrated, idbGet, idbPut } from './lib/backupIdb'
import { loadProgress } from './lib/progressStorage'
import { listCategoryStats, openRewordDatabase } from './db/rewordDb'
import { useProgressStore } from './stores/progress'

type Tab = 'dictionary' | 'learn' | 'repeat' | 'learned' | 'newWords'

const progress = useProgressStore()

const db = ref<Database | null>(null)
const backupBuffer = ref<ArrayBuffer | null>(null)
const busy = ref(false)
const hydrating = ref(true)
const err = ref<string | null>(null)
const tab = ref<Tab>('dictionary')
const selectedCategoryId = ref<string | null>(null)

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
</script>

<template>
  <div v-if="hydrating" class="upload-screen">
    <div class="upload-card">
      <div class="muted">Загрузка кэша словаря из браузера…</div>
    </div>
  </div>

  <UploadScreen v-else-if="!db" :busy="busy" :error="err" @pick="handlePick" />

  <div v-else class="app">
    <header class="topbar">
      <nav class="tabs" aria-label="Разделы">
        <button type="button" :class="{ active: tab === 'dictionary' }" @click="tab = 'dictionary'">Словарь</button>
        <button type="button" :class="{ active: tab === 'learn' }" @click="tab = 'learn'">Учить</button>
        <button type="button" :class="{ active: tab === 'repeat' }" @click="tab = 'repeat'">Повторение</button>
        <button type="button" :class="{ active: tab === 'learned' }" @click="tab = 'learned'">Изученное</button>
        <button type="button" :class="{ active: tab === 'newWords' }" @click="tab = 'newWords'">Новое</button>
      </nav>
      <div class="topbar-right">
        <GroqUsageBadge />
        <DataMenu :db="db" :backup-buffer="backupBuffer" :on-replace-backup="replaceBackup" />
      </div>
    </header>

    <main class="main">
      <DictionaryView
        v-if="tab === 'dictionary'"
        :db="db"
        :categories="categories"
        :selected-id="selectedCategoryId"
        @select-category="selectedCategoryId = $event"
      />
      <LearnView v-else-if="tab === 'learn'" :db="db" :active-category-id="selectedCategoryId" />
      <ProgressBrowseView
        v-else-if="tab === 'repeat'"
        :db="db"
        mode="due_now"
        :active-category-id="selectedCategoryId"
      />
      <ProgressBrowseView
        v-else-if="tab === 'learned'"
        :db="db"
        mode="learned_review"
        :active-category-id="selectedCategoryId"
      />
      <ProgressBrowseView v-else :db="db" mode="new_words" :active-category-id="selectedCategoryId" />
    </main>
  </div>
</template>
