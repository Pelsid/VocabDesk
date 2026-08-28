<script setup lang="ts">
import type { Database } from 'sql.js'
import { computed, ref, watch } from 'vue'
import { fetchWordsByIds, listWordIdsInScope } from '../db/rewordDb'
import { parseExamples } from '../lib/examples'
import { formatLastReviewed } from '../lib/srs'
import { useProgressStore } from '../stores/progress'
import { getSchedule, type ProgressBrowseMode, matchesProgressBrowse } from '../study/localClassifier'
import Highlighted from './Highlighted.vue'
import type { CardSchedule } from '../lib/progressTypes'
import { storeToRefs } from 'pinia'

const MODE_COPY: Record<ProgressBrowseMode, { heading: string; hint: string }> = {
  new_words: {
    heading: 'Новое',
    hint: 'Слова без записи в локальном SRS или со статусом «новое». Область та же, что и во вкладке «Учить».',
  },
  due_now: {
    heading: 'Повторение',
    hint: 'Карточки с наступившим сроком: повторение (review), доучивание (learning) и восстановление (relearn).',
  },
  learned_review: {
    heading: 'Изученное',
    hint: 'Интервальное повторение (review) и слова, отмеченные «Выучил навсегда».',
  },
}

type DueChip = 'all' | 'overdue' | 'hard'
type DiffKind = 'hard' | 'medium' | 'easy'

function wordMatchesQuery(word: string, rus: string | null, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return word.toLowerCase().includes(t) || (rus?.toLowerCase().includes(t) ?? false)
}

function difficultyOf(
  wordId: number,
  sched: CardSchedule | null,
  mastered: boolean,
  weakIds: Set<number>,
): DiffKind {
  if (mastered) return 'easy'
  if (sched?.bucket === 'learning' || sched?.bucket === 'relearn' || weakIds.has(wordId)) return 'hard'
  if (sched?.bucket === 'review' && sched.intervalDays >= 14) return 'easy'
  return 'medium'
}

const DIFF_LABEL: Record<DiffKind, string> = {
  hard: 'Сложно',
  medium: 'Средне',
  easy: 'Легко',
}

const props = defineProps<{
  db: Database
  mode: ProgressBrowseMode
  activeCategoryId: string | null
}>()

const emit = defineEmits<{ repeatWord: [id: number] }>()

const progress = useProgressStore()
const { snapshot, revision } = storeToRefs(progress)

const scope = ref<'selected' | 'category'>(props.activeCategoryId ? 'category' : 'selected')
const q = ref('')
const openId = ref<number | null>(null)
const dueChip = ref<DueChip>('all')
const showAll = ref(false)
const PAGE = 40

watch(
  () => props.activeCategoryId,
  () => {
    if (!props.activeCategoryId && scope.value === 'category') scope.value = 'selected'
  },
)

watch(
  () => props.mode,
  () => {
    dueChip.value = 'all'
    showAll.value = false
    openId.value = null
    q.value = ''
  },
)

const copy = computed(() => MODE_COPY[props.mode])

const scopePrefs = computed(() => ({
  categoryScopeMode: snapshot.value.prefs.categoryScopeMode ?? 'reword',
  customCategoryIds: snapshot.value.prefs.customCategoryIds ?? [],
}))

const weakIds = computed(() => new Set((snapshot.value.weakWordLog ?? []).map((h) => h.id)))

const orderedIds = computed(() => {
  void revision.value
  const t = Date.now()
  const categoryId = scope.value === 'category' ? props.activeCategoryId : null
  const ids = listWordIdsInScope(props.db, scope.value, categoryId, scopePrefs.value)
  type Item = { id: number; due: number }
  const picked: Item[] = []
  for (const id of ids) {
    const sched = getSchedule(snapshot.value.words, id)
    if (!matchesProgressBrowse(id, sched, props.mode, t, snapshot.value.mastered)) continue
    picked.push({ id, due: sched?.due ?? 0 })
  }
  if (props.mode === 'due_now' || props.mode === 'learned_review') {
    picked.sort((a, b) => a.due - b.due)
  } else {
    picked.sort((a, b) => a.id - b.id)
  }
  return picked.map((p) => p.id)
})

const allRows = computed(() => {
  const words = fetchWordsByIds(props.db, orderedIds.value)
  const byId = new Map(words.map((w) => [w.id, w]))
  let list = orderedIds.value.map((id) => byId.get(id)).filter((w): w is NonNullable<typeof w> => Boolean(w))
  list = list.filter((w) => wordMatchesQuery(w.word, w.rus, q.value))
  if (props.mode === 'new_words') {
    list.sort((a, b) => a.word.localeCompare(b.word, 'und', { sensitivity: 'base' }))
  }
  const now = Date.now()
  const day = 86_400_000
  return list.map((w) => {
    const sched = getSchedule(snapshot.value.words, w.id)
    const mastered = Boolean(snapshot.value.mastered?.[String(w.id)])
    const diff = difficultyOf(w.id, sched, mastered, weakIds.value)
    return { w, sched, mastered, diff, overdue: Boolean(sched && sched.due < now - day) }
  })
})

const filteredRows = computed(() => {
  if (props.mode !== 'due_now' || dueChip.value === 'all') return allRows.value
  if (dueChip.value === 'overdue') return allRows.value.filter((r) => r.overdue)
  return allRows.value.filter((r) => r.diff === 'hard')
})

const visibleRows = computed(() => (showAll.value ? filteredRows.value : filteredRows.value.slice(0, PAGE)))

const overdueN = computed(() => allRows.value.filter((r) => r.overdue).length)
const hardN = computed(() => allRows.value.filter((r) => r.diff === 'hard').length)

const scopeNote = computed(() =>
  scope.value === 'selected'
    ? 'Область: все словари с флагом «в обучении» в бэкапе'
    : props.activeCategoryId
      ? 'Область: только открытый в «Словарях» набор'
      : 'Откройте набор в «Словарях», чтобы включить «текущий словарь»',
)

function toggleOpen(id: number) {
  openId.value = openId.value === id ? null : id
}

function dueLine(sched: ReturnType<typeof getSchedule>) {
  if (props.mode === 'new_words' && (!sched || sched.bucket === 'new')) return 'ещё не начато'
  return formatLastReviewed(sched, Date.now())
}
</script>

<template>
  <div class="progress-browse">
    <header class="page-head">
      <div>
        <h1>{{ copy.heading }}</h1>
        <p class="page-sub">{{ filteredRows.length.toLocaleString('ru-RU') }} карточек · {{ copy.hint }}</p>
      </div>
    </header>

    <div class="browse-scope">
      <span class="field-label">Область</span>
      <div class="learn-scope-switch">
        <button type="button" :class="{ active: scope === 'selected' }" @click="scope = 'selected'">Все выбранные</button>
        <button type="button" :class="{ active: scope === 'category' }" :disabled="!activeCategoryId" @click="scope = 'category'">
          Текущий словарь
        </button>
      </div>
      <p class="muted small browse-scope-note">{{ scopeNote }}</p>
    </div>

    <div v-if="mode === 'due_now'" class="chip-row">
      <button type="button" class="chip" :class="{ active: dueChip === 'all' }" @click="dueChip = 'all'">
        Все ({{ allRows.length }})
      </button>
      <button type="button" class="chip" :class="{ active: dueChip === 'overdue' }" @click="dueChip = 'overdue'">
        Просроченные ({{ overdueN }})
      </button>
      <button type="button" class="chip" :class="{ active: dueChip === 'hard' }" @click="dueChip = 'hard'">
        Сложные ({{ hardN }})
      </button>
    </div>

    <div class="subtoolbar">
      <input v-model="q" placeholder="Фильтр по слову / переводу" aria-label="Фильтр по слову или переводу" />
    </div>

    <div class="word-card-list">
      <article v-for="{ w, sched, diff } in visibleRows" :key="w.id" class="word-card">
        <button type="button" class="dict-card-main" style="width: auto; flex: 1; min-width: 140px" @click="toggleOpen(w.id)">
          <div class="word-card-en">{{ w.word }}</div>
          <span v-if="w.transcription" class="ipa muted small">{{ w.transcription }}</span>
        </button>
        <div class="word-card-mid">
          <span class="diff-pill" :class="diff">{{ DIFF_LABEL[diff] }}</span>
          <span class="muted small">{{ dueLine(sched) }}</span>
        </div>
        <button
          v-if="mode === 'due_now'"
          type="button"
          class="btn-primary"
          @click="emit('repeatWord', w.id)"
        >
          Повторить
        </button>
        <div v-if="openId === w.id" class="word-card-detail">
          <div class="muted small">{{ w.rus ?? 'Нет перевода в бэкапе' }}</div>
          <div v-if="parseExamples(w.examplesRus).length" class="examples">
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
        </div>
      </article>
    </div>

    <button
      v-if="filteredRows.length > PAGE && !showAll"
      type="button"
      class="show-all-link"
      @click="showAll = true"
    >
      Показать все ({{ filteredRows.length }})
    </button>
  </div>
</template>
