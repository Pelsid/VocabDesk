<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WordRow } from '../lib/catalogTypes'
import StudyBadge from './StudyBadge.vue'
import WordListPanel from './WordListPanel.vue'
import { useProgressStore } from '../stores/progress'
import { useCatalogStore } from '../stores/catalog'
import { getSchedule, isReviewStageForDictionaryPct, isWordMastered } from '../study/localClassifier'
import { getCategoryGlyph } from '../lib/categoryIcons'
import { pctTone } from '../lib/dashboardPath'
import { listWordIdsInCategory } from '../lib/catalogScope'
import { storeToRefs } from 'pinia'

const props = defineProps<{
  selectedId: string | null
}>()

const emit = defineEmits<{ selectCategory: [id: string | null]; openGrammar: [id: string] }>()

const catalog = useCatalogStore()
const progress = useProgressStore()
const { snapshot, revision } = storeToRefs(progress)

const scopeMode = computed(() => snapshot.value.prefs.categoryScopeMode ?? 'reword')
const customIds = computed(() => snapshot.value.prefs.customCategoryIds ?? [])

const globalQ = ref('')
const onlySelectedCats = ref(false)
const globalHits = ref<WordRow[]>([])

watch(globalQ, async (q) => {
  if (q.trim().length < 2) {
    globalHits.value = []
    return
  }
  globalHits.value = await catalog.search(q)
})

const filteredCats = computed(() => {
  const base = onlySelectedCats.value ? catalog.dictionaries.filter((c) => c.isSelected) : catalog.dictionaries
  const q = globalQ.value.trim().toLowerCase()
  if (!q) return base
  return base.filter((c) => c.name.toLowerCase().includes(q))
})

const enrichedCats = computed(() => {
  void revision.value
  const trainingFirst = [...filteredCats.value].sort((a, b) => {
    const ta = scopeMode.value === 'custom' ? customIds.value.includes(a.id) : a.isSelected
    const tb = scopeMode.value === 'custom' ? customIds.value.includes(b.id) : b.isSelected
    if (ta !== tb) return ta ? -1 : 1
    if ((a.kind === 'oxford') !== (b.kind === 'oxford')) return a.kind === 'oxford' ? -1 : 1
    return a.name.localeCompare(b.name, 'ru')
  })
  return trainingFirst.map((c) => {
    const ids = listWordIdsInCategory(catalog.dictionaryWordIds, c.id)
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
    const inCustom = customIds.value.includes(c.id)
    const training = scopeMode.value === 'custom' ? inCustom : c.isSelected
    return { c, localPct, training }
  })
})

const trainingCats = computed(() => enrichedCats.value.filter((x) => x.training))
const archiveCats = computed(() => enrichedCats.value.filter((x) => !x.training))

const selectedCat = computed(() => catalog.dictionaries.find((x) => x.id === props.selectedId) ?? null)

function onCustomToggle(catId: string, on: boolean) {
  const set = new Set(customIds.value)
  if (on) set.add(catId)
  else set.delete(catId)
  void progress.updatePrefs({ customCategoryIds: [...set] })
}

function activateCustomMode() {
  if (scopeMode.value === 'custom') return
  const initial = catalog.dictionaries.filter((x) => x.isSelected).map((x) => x.id)
  void progress.updatePrefs({
    categoryScopeMode: 'custom',
    customCategoryIds:
      customIds.value.length > 0 ? customIds.value : initial.length > 0 ? initial : catalog.dictionaries.slice(0, 8).map((x) => x.id),
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
        :category-id="selectedId"
        :category-name="selectedCat.name"
        :category-glyph="getCategoryGlyph(selectedId, selectedCat.customIcon)"
        :oxford-overlap="selectedCat.oxfordOverlap ?? 0"
        :kind="selectedCat.kind ?? 'thematic'"
        @open-grammar="emit('openGrammar', $event)"
      />
    </template>

    <template v-else>
      <header class="page-head">
        <div>
          <h1>Словарь</h1>
          <p class="page-sub">
            Oxford 5000 — фундамент общей лексики примерно до B2. Для делового английского дополнительно откройте
            тематический набор «Бизнес».
          </p>
        </div>
        <div class="page-head-aside">
          <button
            type="button"
            :class="scopeMode === 'reword' ? 'btn-primary' : 'btn-quiet'"
            @click="progress.updatePrefs({ categoryScopeMode: 'reword' })"
          >
            По умолчанию
          </button>
          <button type="button" :class="scopeMode === 'custom' ? 'btn-primary' : 'btn-quiet'" @click="activateCustomMode">
            Свой набор
          </button>
        </div>
      </header>

      <div class="dict-toolbar">
        <div class="field">
          <span class="field-label">Поиск</span>
          <input v-model="globalQ" placeholder="Поиск по словарям и словам…" />
        </div>
        <label class="toggle">
          <input v-model="onlySelectedCats" type="checkbox" />
          Только активные
        </label>
        <span class="muted small dict-count">{{ enrichedCats.length }} наборов</span>
      </div>
      <p class="muted small dict-scope-help">
        «В обучении» попадает в очередь «Учить». «Архив» остаётся в справочнике, но не берётся в сессию.
      </p>
      <div class="dict-legend" aria-label="Цвет полосы прогресса">
        <span><i class="dict-legend-dot tone-warn" />0–34%</span>
        <span><i class="dict-legend-dot tone-accent" />35–49%</span>
        <span><i class="dict-legend-dot tone-teal" />50–69%</span>
        <span><i class="dict-legend-dot tone-ok" />70%+</span>
        <span class="muted">доля слов на стадии повторения</span>
      </div>

      <section v-if="globalQ.trim().length >= 2" class="section dictionary-global-hits">
        <div class="section-head">
          <h2>Слова по запросу</h2>
          <span class="muted small">{{ globalHits.length }} совпадений</span>
        </div>
        <div class="hits">
          <div v-for="w in globalHits" :key="w.id" class="hit">
            <span class="hit-word">{{ w.word }}</span>
            <span class="muted">{{ w.rus ?? '—' }}</span>
            <span v-if="w.oxfordLevels?.length" class="oxford-level-badge">{{ w.oxfordLevels.join(' · ') }}</span>
            <StudyBadge
              :schedule="getSchedule(snapshot.words, w.id)"
              :now="Date.now()"
              :mastered="isWordMastered(snapshot.mastered, w.id)"
            />
          </div>
        </div>
      </section>

      <p v-if="trainingCats.length === 0" class="muted small">
        Нет наборов «в обучении». Раскройте архив ниже или соберите свой набор.
      </p>
      <div class="dict-card-grid">
        <div v-for="{ c, localPct, training } in trainingCats" :key="c.id" class="dict-card">
          <button type="button" class="dict-card-main" @click="emit('selectCategory', c.id)">
            <div class="dict-card-name">{{ getCategoryGlyph(c.id, c.customIcon) }} {{ c.name }}</div>
            <div class="dict-card-meta muted small">
              {{ c.wordCount.toLocaleString('ru-RU') }} слов
              <template v-if="c.kind === 'thematic' && (c.oxfordOverlap ?? 0) > 0">
                · {{ c.oxfordOverlap }} в Oxford
              </template>
            </div>
            <div class="dict-card-pctrow" :class="`tone-${pctTone(localPct)}`">{{ localPct }}%</div>
            <div class="progress thin">
              <div class="progress-bar" :class="`tone-${pctTone(localPct)}`" :style="{ width: `${localPct}%` }" />
            </div>
          </button>
          <button
            type="button"
            class="dict-status"
            :class="{ on: training, clickable: scopeMode === 'custom' }"
            @click.stop="onStatusClick(c.id, training)"
          >
            В обучении
          </button>
        </div>
      </div>

      <details v-if="archiveCats.length" class="dict-archive-fold">
        <summary class="dict-archive-summary">Архив · {{ archiveCats.length }} наборов</summary>
        <div class="dict-card-grid">
          <div v-for="{ c, localPct } in archiveCats" :key="c.id" class="dict-card">
            <button type="button" class="dict-card-main" @click="emit('selectCategory', c.id)">
              <div class="dict-card-name">{{ getCategoryGlyph(c.id, c.customIcon) }} {{ c.name }}</div>
              <div class="dict-card-meta muted small">
                {{ c.wordCount.toLocaleString('ru-RU') }} слов
                <template v-if="c.kind === 'thematic' && (c.oxfordOverlap ?? 0) > 0">
                  · {{ c.oxfordOverlap }} в Oxford
                </template>
              </div>
              <div class="dict-card-pctrow" :class="`tone-${pctTone(localPct)}`">{{ localPct }}%</div>
              <div class="progress thin">
                <div class="progress-bar" :class="`tone-${pctTone(localPct)}`" :style="{ width: `${localPct}%` }" />
              </div>
            </button>
            <button
              type="button"
              class="dict-status"
              :class="{ clickable: scopeMode === 'custom' }"
              @click.stop="onStatusClick(c.id, false)"
            >
              Архив
            </button>
          </div>
        </div>
      </details>
    </template>
  </div>
</template>
