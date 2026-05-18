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
    return { c, localPct, backupPct }
  })
})

const globalHits = computed(() => {
  if (globalQ.value.trim().length < 2) return []
  return globalSearchWords(props.db, globalQ.value, 60)
})

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
</script>

<template>
  <div class="dictionary">
    <div class="toolbar">
      <div class="field">
        <span class="field-label">Поиск</span>
        <input v-model="globalQ" placeholder="Категория или слово (от 2 букв для слов)" />
      </div>
      <label class="toggle">
        <input v-model="onlySelectedCats" type="checkbox" />
        Только активные словари из файла экспорта
      </label>

      <div class="field dictionary-scope-toolbar">
        <span class="field-label">Область «Все выбранные» во вкладке «Учить»</span>
        <div class="learn-scope-switch dict-scope-switch">
          <button
            type="button"
            :class="{ active: scopeMode === 'reword' }"
            @click="progress.updatePrefs({ categoryScopeMode: 'reword' })"
          >
            Как в Reword
          </button>
          <button type="button" :class="{ active: scopeMode === 'custom' }" @click="activateCustomMode">Свой набор</button>
        </div>
        <div v-if="scopeMode === 'custom'" class="dict-scope-extra muted small">
          <button
            type="button"
            class="btn-quiet dict-scope-sync"
            @click="progress.updatePrefs({ customCategoryIds: categories.filter((x) => x.isSelected).map((x) => x.id) })"
          >
            Подставить «в обучении» из Reword
          </button>
          <span> Отметьте наборы галочкой на карточках.</span>
        </div>
      </div>
    </div>

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

    <div :class="selectedId ? 'dictionary-columns' : 'dictionary-columns dictionary-columns-single'">
      <section class="section dictionary-cats-pane">
        <div class="section-head">
          <h2>Словари</h2>
          <span class="muted small">{{ enrichedCats.length }} наборов</span>
        </div>
        <div class="cat-grid">
          <div v-for="{ c, localPct, backupPct } in enrichedCats" :key="c.id" :class="['cat-card', selectedId === c.id ? 'active' : '']">
            <button type="button" class="cat-card-main" @click="emit('selectCategory', c.id)">
              <div class="cat-top">
                <span class="cat-icon" aria-hidden title="Иконка словаря">
                  {{ getCategoryGlyph(c.id, c.customIcon) }}
                </span>
                <div class="cat-name-block">
                  <div class="cat-name">{{ c.name }}</div>
                </div>
                <div :class="['pct', c.isSelected ? 'on' : 'off']" title="Словарь помечен как активный для обучения в приложении экспорта">
                  {{ c.isSelected ? 'в обучении' : 'архив' }}
                </div>
              </div>
              <div class="cat-meta muted small">
                {{ c.wordCount }} слов · здесь после изучения (аналог Q≥3): {{ localPct }}% · в файле .backup (Q≥3):
                {{ backupPct }}%
              </div>
              <div class="progress">
                <div class="progress-bar local" :style="{ width: `${localPct}%` }" />
              </div>
            </button>
            <label v-if="scopeMode === 'custom'" class="cat-custom-scope">
              <input type="checkbox" :checked="customIds.includes(c.id)" @change="onCustomToggle(c.id, ($event.target as HTMLInputElement).checked)" />
              <span>В смешанном наборе</span>
            </label>
          </div>
        </div>
      </section>

      <div v-if="selectedId" class="dictionary-words-pane">
        <WordListPanel
          :db="db"
          :category-id="selectedId"
          :category-name="categories.find((x) => x.id === selectedId)?.name ?? ''"
          :category-glyph="getCategoryGlyph(selectedId, categories.find((x) => x.id === selectedId)?.customIcon ?? null)"
        />
      </div>
    </div>
  </div>
</template>
