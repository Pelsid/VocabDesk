<script setup lang="ts">
import type { Database } from 'sql.js'
import { computed, ref } from 'vue'
import type { CategoryStat } from '../db/rewordDb'
import { globalSearchWords, listWordIdsInCategory } from '../db/rewordDb'
import StudyBadge from './StudyBadge.vue'
import WordListPanel from './WordListPanel.vue'
import { useProgressStore } from '../stores/progress'
import { getSchedule, isReviewStageForDictionaryPct, isWordMastered } from '../study/localClassifier'
import { getCategoryGlyph } from '../lib/categoryIcons'
import { pctTone } from '../lib/dashboardPath'
import { storeToRefs } from 'pinia'

const props = defineProps<{
  db: Database
  categories: CategoryStat[]
  selectedId: string | null
}>()

const emit = defineEmits<{ selectCategory: [id: string | null] }>()

const progress = useProgressStore()
const { snapshot, revision } = storeToRefs(progress)

const scopeMode = computed(() => snapshot.value.prefs.categoryScopeMode ?? 'reword')
const customIds = computed(() => snapshot.value.prefs.customCategoryIds ?? [])

const globalQ = ref('')
const onlySelectedCats = ref(false)

const filteredCats = computed(() => {
  const base = onlySelectedCats.value ? props.categories.filter((c) => c.isSelected) : props.categories
  const q = globalQ.value.trim().toLowerCase()
  if (!q) return base
  return base.filter((c) => c.name.toLowerCase().includes(q))
})

const enrichedCats = computed(() => {
  void revision.value
  return filteredCats.value.map((c) => {
    const ids = listWordIdsInCategory(props.db, c.id)
    const learnedLocal = ids.reduce(
      (acc, id) =>
        acc +
        (isReviewStageForDictionaryPct(
          getSchedule(snapshot.value.words, id),
          isWordMastered(snapshot.value.mastered, id),
        )
          ? 1
          : 0),
      0,
    )
    const localPct = ids.length ? Math.round((learnedLocal / ids.length) * 100) : 0
    const backupPct = c.wordCount ? Math.round((c.learnedCount / c.wordCount) * 100) : 0
    const inCustom = customIds.value.includes(c.id)
    const training = scopeMode.value === 'custom' ? inCustom : c.isSelected
    return { c, localPct, backupPct, training }
  })
})

const globalHits = computed(() => {
  if (globalQ.value.trim().length < 2) return []
  return globalSearchWords(props.db, globalQ.value, 60)
})

const selectedCat = computed(() => props.categories.find((x) => x.id === props.selectedId) ?? null)

function onCustomToggle(catId: string, on: boolean) {
  const set = new Set(customIds.value)
  if (on) set.add(catId)
  else set.delete(catId)
  progress.updatePrefs({ customCategoryIds: [...set] })
}

function activateCustomMode() {
  if (scopeMode.value === 'custom') return
  const initial = props.categories.filter((x) => x.isSelected).map((x) => x.id)
  progress.updatePrefs({
    categoryScopeMode: 'custom',
    customCategoryIds:
      customIds.value.length > 0 ? customIds.value : initial.length > 0 ? initial : props.categories.slice(0, 8).map((x) => x.id),
  })
}

function onStatusClick(catId: string, currentlyTraining: boolean) {
  if (scopeMode.value !== 'custom') return
  onCustomToggle(catId, !currentlyTraining)
}
</script>

<template>
  <div class="dictionary">
    <template v-if="selectedId && selectedCat">
      <button type="button" class="btn-quiet dict-back" @click="emit('selectCategory', null)">← К словарям</button>
      <WordListPanel
        :db="db"
        :category-id="selectedId"
        :category-name="selectedCat.name"
        :category-glyph="getCategoryGlyph(selectedId, selectedCat.customIcon)"
      />
    </template>

    <template v-else>
      <header class="page-head">
        <div>
          <h1>Словари</h1>
          <p class="page-sub">Наборы слов из вашего бэкапа и прогресс по локальному SRS</p>
        </div>
        <div class="page-head-aside">
          <button
            type="button"
            :class="scopeMode === 'reword' ? 'btn-primary' : 'btn-quiet'"
            @click="progress.updatePrefs({ categoryScopeMode: 'reword' })"
          >
            Как в Reword
          </button>
          <button
            type="button"
            :class="scopeMode === 'custom' ? 'btn-primary' : 'btn-quiet'"
            @click="activateCustomMode"
          >
            Свой набор
          </button>
        </div>
      </header>

      <div class="dict-toolbar">
        <div class="field">
          <span class="field-label">Поиск</span>
          <input v-model="globalQ" placeholder="Поиск по словарям…" />
        </div>
        <label class="toggle">
          <input v-model="onlySelectedCats" type="checkbox" />
          Только активные
        </label>
        <span class="muted small dict-count">{{ enrichedCats.length }} наборов</span>
      </div>

      <p v-if="scopeMode === 'custom'" class="muted small browse-hint">
        В режиме своего набора кнопка «В обучении» включает словарь в смешанную очередь «Учить».
        <button
          type="button"
          class="btn-quiet dict-scope-sync"
          @click="progress.updatePrefs({ customCategoryIds: categories.filter((x) => x.isSelected).map((x) => x.id) })"
        >
          Подставить «в обучении» из Reword
        </button>
      </p>

      <section v-if="globalQ.trim().length >= 2" class="section dictionary-global-hits">
        <div class="section-head">
          <h2>Слова по запросу</h2>
          <span class="muted small">{{ globalHits.length }} совпадений (лимит 60)</span>
        </div>
        <div class="hits">
          <div v-for="w in globalHits" :key="w.id" class="hit">
            <span class="hit-word">{{ w.word }}</span>
            <span class="muted">{{ w.rus ?? '—' }}</span>
            <StudyBadge
              :schedule="getSchedule(snapshot.words, w.id)"
              :now="Date.now()"
              :mastered="isWordMastered(snapshot.mastered, w.id)"
            />
          </div>
        </div>
      </section>

      <div class="dict-card-grid">
        <div v-for="{ c, localPct, training } in enrichedCats" :key="c.id" class="dict-card">
          <button type="button" class="dict-card-main" @click="emit('selectCategory', c.id)">
            <div class="dict-card-name">{{ getCategoryGlyph(c.id, c.customIcon) }} {{ c.name }}</div>
            <div class="dict-card-meta muted small">{{ c.wordCount.toLocaleString('ru-RU') }} слов</div>
            <div class="dict-card-pctrow" :class="`tone-${pctTone(localPct)}`">{{ localPct }}%</div>
            <div class="progress thin">
              <div class="progress-bar" :class="`tone-${pctTone(localPct)}`" :style="{ width: `${localPct}%` }" />
            </div>
          </button>
          <button
            type="button"
            class="dict-status"
            :class="{ on: training, clickable: scopeMode === 'custom' }"
            :title="
              scopeMode === 'custom'
                ? 'Включить или выключить набор в смешанной очереди'
                : 'Флаг из файла экспорта Reword'
            "
            @click.stop="onStatusClick(c.id, training)"
          >
            {{ training ? 'В обучении' : 'Архив' }}
          </button>
        </div>
      </div>

      <button v-if="onlySelectedCats" type="button" class="show-all-link" @click="onlySelectedCats = false">
        Показать все словари
      </button>
    </template>
  </div>
</template>
