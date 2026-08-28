<script setup lang="ts">
import type { Database } from 'sql.js'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchWordsByIds, listCategoryStats, listWordIdsInScope, type WordRow } from '../db/rewordDb'
import { DEFAULT_PREFS, type CardSchedule, type CategoryScopePrefs, type Grade } from '../lib/progressTypes'
import { SRS_PRESETS } from '../lib/srsPresets'
import { buildSessionQueue, countDueSnapshot } from '../study/sessionQueue'
import {
  bumpDailyLearned,
  getCurrentWeekStudyFlags,
  getDailyLearnedCount,
  getStudyStreak,
} from '../lib/dailyLearned'
import { useProgressStore } from '../stores/progress'
import { storeToRefs } from 'pinia'
import ProgressDashboard from './ProgressDashboard.vue'
import DailyProgressRing from './DailyProgressRing.vue'
import SessionStudyCard from './SessionStudyCard.vue'
import { getSchedule, matchesProgressBrowse, type ProgressBrowseMode } from '../study/localClassifier'
import type { AppTab } from './AppSidebar.vue'

const props = defineProps<{
  db: Database
  activeCategoryId: string | null
  startWordId?: number | null
}>()

const emit = defineEmits<{
  navigate: [tab: AppTab]
  consumedStartWord: []
}>()

const progress = useProgressStore()
const { snapshot, revision } = storeToRefs(progress)

const scope = ref<'selected' | 'category'>(props.activeCategoryId ? 'category' : 'selected')
const queue = ref<WordRow[] | null>(null)
const idx = ref(0)
const todayLearned = ref(getDailyLearnedCount())

watch(
  () => props.activeCategoryId,
  () => {
    if (!props.activeCategoryId && scope.value === 'category') scope.value = 'selected'
  },
)

const scopePrefs = computed<CategoryScopePrefs>(() => ({
  categoryScopeMode: snapshot.value.prefs.categoryScopeMode ?? 'reword',
  customCategoryIds: snapshot.value.prefs.customCategoryIds ?? [],
}))

const categories = computed(() => listCategoryStats(props.db))

const counts = computed(() => {
  void revision.value
  const t = Date.now()
  const cid = scope.value === 'category' ? props.activeCategoryId : null
  return countDueSnapshot({ db: props.db, scope: scope.value, categoryId: cid, snapshot: snapshot.value, now: t })
})

const scopeCategoryId = computed(() => (scope.value === 'category' ? props.activeCategoryId : null))

const allScopeIds = computed(() =>
  listWordIdsInScope(props.db, scope.value, scopeCategoryId.value, scopePrefs.value),
)

const wordsInScopeTotal = computed(() => allScopeIds.value.length)

function countBrowse(mode: ProgressBrowseMode): number {
  void revision.value
  const t = Date.now()
  const cid = scope.value === 'category' ? props.activeCategoryId : null
  const ids = listWordIdsInScope(props.db, scope.value, cid, scopePrefs.value)
  let n = 0
  for (const id of ids) {
    if (matchesProgressBrowse(id, getSchedule(snapshot.value.words, id), mode, t, snapshot.value.mastered)) n++
  }
  return n
}

const repeatCount = computed(() => countBrowse('due_now'))
const learnedCount = computed(() => countBrowse('learned_review'))
const newCount = computed(() => countBrowse('new_words'))

const activeCats = computed(() => {
  if (scopePrefs.value.categoryScopeMode === 'custom') {
    const set = new Set(scopePrefs.value.customCategoryIds)
    return categories.value.filter((c) => set.has(c.id))
  }
  return categories.value.filter((c) => c.isSelected)
})

const activeWordsSum = computed(() => activeCats.value.reduce((acc, c) => acc + c.wordCount, 0))

const streak = computed(() => {
  void revision.value
  void todayLearned.value
  return getStudyStreak()
})

const weekFlags = computed(() => {
  void revision.value
  void todayLearned.value
  return getCurrentWeekStudyFlags()
})

function start(preferWordId?: number) {
  const cid = scope.value === 'category' ? props.activeCategoryId : null
  let ids = buildSessionQueue({
    db: props.db,
    scope: scope.value,
    categoryId: cid,
    snapshot: snapshot.value,
    now: Date.now(),
  })
  if (preferWordId != null) {
    ids = [preferWordId, ...ids.filter((id) => id !== preferWordId)]
  }
  if (!ids.length) {
    queue.value = null
    idx.value = 0
    return
  }
  const rows = fetchWordsByIds(props.db, ids)
  if (!rows.length) {
    queue.value = null
    idx.value = 0
    return
  }
  queue.value = rows
  idx.value = 0
}

function consumeStartWordIfNeeded() {
  const id = props.startWordId
  if (id == null) return
  start(id)
  emit('consumedStartWord')
}

onMounted(() => {
  window.addEventListener('keydown', onKeyEscape)
  consumeStartWordIfNeeded()
})

watch(
  () => props.startWordId,
  (id) => {
    if (id == null) return
    start(id)
    emit('consumedStartWord')
  },
)

function stop() {
  queue.value = null
  idx.value = 0
}

const done = computed(() => Boolean(queue.value && idx.value >= queue.value!.length))

const cur = computed(() => {
  const q = queue.value
  if (!q || done.value) return null
  return q[idx.value] ?? null
})

function deferCurrentInSession() {
  const q = queue.value
  const c = cur.value
  if (!q?.length || !c) return
  const span = 3 + Math.floor(Math.random() * 5)
  const copy = q.slice()
  const insertAt = Math.min(idx.value + 1 + span, copy.length)
  copy.splice(insertAt, 0, c)
  queue.value = copy
  idx.value++
}

watch(queue, (q) => {
  if (!q) {
    todayLearned.value = getDailyLearnedCount()
    return
  }
  if (q.length === 0) {
    stop()
    return
  }
  if (idx.value < q.length && q[idx.value] === undefined) {
    idx.value = q.length
  }
})

function recordCardStudied() {
  bumpDailyLearned()
  todayLearned.value = getDailyLearnedCount()
}

function onKeyEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && queue.value?.length) stop()
}

onUnmounted(() => window.removeEventListener('keydown', onKeyEscape))

const prefs = computed(() => ({ ...DEFAULT_PREFS, ...snapshot.value.prefs }))

const goal = computed(() => Math.max(5, Math.min(99, prefs.value.dailyGoalWords || 15)))

const remain = computed(() => Math.max(0, goal.value - todayLearned.value))

const dailyPct = computed(() => Math.min(100, Math.round((todayLearned.value / Math.max(1, goal.value)) * 100)))

const ctaLabel = computed(() => (todayLearned.value > 0 ? 'Продолжить' : 'Начать сессию'))

const scopeSubtitle = computed(() =>
  scope.value === 'selected'
    ? prefs.value.categoryScopeMode === 'custom'
      ? (prefs.value.customCategoryIds ?? []).length === 0
        ? 'Свой набор пуст — отметьте словари в «Словарях» или верните режим как в Reword'
        : `Свой набор: ${(prefs.value.customCategoryIds ?? []).length} словарей`
      : 'Все словари с флагом «в обучении» из бэкапа'
    : props.activeCategoryId
      ? 'Только открытый в «Словарях» набор'
      : 'Сначала откройте словарь — эта опция недоступна',
)

const progressPct = computed(() => {
  const q = queue.value
  if (!q?.length) return 0
  return Math.min(100, Math.round(((idx.value + 1) / q.length) * 100))
})

function isYoungCardSchedule(sched: CardSchedule | null): boolean {
  if (!sched) return true
  return sched.bucket === 'new' || sched.bucket === 'learning'
}

const schedForCur = computed(() =>
  cur.value ? (snapshot.value.words[String(cur.value.id)] ?? null) : null,
)
const youngCard = computed(() => isYoungCardSchedule(schedForCur.value))

function onMemorized() {
  const w = cur.value
  if (!w) return
  progress.gradeWord(w.id, 'good')
  recordCardStudied()
  idx.value++
}

function onGrade(g: Grade) {
  const w = cur.value
  if (!w) return
  progress.gradeWord(w.id, g)
  recordCardStudied()
  idx.value++
}

function onMarkMasteredForever() {
  const w = cur.value
  if (!w) return
  progress.markWordMastered(w.id)
  recordCardStudied()
  idx.value++
}
</script>

<template>
  <div v-if="!queue" class="learn-view">
    <header class="page-head">
      <div>
        <h1>Учить</h1>
        <p class="page-sub">Эффективное изучение слов из ваших словарей</p>
      </div>
      <div class="page-head-aside">
        <div class="mini-stat">
          <div class="mini-stat-k">Серия дней</div>
          <div class="mini-stat-v">{{ streak }} 🔥</div>
          <div class="mini-stat-checks" aria-hidden>
            <span v-for="(on, i) in weekFlags.slice(0, 3)" :key="i" :class="on ? 'on' : 'off'">{{ on ? '✓' : '○' }}</span>
          </div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-k">Сегодня</div>
          <div class="mini-stat-v">{{ todayLearned }} / {{ goal }}</div>
        </div>
      </div>
    </header>

    <div class="dash-hero">
      <div class="dash-card dash-today">
        <div class="learn-daily-ring-wrap">
          <DailyProgressRing :done="todayLearned" :goal="goal" />
          <div class="ring-center">{{ dailyPct }}%</div>
        </div>
        <div class="dash-today-copy">
          <div class="dash-today-title">Прогресс за день</div>
          <div class="dash-today-nums">{{ todayLearned }} / {{ goal }} карточек</div>
          <p class="muted small dash-today-remain">Осталось {{ remain }} карточек</p>
          <button type="button" class="btn-primary dash-continue" :disabled="counts.total === 0" @click="start()">
            {{ ctaLabel }}
          </button>
        </div>
      </div>

      <div class="dash-card">
        <div class="dash-stat-k">Активные словари</div>
        <div class="dash-stat-v">{{ activeCats.length }} из {{ categories.length }}</div>
        <p class="muted small dash-stat-sub">Всего слов {{ activeWordsSum.toLocaleString('ru-RU') }}</p>
      </div>

      <div class="dash-card">
        <div class="dash-stat-k">Цель на день</div>
        <div class="dash-stat-v">
          <label class="learn-daily-goal-label">
            <span class="sr-only">Цель на день</span>
            <input
              type="number"
              class="learn-daily-goal-input"
              min="5"
              max="99"
              :value="goal"
              @input="
                (e) => {
                  const n = Number((e.target as HTMLInputElement).value)
                  if (!Number.isFinite(n)) return
                  progress.updatePrefs({ dailyGoalWords: Math.max(5, Math.min(99, Math.floor(n))) })
                }
              "
            />
          </label>
          <span class="muted small"> карточек</span>
        </div>
        <div class="progress thin">
          <div class="progress-bar tone-teal" :style="{ width: `${dailyPct}%` }" />
        </div>
        <p class="muted small dash-stat-sub">{{ todayLearned }} / {{ goal }}</p>
      </div>
    </div>

    <ProgressDashboard
      :db="db"
      :categories="categories"
      :snapshot="snapshot"
      :revision="revision"
      :counts="counts"
      :words-in-scope-total="wordsInScopeTotal"
    />

    <section class="section">
      <div class="section-head">
        <h2>Быстрый доступ</h2>
      </div>
      <div class="quick-grid">
        <button type="button" class="quick-card" @click="emit('navigate', 'dictionary')">
          <span class="quick-ico purple" aria-hidden>📘</span>
          <span class="quick-title">Все словари</span>
          <span class="muted small">{{ categories.length }} наборов</span>
        </button>
        <button type="button" class="quick-card" @click="emit('navigate', 'repeat')">
          <span class="quick-ico violet" aria-hidden>↺</span>
          <span class="quick-title">Повторение</span>
          <span class="muted small">{{ repeatCount.toLocaleString('ru-RU') }} карточек</span>
        </button>
        <button type="button" class="quick-card" @click="emit('navigate', 'learned')">
          <span class="quick-ico green" aria-hidden>✓</span>
          <span class="quick-title">Изученное</span>
          <span class="muted small">{{ learnedCount.toLocaleString('ru-RU') }} слов</span>
        </button>
        <button type="button" class="quick-card" @click="emit('navigate', 'newWords')">
          <span class="quick-ico orange" aria-hidden>★</span>
          <span class="quick-title">Новое</span>
          <span class="muted small">{{ newCount.toLocaleString('ru-RU') }} слов</span>
        </button>
        <button type="button" class="quick-card" @click="emit('navigate', 'chat')">
          <span class="quick-ico blue" aria-hidden>💬</span>
          <span class="quick-title">Чат с AI</span>
          <span class="muted small">Практика языка</span>
        </button>
      </div>
    </section>

    <div v-if="counts.total === 0 && wordsInScopeTotal > 0" class="panel learn-empty-scope" role="status">
      <p class="learn-empty-title">В очереди «Учить» пока нечего показывать</p>
      <p class="muted small">
        Все <strong>{{ wordsInScopeTotal }}</strong> слов в этой области помечены «выучил навсегда». Они остаются в
        словаре и во вкладке «Изученное».
      </p>
    </div>

    <div v-if="wordsInScopeTotal === 0" class="panel learn-empty-scope" role="status">
      <p class="learn-empty-title">В этой области нет слов</p>
      <p class="muted small">Выберите «Все выбранные» или откройте набор в «Словарях».</p>
    </div>

    <details class="panel queue-settings learn-advanced-panel">
      <summary class="learn-advanced-summary">Настройки очереди</summary>
      <div class="learn-advanced-body">
        <div class="browse-scope" style="margin: 12px 0; padding: 0; border: 0; background: none">
          <span class="field-label">Область</span>
          <div class="learn-scope-switch">
            <button type="button" :class="{ active: scope === 'selected' }" @click="scope = 'selected'">Все выбранные</button>
            <button type="button" :class="{ active: scope === 'category' }" :disabled="!activeCategoryId" @click="scope = 'category'">
              Текущий словарь
            </button>
          </div>
          <p class="muted small browse-scope-note">{{ scopeSubtitle }}</p>
        </div>

        <ul class="learn-queue-list">
          <li>
            <span class="muted">Новых в запасе</span> <strong>{{ counts.fresh }}</strong>
            <span class="muted"> · взять за раз до </span>
            <strong>{{ prefs.newPerSession }}</strong>
          </li>
          <li>
            <span class="muted">К повторению сейчас</span> <strong>{{ counts.due }}</strong>
            <span class="muted"> · в очередь до </span>
            <strong>{{ prefs.reviewPerSession }}</strong>
          </li>
        </ul>

        <div class="srs-preset-block">
          <div class="muted small">Профиль нагрузки</div>
          <div class="srs-preset-grid">
            <button type="button" class="srs-preset-chip" :class="{ active: prefs.srsPresetId == null }" @click="progress.updatePrefs({ srsPresetId: null })">
              Вручную
            </button>
            <button
              v-for="p in SRS_PRESETS"
              :key="p.id"
              type="button"
              class="srs-preset-chip"
              :class="{ active: prefs.srsPresetId === p.id }"
              :title="p.description"
              @click="progress.updatePrefs({ ...p.prefs, srsPresetId: p.id })"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
        <div class="slider-row">
          <div class="muted small">Новых за сессию: {{ prefs.newPerSession }}</div>
          <input
            type="range"
            min="5"
            max="120"
            step="5"
            :value="prefs.newPerSession"
            @input="
              progress.updatePrefs({
                newPerSession: Number(($event.target as HTMLInputElement).value),
                srsPresetId: null,
              })
            "
          />
        </div>
        <div class="slider-row">
          <div class="muted small">Повторений за сессию: {{ prefs.reviewPerSession }}</div>
          <input
            type="range"
            min="20"
            max="400"
            step="10"
            :value="prefs.reviewPerSession"
            @input="
              progress.updatePrefs({
                reviewPerSession: Number(($event.target as HTMLInputElement).value),
                srsPresetId: null,
              })
            "
          />
        </div>
        <div class="slider-row">
          <div class="muted small">Интервал после выпуска (дни): {{ prefs.graduatingIntervalDays }}</div>
          <input
            type="range"
            min="1"
            max="14"
            step="1"
            :value="prefs.graduatingIntervalDays"
            @input="
              progress.updatePrefs({
                graduatingIntervalDays: Number(($event.target as HTMLInputElement).value),
                srsPresetId: null,
              })
            "
          />
        </div>
        <div class="slider-row">
          <div class="muted small">Easy — первый интервал (дни): {{ prefs.easyIntervalDays }}</div>
          <input
            type="range"
            min="2"
            max="14"
            step="1"
            :value="prefs.easyIntervalDays"
            @input="
              progress.updatePrefs({
                easyIntervalDays: Number(($event.target as HTMLInputElement).value),
                srsPresetId: null,
              })
            "
          />
        </div>
      </div>
    </details>
  </div>

  <div v-else class="learn-view learn-session-active">
    <section class="section learn-session-section">
      <div class="learn-session-toolbar">
        <div>
          <h2>Сессия</h2>
          <p class="muted small learn-session-meta">
            {{
              done
                ? 'Все карточки этой сессии пройдены'
                : queue && queue.length > 0
                  ? `Карточка ${idx + 1} из ${queue.length}`
                  : 'Сессия'
            }}
          </p>
        </div>
        <button type="button" class="btn-quiet" @click="stop">Закончить сессию</button>
      </div>

      <div v-if="!done && queue && queue.length > 0" class="learn-progress-block">
        <div
          class="learn-progress-track"
          role="progressbar"
          :aria-valuenow="idx + 1"
          aria-valuemin="1"
          :aria-valuemax="queue.length"
          :aria-label="`Прогресс: ${idx + 1} из ${queue.length}`"
        >
          <div class="learn-progress-value" :style="{ width: `${progressPct}%` }" />
        </div>
        <span class="muted small learn-progress-pct">{{ progressPct }}%</span>
      </div>

      <div v-if="done" class="panel learn-done-panel">
        <h3 class="learn-done-title">Отличная работа</h3>
        <p class="muted small">Прогресс сохранён в браузере. Карточки вернутся по расписанию SRS.</p>
        <button type="button" class="btn-primary" @click="stop">Вернуться к экрану «Учить»</button>
      </div>

      <SessionStudyCard
        v-else-if="cur"
        :key="`${cur.id}-${idx}`"
        :db="db"
        :word="cur"
        :schedule="schedForCur"
        :variant-is-young="youngCard"
        :scope="scope"
        :scope-prefs="scopePrefs"
        :category-id="scope === 'category' ? activeCategoryId : null"
        @memorized="onMemorized"
        @grade="onGrade"
        @mark-mastered-forever="onMarkMasteredForever"
        @defer-in-session="deferCurrentInSession"
      />

      <div v-else class="panel learn-session-fallback" role="status">
        <p class="muted small">
          Не удалось показать карточку (сессия могла устареть). Нажмите «Закончить сессию» и начните заново.
        </p>
      </div>
    </section>
  </div>
</template>
