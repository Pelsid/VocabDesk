<script setup lang="ts">
import type { Database } from 'sql.js'
import { computed, ref, watch } from 'vue'
import { fetchWordsByIds, listWordIdsInScope } from '../db/rewordDb'
import { parseExamples } from '../lib/examples'
import { formatDueLabel } from '../lib/srs'
import { useProgressStore } from '../stores/progress'
import { getSchedule, type ProgressBrowseMode, matchesProgressBrowse } from '../study/localClassifier'
import Highlighted from './Highlighted.vue'
import StudyBadge from './StudyBadge.vue'
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

function wordMatchesQuery(word: string, rus: string | null, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return word.toLowerCase().includes(t) || (rus?.toLowerCase().includes(t) ?? false)
}

const props = defineProps<{
  db: Database
  mode: ProgressBrowseMode
  activeCategoryId: string | null
}>()

const progress = useProgressStore()
const { snapshot, revision } = storeToRefs(progress)

const scope = ref<'selected' | 'category'>(props.activeCategoryId ? 'category' : 'selected')
const q = ref('')
const openId = ref<number | null>(null)

watch(
  () => props.activeCategoryId,
  () => {
    if (!props.activeCategoryId && scope.value === 'category') scope.value = 'selected'
  },
)

const copy = computed(() => MODE_COPY[props.mode])

const scopePrefs = computed(() => ({
  categoryScopeMode: snapshot.value.prefs.categoryScopeMode ?? 'reword',
  customCategoryIds: snapshot.value.prefs.customCategoryIds ?? [],
}))

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
  if (props.mode === 'due_now') {
    picked.sort((a, b) => a.due - b.due)
  } else if (props.mode === 'learned_review') {
    picked.sort((a, b) => a.due - b.due)
  } else {
    picked.sort((a, b) => a.id - b.id)
  }
  return picked.map((p) => p.id)
})

const rows = computed(() => {
  const words = fetchWordsByIds(props.db, orderedIds.value)
  const byId = new Map(words.map((w) => [w.id, w]))
  let list = orderedIds.value.map((id) => byId.get(id)).filter((w): w is NonNullable<typeof w> => Boolean(w))
  list = list.filter((w) => wordMatchesQuery(w.word, w.rus, q.value))
  if (props.mode === 'new_words') {
    list.sort((a, b) => a.word.localeCompare(b.word, 'und', { sensitivity: 'base' }))
  }
  return list.map((w) => ({
    w,
    sched: getSchedule(snapshot.value.words, w.id),
  }))
})

const scopeNote = computed(() =>
  scope.value === 'selected'
    ? 'Область: все словари с флагом «в обучении» в бэкапе'
    : props.activeCategoryId
      ? 'Область: только открытый во вкладке «Словарь» набор'
      : 'Откройте набор в «Словаре», чтобы включить «текущий словарь»',
)

function toggleOpen(id: number) {
  openId.value = openId.value === id ? null : id
}

function dueLine(sched: ReturnType<typeof getSchedule>) {
  if (props.mode === 'new_words' && (!sched || sched.bucket === 'new')) return '—'
  if (sched) return formatDueLabel(sched, Date.now())
  return '—'
}
</script>

<template>
  <div class="dictionary progress-browse">
    <section class="section">
      <div class="section-head">
        <h2>{{ copy.heading }}</h2>
        <span class="muted small">{{ rows.length }} слов в списке</span>
      </div>
      <p class="muted small browse-hint">{{ copy.hint }}</p>

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

      <div class="subtoolbar">
        <input v-model="q" placeholder="Фильтр по слову / переводу" aria-label="Фильтр по слову или переводу" />
      </div>

      <div class="table">
        <div class="table-head row row-5">
          <div>Слово</div>
          <div>Перевод</div>
          <div>Статус</div>
          <div>Далее</div>
          <div>Медиа</div>
        </div>
        <div v-for="{ w, sched } in rows" :key="w.id" :class="['table-row', openId === w.id ? 'open' : '']">
          <button type="button" class="row-main row-main-5" @click="toggleOpen(w.id)">
            <div class="w-word">
              <span class="en">{{ w.word }}</span>
              <span v-if="w.transcription" class="ipa muted small">{{ w.transcription }}</span>
            </div>
            <div class="ru muted">{{ w.rus ?? '—' }}</div>
            <div>
              <StudyBadge :schedule="sched" :now="Date.now()" />
            </div>
            <div>
              <span class="muted small">{{ dueLine(sched) }}</span>
            </div>
            <div class="muted small">
              {{ w.picBlobLen > 0 ? 'фото в бэкапе' : w.picSource ? `${w.picSource}` : '—' }}
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
            <div v-else class="muted small">В бэкапе нет примеров для этого слова.</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
