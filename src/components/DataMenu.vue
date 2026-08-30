<script setup lang="ts">
import { ref, watch } from 'vue'
import { useProgressStore } from '../stores/progress'
import { useCatalogStore } from '../stores/catalog'
import { storeToRefs } from 'pinia'
import { buildWeakWordsExportText } from '../lib/exportWeakWords'

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

const catalog = useCatalogStore()
const progress = useProgressStore()
const { snapshot } = storeToRefs(progress)

const open = ref(false)
const status = ref<string | null>(null)
const groqKeyDraft = ref('')
const showGroqKey = ref(false)
const confirmWord = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  groqKeyDraft.value = ''
  showGroqKey.value = false
  confirmWord.value = ''
  status.value = null
})

async function saveGroqKey() {
  const next = groqKeyDraft.value.trim()
  await progress.setGroqKey(next)
  status.value = next ? 'Ключ Groq сохранён в CoreWords.' : 'Ключ Groq удалён.'
}

async function removeGroqKey() {
  groqKeyDraft.value = ''
  await progress.setGroqKey('')
  status.value = 'Ключ Groq удалён.'
}

function exportProgressJson() {
  const payload = JSON.stringify(snapshot.value, null, 2)
  downloadBlob(`vocabdesk_progress_${yyyyMmDd()}.json`, new TextEncoder().encode(payload), 'application/json')
  status.value = 'JSON прогресса скачан.'
}

async function exportWeakWordsTxt() {
  if (!snapshot.value.weakWordLog?.length) {
    status.value = 'Журнал «слабых» слов пуст.'
    return
  }
  const ids = [...new Set(snapshot.value.weakWordLog.map((e) => e.id))]
  const rows = await catalog.ensureWords(ids)
  const text = buildWeakWordsExportText(rows, snapshot.value)
  downloadBlob(`vocabdesk_weak_words_${yyyyMmDd()}.txt`, new TextEncoder().encode(text), 'text/plain;charset=utf-8')
  status.value = 'Список слабых слов скачан.'
}

async function resetProgressOnly() {
  if (confirmWord.value.trim() !== 'УДАЛИТЬ') {
    status.value = 'Введите УДАЛИТЬ, чтобы подтвердить сброс.'
    return
  }
  await progress.clearProgressOnly()
  confirmWord.value = ''
  status.value = 'Прогресс в CoreWords обнулён.'
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
            <div class="muted small">Прогресс и ключ AI хранятся в базе CoreWords.</div>
          </div>
          <button type="button" class="btn-quiet" @click="open = false">Закрыть</button>
        </div>

        <div class="modal-body">
          <section class="modal-section">
            <h3>Аккаунт и синхронизация</h3>
            <p class="muted small">Экспорт копии прогресса на этот компьютер. Словарь уже в MariaDB.</p>
            <div class="row-btns">
              <button type="button" class="btn-primary" @click="exportProgressJson">Скачать progress.json</button>
              <button type="button" class="btn-quiet" @click="exportWeakWordsTxt">Слабые слова (.txt)</button>
            </div>
          </section>

          <section class="modal-section">
            <h3>AI (необязательно)</h3>
            <p class="muted small">
              Ключ Groq нужен только для Чата и подсказок в сессии. Хранится на сервере и не показывается повторно.
            </p>
            <input
              v-model="groqKeyDraft"
              :type="showGroqKey ? 'text' : 'password'"
              class="select"
              autocomplete="off"
              spellcheck="false"
              :placeholder="progress.hasGroqKey ? 'Ключ задан — вставьте новый, чтобы заменить' : 'gsk_…'"
              @keydown.enter.prevent="saveGroqKey"
            />
            <div class="row-btns">
              <button type="button" class="btn-primary" @click="saveGroqKey">Сохранить ключ</button>
              <button type="button" class="btn-quiet" @click="showGroqKey = !showGroqKey">
                {{ showGroqKey ? 'Скрыть' : 'Показать' }}
              </button>
              <button v-if="progress.hasGroqKey" type="button" class="btn-quiet" @click="removeGroqKey">Удалить ключ</button>
            </div>
          </section>

          <section class="modal-section danger-zone">
            <h3>Опасная зона</h3>
            <p class="muted small">Сброс прогресса необратим. Словари останутся. Введите слово УДАЛИТЬ.</p>
            <input v-model="confirmWord" class="select" placeholder="УДАЛИТЬ" autocomplete="off" />
            <div class="row-btns">
              <button type="button" class="btn-danger" :disabled="confirmWord.trim() !== 'УДАЛИТЬ'" @click="resetProgressOnly">
                Сбросить прогресс
              </button>
            </div>
          </section>

          <div v-if="status" class="modal-status">{{ status }}</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
