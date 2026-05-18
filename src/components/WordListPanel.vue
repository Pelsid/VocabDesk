<script setup lang="ts">
import type { Database } from 'sql.js'
import { computed, ref } from 'vue'
import { listWordsInCategory, type WordFilter } from '../db/rewordDb'
import Highlighted from './Highlighted.vue'
import StudyBadge from './StudyBadge.vue'
import { parseExamples } from '../lib/examples'
import { useProgressStore } from '../stores/progress'
import { getSchedule, matchesLocalFilter, isWordMastered } from '../study/localClassifier'
import { storeToRefs } from 'pinia'

const props = defineProps<{
  db: Database
  categoryId: string
  categoryName: string
  categoryGlyph: string
}>()

const progress = useProgressStore()
const { snapshot, revision } = storeToRefs(progress)

const filter = ref<WordFilter>('all')
const q = ref('')
const openId = ref<number | null>(null)

const rowsAll = computed(() => listWordsInCategory(props.db, props.categoryId, q.value))

const rows = computed(() => {
  void revision.value
  const now = Date.now()
  return rowsAll.value
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
      <span class="muted small">{{ rows.length }} слов в списке</span>
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

    <div class="table">
      <div class="table-head row">
        <div>Слово</div>
        <div>Перевод</div>
        <div>Статус</div>
        <div>Медиа</div>
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
</template>
