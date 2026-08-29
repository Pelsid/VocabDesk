<script setup lang="ts">
import type { Database } from 'sql.js'
import { ref, watch } from 'vue'
import { openRewordDatabase } from '../db/rewordDb'
import { exportDatabaseWithSchedules } from '../lib/rewordSchedule'
import type { ImportMode } from '../lib/progressTypes'
import { clearProgressStorage } from '../lib/progressStorage'
import { buildWeakWordsExportText } from '../lib/exportWeakWords'
import { idbClearAll } from '../lib/backupIdb'
import { useProgressStore } from '../stores/progress'
import { storeToRefs } from 'pinia'
import { clearGroqApiKey, getStoredGroqApiKey, setGroqApiKey } from '../lib/groqApiKey'

function yyyyMmDd() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function downloadBlob(filename: string, data: Uint8Array, mime = 'application/octet-stream') {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const blob = new Blob([copy], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const props = defineProps<{
  db: Database | null
  backupBuffer: ArrayBuffer | null
  onReplaceBackup: (buffer: ArrayBuffer, meta: { name: string }) => Promise<void>
}>()

const progress = useProgressStore()
const { snapshot } = storeToRefs(progress)

const open = ref(false)
const status = ref<string | null>(null)
const groqKeyDraft = ref(getStoredGroqApiKey())
const showGroqKey = ref(false)
const groqKeySaved = ref(Boolean(getStoredGroqApiKey()))

watch(open, (isOpen) => {
  if (!isOpen) return
  groqKeyDraft.value = getStoredGroqApiKey()
  groqKeySaved.value = Boolean(groqKeyDraft.value)
  showGroqKey.value = false
})

function saveGroqKey() {
  const next = groqKeyDraft.value.trim()
  groqKeyDraft.value = next
  setGroqApiKey(next)
  groqKeySaved.value = Boolean(next)
  status.value = next ? 'Ключ Groq сохранён в localStorage.' : 'Ключ Groq удалён.'
}

function removeGroqKey() {
  groqKeyDraft.value = ''
  showGroqKey.value = false
  clearGroqApiKey()
  groqKeySaved.value = false
  status.value = 'Ключ Groq удалён.'
}

const importProgressInputRef = ref<HTMLInputElement | null>(null)
const replaceDbInputRef = ref<HTMLInputElement | null>(null)

const modes = [
  { id: 'replaceAll' as ImportMode, label: 'Полностью заменить локальный прогресс' },
  { id: 'mergeMissing' as ImportMode, label: 'Добавить только отсутствующие слова' },
  { id: 'mergeOverwrite' as ImportMode, label: 'Обновить все совпадающие ID из файла' },
] as const

const mode = ref<ImportMode>('mergeOverwrite')

const canExport = () => props.backupBuffer != null

async function exportMergedBackup() {
  if (!props.backupBuffer) return
  status.value = 'Собираю файл…'
  try {
    const bin = await exportDatabaseWithSchedules(props.backupBuffer, snapshot.value.words)
    downloadBlob(`vocabdesk_merged_${yyyyMmDd()}.backup`, bin)
    status.value = 'Готово: скачан merged-бэкап (прогресс вписан в WORD).'
  } catch (e) {
    status.value = e instanceof Error ? e.message : String(e)
  }
}

function exportWeakWordsTxt() {
  if (!props.db) {
    status.value = 'База слов не загружена.'
    return
  }
  if (!snapshot.value.weakWordLog?.length) {
    status.value = 'Журнал «слабых» слов пуст — ещё не было оценок «Снова» или «Сложно».'
    return
  }
  const text = buildWeakWordsExportText(props.db, snapshot.value)
  downloadBlob(`vocabdesk_weak_words_${yyyyMmDd()}.txt`, new TextEncoder().encode(text), 'text/plain;charset=utf-8')
  status.value = 'Список слабых слов скачан.'
}

function exportProgressJson() {
  const payload = JSON.stringify(snapshot.value, null, 2)
  downloadBlob(`vocabdesk_progress_${yyyyMmDd()}.json`, new TextEncoder().encode(payload), 'application/json')
  status.value = 'JSON прогресса скачан.'
}

async function onImportProgressFile(file: File | undefined) {
  if (!file) return
  status.value = 'Читаю бэкап для импорта прогресса…'
  try {
    const buf = await file.arrayBuffer()
    const db = await openRewordDatabase(buf)
    const n = progress.importFromRewordBackupDb(db, mode.value)
    db.close()
    progress.refresh()
    status.value = `Импорт завершён (${mode.value}). Обновлено записей: ${n}`
  } catch (e) {
    status.value = e instanceof Error ? e.message : String(e)
  }
}

async function onReplaceDbFile(file: File | undefined) {
  if (!file) return
  status.value = 'Обновляю словарь…'
  try {
    const buf = await file.arrayBuffer()
    await props.onReplaceBackup(buf, { name: file.name })
    status.value = 'База слов обновлена. Локальный прогресс сохранён.'
  } catch (e) {
    status.value = e instanceof Error ? e.message : String(e)
  }
}

async function clearEverything() {
  if (!confirm('Удалить локальный прогресс И кэш бэкапа в браузере?')) return
  clearProgressStorage()
  await idbClearAll()
  progress.refresh()
  location.reload()
}

function resetProgressOnly() {
  if (!confirm('Сбросить только прогресс обучения на этом сайте?')) return
  progress.clearProgressOnly()
  status.value = 'Прогресс обнулён.'
}
</script>

<template>
  <button type="button" class="btn-quiet sidebar-data-btn" @click="open = true">Данные</button>

  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">Данные и синхронизация</div>
            <div class="muted small">
              Прогресс обучения хранится в localStorage. Файл бэкапа кэшируется в IndexedDB (из‑за размера).
            </div>
          </div>
          <button type="button" class="btn-quiet" @click="open = false">Закрыть</button>
        </div>

      <div class="modal-body">
        <section class="modal-section">
          <h3>Ключ Groq API</h3>
          <p class="muted small">
            Для чата и подсказок ИИ. Хранится в localStorage этого браузера и не сбрасывается при закрытии сайта или
            сбросе прогресса.
          </p>
          <input
            v-model="groqKeyDraft"
            :type="showGroqKey ? 'text' : 'password'"
            class="select"
            autocomplete="off"
            spellcheck="false"
            placeholder="gsk_…"
            @keydown.enter.prevent="saveGroqKey"
          />
          <div class="row-btns">
            <button type="button" class="btn-primary" @click="saveGroqKey">Сохранить ключ</button>
            <button type="button" class="btn-quiet" @click="showGroqKey = !showGroqKey">
              {{ showGroqKey ? 'Скрыть' : 'Показать' }}
            </button>
            <button v-if="groqKeySaved" type="button" class="btn-quiet" @click="removeGroqKey">Удалить ключ</button>
          </div>
        </section>

        <section class="modal-section">
          <h3>Импорт прогресса из файла .backup</h3>
          <p class="muted small">
            Выберите режим и файл <code>*.backup</code> экспорта со словаря. Импортируются поля прогресса из таблицы WORD
            (приблизительное сопоставление с локальным SRS).
          </p>
          <select v-model="mode" class="select">
            <option v-for="m in modes" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
          <div class="row-btns">
            <button type="button" class="btn-primary" @click="importProgressInputRef?.click()">Выбрать бэкап…</button>
            <input
              ref="importProgressInputRef"
              type="file"
              accept=".backup,application/octet-stream,*/*"
              hidden
              @change="onImportProgressFile(($event.target as HTMLInputElement).files?.[0])"
            />
          </div>
        </section>

        <section class="modal-section">
          <h3>Обновить словарь (новый бэкап)</h3>
          <p class="muted small">Заменяет только базу слов в IndexedDB. Прогресс не трогаем.</p>
          <div class="row-btns">
            <button type="button" class="btn-quiet" @click="replaceDbInputRef?.click()">Выбрать новый *.backup словаря…</button>
            <input
              ref="replaceDbInputRef"
              type="file"
              accept=".backup,application/octet-stream,*/*"
              hidden
              @change="onReplaceDbFile(($event.target as HTMLInputElement).files?.[0])"
            />
          </div>
        </section>

        <section class="modal-section">
          <h3>Экспорт</h3>
          <div class="row-btns">
            <button type="button" class="btn-primary" :disabled="!canExport()" @click="exportMergedBackup()">Скачать merged .backup</button>
            <button type="button" class="btn-quiet" :disabled="!db" @click="exportWeakWordsTxt">Слабые слова (.txt)</button>
            <button type="button" class="btn-quiet" @click="exportProgressJson">Скачать progress.json</button>
          </div>
          <p class="muted small">
            Объединённый файл — это ваш исходный .backup, в который записаны локальные стадии в колонки WORD (приёмник может по-разному
            их интерпретировать).
          </p>
          <p class="muted small">
            «Слабые слова» — последние ответы «Снова» / «Сложно» (табуляция: слово, перевод, метаданные).
          </p>
        </section>

        <section class="modal-section danger-zone">
          <h3>Очистка</h3>
          <div class="row-btns">
            <button type="button" class="btn-quiet" @click="resetProgressOnly">Сбросить прогресс (localStorage)</button>
            <button type="button" class="btn-danger" @click="clearEverything()">Удалить всё и перезагрузить</button>
          </div>
        </section>

        <div v-if="status" class="modal-status">{{ status }}</div>
      </div>
    </div>
    </div>
  </Teleport>
</template>
