<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { deleteUserWord, fetchOrphanWords, postCreateWord, putUpdateWord } from '../api/client'
import { ORPHAN_DICTIONARY_ID, type WordFilter, type WordRow } from '../lib/catalogTypes'
import { parseExamples } from '../lib/examples'
import Highlighted from './Highlighted.vue'
import StudyBadge from './StudyBadge.vue'
import GrammarLinks from './GrammarLinks.vue'
import WordLinksEditor from './WordLinksEditor.vue'
import { useProgressStore } from '../stores/progress'
import { useCatalogStore } from '../stores/catalog'
import { getSchedule, matchesLocalFilter, isWordMastered } from '../study/localClassifier'
import { storeToRefs } from 'pinia'

const emit = defineEmits<{ openGrammar: [id: string] }>()

const props = defineProps<{
  categoryId: string
  categoryName: string
  categoryGlyph: string
  canEdit?: boolean
}>()

const catalog = useCatalogStore()
const progress = useProgressStore()
const { snapshot, revision } = storeToRefs(progress)

const filter = ref<WordFilter>('all')
const q = ref('')
const openId = ref<number | null>(null)
const rowsAll = ref<WordRow[]>([])
const loading = ref(false)
const editorError = ref<string | null>(null)
const catalogQ = ref('')
const catalogHits = ref<WordRow[]>([])
const lemma = ref('')
const rus = ref('')
const transcription = ref('')
const exampleO = ref('')
const exampleT = ref('')
const suggestGlobal = ref<WordRow[]>([])
const editId = ref<number | null>(null)
const busy = ref(false)

const isOrphans = computed(() => props.categoryId === ORPHAN_DICTIONARY_ID)
const editable = computed(() => Boolean(props.canEdit) && !isOrphans.value)

async function reload() {
  loading.value = true
  editorError.value = null
  try {
    rowsAll.value = isOrphans.value ? await fetchOrphanWords() : await catalog.loadCategoryWords(props.categoryId)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.categoryId,
  () => {
    openId.value = null
    editId.value = null
    suggestGlobal.value = []
    void reload()
  },
  { immediate: true },
)

watch(catalogQ, async (term) => {
  if (!editable.value || term.trim().length < 2) {
    catalogHits.value = []
    return
  }
  const have = new Set(rowsAll.value.map((w) => w.id))
  catalogHits.value = (await catalog.search(term)).filter((w) => !have.has(w.id))
})

const rows = computed(() => {
  void revision.value
  const now = Date.now()
  const t = q.value.trim().toLowerCase()
  return rowsAll.value
    .filter((w) => !t || w.word.toLowerCase().includes(t) || (w.rus?.toLowerCase().includes(t) ?? false))
    .filter((w) => matchesLocalFilter(getSchedule(snapshot.value.words, w.id), filter.value, w.id, snapshot.value.mastered))
    .map((w) => ({
      w,
      sched: getSchedule(snapshot.value.words, w.id),
      now,
    }))
})

function toggleOpen(id: number) {
  openId.value = openId.value === id ? null : id
}

function examplesPayload() {
  const o = exampleO.value.trim()
  const t = exampleT.value.trim()
  return o || t ? [{ o, t }] : undefined
}

async function addExisting(wordId: number) {
  busy.value = true
  editorError.value = null
  try {
    await catalog.addWordsToDictionary(props.categoryId, [wordId])
    catalogHits.value = catalogHits.value.filter((w) => w.id !== wordId)
    await reload()
  } catch (e) {
    editorError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function createOwn() {
  const word = lemma.value.trim()
  if (!word) {
    editorError.value = 'Укажите слово'
    return
  }
  busy.value = true
  editorError.value = null
  try {
    const res = await postCreateWord({
      dictionaryId: props.categoryId,
      lemma: word,
      rus: rus.value.trim() || undefined,
      transcription: transcription.value.trim() || undefined,
      examples: examplesPayload(),
    })
    catalog.wordCache[res.word.id] = res.word
    if (res.dictionary) catalog.patchDictionary(res.dictionary)
    suggestGlobal.value = res.suggestGlobal
    lemma.value = ''
    rus.value = ''
    transcription.value = ''
    exampleO.value = ''
    exampleT.value = ''
    await reload()
    await catalog.refreshCatalog()
  } catch (e) {
    editorError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function removeFromDict(wordId: number) {
  busy.value = true
  editorError.value = null
  try {
    await catalog.removeWordsFromDictionary(props.categoryId, [wordId])
    await reload()
    await catalog.refreshCatalog()
  } catch (e) {
    editorError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function startEdit(w: WordRow) {
  editId.value = w.id
  openId.value = w.id
  lemma.value = w.word
  rus.value = w.rus ?? ''
  transcription.value = w.transcription ?? ''
  const ex = parseExamples(w.examplesRus)[0]
  exampleO.value = ex?.original ?? ''
  exampleT.value = ex?.translate ?? ''
}

async function saveEdit() {
  if (editId.value == null) return
  busy.value = true
  editorError.value = null
  try {
    const word = await putUpdateWord({
      wordId: editId.value,
      lemma: lemma.value.trim(),
      rus: rus.value.trim(),
      transcription: transcription.value.trim(),
      examples: examplesPayload() ?? [],
    })
    catalog.wordCache[word.id] = word
    editId.value = null
    lemma.value = ''
    rus.value = ''
    transcription.value = ''
    exampleO.value = ''
    exampleT.value = ''
    await reload()
  } catch (e) {
    editorError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function destroyWord(wordId: number) {
  if (!confirm('Удалить слово полностью? Прогресс и связи по нему пропадут.')) return
  busy.value = true
  editorError.value = null
  try {
    await deleteUserWord(wordId)
    delete catalog.wordCache[wordId]
    await reload()
    await catalog.refreshCatalog()
  } catch (e) {
    editorError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="section">
    <div class="section-head section-head-with-icon">
      <h2>
        <span class="section-icon" aria-hidden>{{ categoryGlyph }}</span>
        {{ categoryName }}
      </h2>
      <span class="muted small">
        {{ rows.length }} слов
      </span>
    </div>

    <div v-if="editable" class="dict-editor">
      <p class="muted small">Добавьте карточку из каталога или создайте свою.</p>
      <div class="field">
        <span class="field-label">Поиск по каталогу</span>
        <input v-model="catalogQ" placeholder="Найти слово и добавить" />
      </div>
      <div v-if="catalogHits.length" class="hits">
        <div v-for="w in catalogHits" :key="w.id" class="hit">
          <span class="hit-word">{{ w.word }}</span>
          <span class="muted">{{ w.rus ?? '—' }}</span>
          <button type="button" class="btn-quiet" :disabled="busy" @click="addExisting(w.id)">Добавить</button>
        </div>
      </div>

      <form class="dict-create-word" @submit.prevent="editId ? saveEdit() : createOwn()">
        <div class="dict-create-grid">
          <label class="field">
            <span class="field-label">Своё слово</span>
            <input v-model="lemma" required placeholder="lemma" />
          </label>
          <label class="field">
            <span class="field-label">Перевод</span>
            <input v-model="rus" placeholder="чтобы работал тест" />
          </label>
          <label class="field">
            <span class="field-label">Транскрипция</span>
            <input v-model="transcription" />
          </label>
        </div>
        <label class="field">
          <span class="field-label">Пример (EN)</span>
          <input v-model="exampleO" />
        </label>
        <label class="field">
          <span class="field-label">Пример (RU)</span>
          <input v-model="exampleT" />
        </label>
        <div class="row-btns">
          <button type="submit" class="btn-primary" :disabled="busy">
            {{ editId ? 'Сохранить слово' : 'Создать своё слово' }}
          </button>
          <button v-if="editId" type="button" class="btn-quiet" @click="editId = null">Отмена</button>
        </div>
      </form>
      <div v-if="suggestGlobal.length" class="hits">
        <p class="muted small">В общем каталоге уже есть похожие карточки — можно добавить их вместо своей:</p>
        <div v-for="w in suggestGlobal" :key="w.id" class="hit">
          <span class="hit-word">{{ w.word }}</span>
          <span class="muted">{{ w.rus ?? '—' }}</span>
          <button type="button" class="btn-quiet" :disabled="busy" @click="addExisting(w.id)">Добавить готовую</button>
        </div>
      </div>
      <p v-if="editorError" class="alert">{{ editorError }}</p>
    </div>

    <div class="subtoolbar">
      <div class="seg">
        <button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">Все</button>
        <button type="button" :class="{ active: filter === 'new' }" @click="filter = 'new'">Новые</button>
        <button type="button" :class="{ active: filter === 'learning' }" @click="filter = 'learning'">Изучение</button>
        <button type="button" :class="{ active: filter === 'review' }" @click="filter = 'review'">Повторение</button>
      </div>
      <input v-model="q" placeholder="Фильтр по слову / переводу" />
    </div>

    <p v-if="loading" class="muted small">Загрузка слов…</p>
    <p v-else-if="rowsAll.length === 0" class="muted small">
      {{ editable ? 'Словарь пуст. Найдите слово в каталоге или создайте своё.' : 'В этом словаре пока нет слов.' }}
    </p>

    <div class="table">
      <div class="table-head row">
        <div>Слово</div>
        <div>Перевод</div>
        <div>Статус</div>
        <div>Уровень</div>
      </div>
      <div v-for="{ w, sched, now } in rows" :key="w.id" :class="['table-row', openId === w.id ? 'open' : '']">
        <button type="button" class="row-main" @click="toggleOpen(w.id)">
          <div class="w-word">
            <span class="en">{{ w.word }}</span>
            <span v-if="w.transcription" class="ipa muted small">{{ w.transcription }}</span>
          </div>
          <div class="ru muted">{{ w.rus ?? '—' }}</div>
          <div>
            <StudyBadge :schedule="sched" :now="now" :mastered="isWordMastered(snapshot.mastered, w.id)" />
          </div>
          <div class="muted small">
            {{ w.levels?.length ? w.levels.join(', ') : w.isOwn ? 'своё' : '—' }}
          </div>
        </button>
        <div v-if="openId === w.id" class="row-detail">
          <div v-if="parseExamples(w.examplesRus).length" class="examples">
            <div class="muted small">Примеры</div>
            <ul>
              <li v-for="(e, idx) in parseExamples(w.examplesRus)" :key="idx">
                <div class="ex-o">
                  <Highlighted :text="e.original" />
                </div>
                <div class="ex-t muted">
                  <Highlighted :text="e.translate" />
                </div>
              </li>
            </ul>
          </div>
          <div v-else class="muted small">Нет примеров для этого слова.</div>
          <div v-if="editable || isOrphans" class="row-btns word-row-actions">
            <button v-if="editable" type="button" class="btn-quiet" :disabled="busy" @click="removeFromDict(w.id)">
              Удалить из словаря
            </button>
            <button v-if="w.isOwn" type="button" class="btn-quiet" :disabled="busy" @click="startEdit(w)">Изменить</button>
            <button v-if="w.isOwn" type="button" class="btn-danger" :disabled="busy" @click="destroyWord(w.id)">
              Удалить слово
            </button>
          </div>
          <WordLinksEditor :word-id="w.id" />
          <GrammarLinks :lemma="w.word" :levels="w.levels" @open="emit('openGrammar', $event)" />
        </div>
      </div>
    </div>
  </section>
</template>
