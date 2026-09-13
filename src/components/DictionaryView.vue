<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { postPurgeOrphans } from '../api/client'
import { ORPHAN_DICTIONARY_ID, type WordRow } from '../lib/catalogTypes'
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

type LevelFilter = 'all' | 'a1a2' | 'b1b2' | 'b2plus'

const globalQ = ref('')
const onlySelectedCats = ref(false)
const levelFilter = ref<LevelFilter>('all')
const globalHits = ref<WordRow[]>([])
const newName = ref('')
const renameId = ref<string | null>(null)
const renameDraft = ref('')
const editorError = ref<string | null>(null)
const busy = ref(false)

function catCefr(c: { id: string; cefr?: string | null; name: string }): string {
  if (c.cefr) return c.cefr.toUpperCase()
  if (c.id === 'oxford5000_b2') return 'B2+'
  const m = c.name.match(/\b(A1|A2|B1|B2\+|B2|C1)\b/i)
  return m ? m[1].toUpperCase() : ''
}

function matchesLevel(c: { id: string; cefr?: string | null; name: string; kind?: string }, filter: LevelFilter) {
  if (filter === 'all') return true
  const lvl = catCefr(c)
  if (filter === 'a1a2') return lvl === 'A1' || lvl === 'A2'
  if (filter === 'b1b2') return lvl === 'B1' || lvl === 'B2'
  return lvl === 'B2+' || lvl === 'C1' || c.id === 'oxford5000_b2'
}

watch(globalQ, async (q) => {
  if (q.trim().length < 2) {
    globalHits.value = []
    return
  }
  globalHits.value = await catalog.search(q)
})

function isTraining(id: string, isSelected: boolean) {
  return scopeMode.value === 'custom' ? customIds.value.includes(id) : isSelected
}

function enrichOne(c: (typeof catalog.dictionaries)[number]) {
  const ids = listWordIdsInCategory(catalog.dictionaryWordIds, c.id)
  const learnedLocal = ids.reduce(
    (acc, id) =>
      acc +
      (isReviewStageForDictionaryPct(getSchedule(snapshot.value.words, id), isWordMastered(snapshot.value.mastered, id))
        ? 1
        : 0),
    0,
  )
  const localPct = ids.length ? Math.round((learnedLocal / ids.length) * 100) : 0
  return { c, localPct, training: isTraining(c.id, c.isSelected), cefr: catCefr(c), learnedLocal }
}

const mineCats = computed(() => {
  void revision.value
  const q = globalQ.value.trim().toLowerCase()
  return catalog.dictionaries
    .filter((c) => c.isCustom)
    .filter((c) => !onlySelectedCats.value || isTraining(c.id, c.isSelected))
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .map(enrichOne)
})

const filteredShared = computed(() => {
  const base = catalog.dictionaries.filter((c) => !c.isCustom)
  const shown = onlySelectedCats.value ? base.filter((c) => isTraining(c.id, c.isSelected)) : base
  const q = globalQ.value.trim().toLowerCase()
  return shown.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q)) return false
    return matchesLevel(c, levelFilter.value)
  })
})

const enrichedShared = computed(() => {
  void revision.value
  const trainingFirst = [...filteredShared.value].sort((a, b) => {
    const ta = isTraining(a.id, a.isSelected)
    const tb = isTraining(b.id, b.isSelected)
    if (ta !== tb) return ta ? -1 : 1
    if ((a.kind === 'oxford') !== (b.kind === 'oxford')) return a.kind === 'oxford' ? -1 : 1
    return a.name.localeCompare(b.name, 'ru')
  })
  return trainingFirst.map(enrichOne)
})

const oxfordCats = computed(() => enrichedShared.value.filter((x) => x.c.kind === 'oxford'))
const otherCats = computed(() => enrichedShared.value.filter((x) => x.c.kind !== 'oxford'))
const visibleCount = computed(() => mineCats.value.length + enrichedShared.value.length)

const selectedCat = computed(() => {
  if (props.selectedId === ORPHAN_DICTIONARY_ID) {
    return {
      id: ORPHAN_DICTIONARY_ID,
      name: 'Без словаря',
      isCustom: true,
      isSelected: false,
      canEdit: true,
      customIcon: 'custom',
      wordCount: catalog.orphanWordCount,
      learnedCount: 0,
      kind: 'other' as const,
      oxfordOverlap: 0,
    }
  }
  return catalog.dictionaries.find((x) => x.id === props.selectedId) ?? null
})

async function onStatusClick(catId: string, currentlyTraining: boolean) {
  const next = !currentlyTraining
  busy.value = true
  editorError.value = null
  try {
    await catalog.setSelected(catId, next)
    if (scopeMode.value === 'custom') {
      const set = new Set(customIds.value)
      if (next) set.add(catId)
      else set.delete(catId)
      await progress.updatePrefs({ customCategoryIds: [...set] })
    }
  } catch (e) {
    editorError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
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

async function createMine() {
  const name = newName.value.trim()
  if (!name) return
  busy.value = true
  editorError.value = null
  try {
    const d = await catalog.createDictionary(name)
    newName.value = ''
    emit('selectCategory', d.id)
  } catch (e) {
    editorError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function startRename(id: string, name: string) {
  renameId.value = id
  renameDraft.value = name
}

async function commitRename() {
  if (!renameId.value) return
  const name = renameDraft.value.trim()
  if (!name) return
  busy.value = true
  editorError.value = null
  try {
    await catalog.renameDictionary(renameId.value, name)
    renameId.value = null
  } catch (e) {
    editorError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function removeMine(id: string, name: string) {
  if (!confirm(`Удалить словарь «${name}»? Слова и прогресс останутся.`)) return
  busy.value = true
  editorError.value = null
  try {
    await catalog.removeDictionary(id)
    if (props.selectedId === id) emit('selectCategory', null)
  } catch (e) {
    editorError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function purgeOrphans() {
  if (!confirm('Удалить все свои слова, которые не входят ни в один словарь?')) return
  busy.value = true
  editorError.value = null
  try {
    await postPurgeOrphans()
    await catalog.refreshCatalog()
    if (props.selectedId === ORPHAN_DICTIONARY_ID) emit('selectCategory', null)
  } catch (e) {
    editorError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
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
        :can-edit="Boolean(selectedCat.canEdit || selectedCat.isCustom) && selectedId !== ORPHAN_DICTIONARY_ID"
        @open-grammar="emit('openGrammar', $event)"
      />
    </template>

    <template v-else>
      <header class="page-head">
        <div>
          <h1>Словари</h1>
          <p class="page-sub">
            Свои списки — сверху. Oxford — фундамент до B2. Ниже тематические наборы.
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
          <input v-model="globalQ" placeholder="Поиск словаря…" />
        </div>
        <div class="home-seg dict-level-seg">
          <button type="button" :class="{ active: levelFilter === 'all' }" @click="levelFilter = 'all'">Все</button>
          <button type="button" :class="{ active: levelFilter === 'a1a2' }" @click="levelFilter = 'a1a2'">A1–A2</button>
          <button type="button" :class="{ active: levelFilter === 'b1b2' }" @click="levelFilter = 'b1b2'">B1–B2</button>
          <button type="button" :class="{ active: levelFilter === 'b2plus' }" @click="levelFilter = 'b2plus'">B2+</button>
        </div>
        <label class="toggle">
          <input v-model="onlySelectedCats" type="checkbox" />
          Только активные
        </label>
        <span class="muted small dict-count">{{ visibleCount }} наборов</span>
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
      <p v-if="editorError" class="alert">{{ editorError }}</p>

      <section class="dict-list-section">
        <h2 class="dict-more-title">Мои словари</h2>
        <form class="dict-create-bar" @submit.prevent="createMine">
          <input v-model="newName" maxlength="120" placeholder="Название нового словаря" />
          <button type="submit" class="btn-primary" :disabled="busy || !newName.trim()">Создать словарь</button>
        </form>
        <div v-if="catalog.orphanWordCount > 0" class="dict-list">
          <article class="dict-row">
            <button type="button" class="dict-row-main" @click="emit('selectCategory', ORPHAN_DICTIONARY_ID)">
              <span class="dict-level lvl-x">∅</span>
              <span class="dict-row-body">
                <span class="dict-card-name">Без словаря</span>
                <span class="dict-row-meta">
                  <span class="muted small">{{ catalog.orphanWordCount }} своих слов не в списках</span>
                </span>
              </span>
            </button>
            <button type="button" class="btn-quiet" :disabled="busy" @click="purgeOrphans">Очистить</button>
          </article>
        </div>
        <p v-if="mineCats.length === 0" class="muted small">Пока нет личных словарей — создайте первый.</p>
        <div v-else class="dict-list">
          <article v-for="{ c, localPct, training, learnedLocal } in mineCats" :key="c.id" class="dict-row">
            <button type="button" class="dict-row-main" @click="emit('selectCategory', c.id)">
              <span class="dict-level lvl-x">{{ getCategoryGlyph(c.id, c.customIcon) }}</span>
              <span class="dict-row-body">
                <span class="dict-card-name">{{ c.name }}</span>
                <span class="dict-row-meta">
                  <span class="muted small">{{ learnedLocal.toLocaleString('ru-RU') }} / {{ c.wordCount.toLocaleString('ru-RU') }}</span>
                  <span class="dict-card-pctrow" :class="`tone-${pctTone(localPct)}`">{{ localPct }}%</span>
                </span>
                <span class="progress thin">
                  <span class="progress-bar" :class="`tone-${pctTone(localPct)}`" :style="{ width: `${localPct}%` }" />
                </span>
              </span>
            </button>
            <div class="dict-mine-actions">
              <button type="button" class="dict-status clickable" :class="{ on: training }" @click.stop="onStatusClick(c.id, training)">
                {{ training ? 'В обучении' : 'Архив' }}
              </button>
              <button type="button" class="btn-quiet" :disabled="busy" @click.stop="startRename(c.id, c.name)">Переименовать</button>
              <button type="button" class="btn-quiet" :disabled="busy" @click.stop="removeMine(c.id, c.name)">Удалить</button>
            </div>
          </article>
        </div>
        <form v-if="renameId" class="dict-create-bar" @submit.prevent="commitRename">
          <input v-model="renameDraft" maxlength="120" />
          <button type="submit" class="btn-primary" :disabled="busy">Сохранить имя</button>
          <button type="button" class="btn-quiet" @click="renameId = null">Отмена</button>
        </form>
      </section>

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

      <p v-if="enrichedShared.length === 0 && mineCats.length === 0" class="muted small">Нет словарей по этому фильтру.</p>

      <section v-if="oxfordCats.length" class="dict-list-section">
        <div class="dict-list">
          <article v-for="{ c, localPct, training, cefr, learnedLocal } in oxfordCats" :key="c.id" class="dict-row">
            <button type="button" class="dict-row-main" @click="emit('selectCategory', c.id)">
              <span class="dict-level" :class="`lvl-${(cefr || 'x').toLowerCase().replace('+', 'p')}`">{{ cefr || 'OX' }}</span>
              <span class="dict-row-body">
                <span class="dict-card-name">{{ c.name }}</span>
                <span class="dict-row-meta">
                  <span class="muted small">{{ learnedLocal.toLocaleString('ru-RU') }} / {{ c.wordCount.toLocaleString('ru-RU') }}</span>
                  <span class="dict-card-pctrow" :class="`tone-${pctTone(localPct)}`">{{ localPct }}%</span>
                </span>
                <span class="progress thin">
                  <span class="progress-bar" :class="`tone-${pctTone(localPct)}`" :style="{ width: `${localPct}%` }" />
                </span>
              </span>
            </button>
            <button type="button" class="dict-status clickable" :class="{ on: training }" @click.stop="onStatusClick(c.id, training)">
              {{ training ? 'В обучении' : 'Архив' }}
            </button>
          </article>
        </div>
      </section>

      <section v-if="otherCats.length" class="dict-list-section">
        <h2 class="dict-more-title">Ещё словари</h2>
        <div class="dict-list">
          <article v-for="{ c, localPct, training, cefr, learnedLocal } in otherCats" :key="c.id" class="dict-row">
            <button type="button" class="dict-row-main" @click="emit('selectCategory', c.id)">
              <span class="dict-level" :class="cefr ? `lvl-${cefr.toLowerCase().replace('+', 'p')}` : 'lvl-x'">
                {{ cefr || getCategoryGlyph(c.id, c.customIcon) }}
              </span>
              <span class="dict-row-body">
                <span class="dict-card-name">{{ c.name }}</span>
                <span class="dict-row-meta">
                  <span class="muted small">
                    {{ learnedLocal.toLocaleString('ru-RU') }} / {{ c.wordCount.toLocaleString('ru-RU') }}
                    <template v-if="(c.oxfordOverlap ?? 0) > 0"> · {{ c.oxfordOverlap }} в Oxford</template>
                  </span>
                  <span class="dict-card-pctrow" :class="`tone-${pctTone(localPct)}`">{{ localPct }}%</span>
                </span>
                <span class="progress thin">
                  <span class="progress-bar" :class="`tone-${pctTone(localPct)}`" :style="{ width: `${localPct}%` }" />
                </span>
              </span>
            </button>
            <button type="button" class="dict-status clickable" :class="{ on: training }" @click.stop="onStatusClick(c.id, training)">
              {{ training ? 'В обучении' : 'Архив' }}
            </button>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>
