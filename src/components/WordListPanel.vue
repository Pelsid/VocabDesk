<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WordFilter, WordRow } from '../lib/catalogTypes'
import Highlighted from './Highlighted.vue'
import StudyBadge from './StudyBadge.vue'
import { parseExamples } from '../lib/examples'
import { useProgressStore } from '../stores/progress'
import { useCatalogStore } from '../stores/catalog'
import { getSchedule, matchesLocalFilter, isWordMastered } from '../study/localClassifier'
import { storeToRefs } from 'pinia'
import GrammarLinks from './GrammarLinks.vue'

const emit = defineEmits<{ openGrammar: [id: string] }>()

const props = defineProps<{
  categoryId: string
  categoryName: string
  categoryGlyph: string
  oxfordOverlap?: number
  kind?: string
}>()

const catalog = useCatalogStore()
const progress = useProgressStore()
const { snapshot, revision } = storeToRefs(progress)

const filter = ref<WordFilter>('all')
const q = ref('')
const openId = ref<number | null>(null)
const rowsAll = ref<WordRow[]>([])
const loading = ref(false)

async function reload() {
  loading.value = true
  try {
    rowsAll.value = await catalog.loadCategoryWords(props.categoryId)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.categoryId,
  () => {
    void reload()
  },
  { immediate: true },
)

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
        <template v-if="kind === 'thematic' && (oxfordOverlap ?? 0) > 0"> · {{ oxfordOverlap }} также в Oxford</template>
      </span>
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

    <div class="table">
      <div class="table-head row">
        <div>Слово</div>
        <div>Перевод</div>
        <div>Статус</div>
        <div>Oxford</div>
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
            {{ w.oxfordLevels?.length ? w.oxfordLevels.join(', ') : '—' }}
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
          <GrammarLinks :lemma="w.word" :oxford-levels="w.oxfordLevels" @open="emit('openGrammar', $event)" />
        </div>
      </div>
    </div>
  </section>
</template>
