<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { WordRow } from '../lib/catalogTypes'
import { DEFAULT_PREFS, type CardSchedule, type CategoryScopePrefs, type Grade } from '../lib/progressTypes'
import { SRS_PRESETS } from '../lib/srsPresets'
import { buildSessionQueue, countDueSnapshot } from '../study/sessionQueue'
import { useCatalogStore } from '../stores/catalog'
import { useProgressStore } from '../stores/progress'
import { storeToRefs } from 'pinia'
import DailyProgressRing from './DailyProgressRing.vue'
import SessionStudyCard from './SessionStudyCard.vue'
import type { AppTab } from './AppSidebar.vue'

const props = defineProps<{
  activeCategoryId: string | null
  startWordId?: number | null
  autoStart?: boolean
}>()

const emit = defineEmits<{
  navigate: [tab: AppTab]
  consumedStartWord: []
  consumedAutoStart: []
  openGrammar: [id: string]
}>()

type SessionStats = { answered: number; again: number; hard: number; good: number; easy: number; memorized: number }

function emptyStats(): SessionStats {
  return { answered: 0, again: 0, hard: 0, good: 0, easy: 0, memorized: 0 }
}

type PendingKind = 'grade' | 'memorized' | 'mastered'
type PendingCommit = { wordId: number; kind: PendingKind; grade?: Grade }

const catalog = useCatalogStore()
const progress = useProgressStore()
const { snapshot, revision, daily } = storeToRefs(progress)

const scope = ref<'selected' | 'category'>(props.activeCategoryId ? 'category' : 'selected')
const queue = ref<WordRow[] | null>(null)
const idx = ref(0)
const starting = ref(false)
const sessionStats = ref<SessionStats>(emptyStats())
const pending = ref<PendingCommit | null>(null)
const undoVisible = ref(false)
let pendingTimer = 0

function clearPendingTimer() {
  if (pendingTimer) {
    window.clearTimeout(pendingTimer)
    pendingTimer = 0
  }
}

async function commitNow(p: PendingCommit) {
  sessionStats.value = { ...sessionStats.value, answered: sessionStats.value.answered + 1 }
  if (p.kind === 'grade' && p.grade) {
    sessionStats.value = { ...sessionStats.value, [p.grade]: sessionStats.value[p.grade] + 1 }
    await progress.gradeWord(p.wordId, p.grade)
    return
  }
  if (p.kind === 'memorized') {
    sessionStats.value = {
      ...sessionStats.value,
      memorized: sessionStats.value.memorized + 1,
      good: sessionStats.value.good + 1,
    }
    await progress.gradeWord(p.wordId, 'good')
    return
  }
  sessionStats.value = { ...sessionStats.value, memorized: sessionStats.value.memorized + 1 }
  await progress.markWordMastered(p.wordId)
}

async function flushPending() {
  const p = pending.value
  if (!p) return
  pending.value = null
  undoVisible.value = false
  clearPendingTimer()
  await commitNow(p)
}

function scheduleCommit(next: PendingCommit) {
  const prev = pending.value
  clearPendingTimer()
  pending.value = next
  undoVisible.value = true
  idx.value++
  if (prev) void commitNow(prev)
  pendingTimer = window.setTimeout(() => {
    void flushPending()
  }, 4500)
}

function undoLast() {
  if (!pending.value) return
  clearPendingTimer()
  pending.value = null
  undoVisible.value = false
  idx.value = Math.max(0, idx.value - 1)
}

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

const categories = computed(() => catalog.dictionaries)

const scopeCategoryId = computed(() => (scope.value === 'category' ? props.activeCategoryId : null))

const allScopeIds = computed(() => catalog.idsInScope(scope.value, scopeCategoryId.value, scopePrefs.value))

const counts = computed(() => {
  void revision.value
  return countDueSnapshot({ ids: allScopeIds.value, snapshot: snapshot.value, now: Date.now() })
})

const wordsInScopeTotal = computed(() => allScopeIds.value.length)

const todayQueueSize = computed(() => counts.value.due + Math.min(counts.value.fresh, prefs.value.newPerSession))
const etaMin = computed(() => Math.max(1, Math.round(todayQueueSize.value * 0.45)))

const activeCats = computed(() => {
  if (scopePrefs.value.categoryScopeMode === 'custom') {
    const set = new Set(scopePrefs.value.customCategoryIds)
    return categories.value.filter((c) => set.has(c.id))
  }
  return categories.value.filter((c) => c.isSelected)
})

const todayLearned = computed(() => daily.value.todayCount)
const streak = computed(() => daily.value.streak)

async function start(preferWordId?: number, limit?: number) {
  starting.value = true
  await flushPending()
  sessionStats.value = emptyStats()
  try {
    let ids = buildSessionQueue({
      ids: allScopeIds.value,
      snapshot: snapshot.value,
      now: Date.now(),
    })
    if (preferWordId != null) {
      ids = [preferWordId, ...ids.filter((id) => id !== preferWordId)]
    }
    if (limit != null) ids = ids.slice(0, limit)
    if (!ids.length) {
      queue.value = null
      idx.value = 0
      return
    }
    const rows = await catalog.ensureWords(ids)
    if (!rows.length) {
      queue.value = null
      idx.value = 0
      return
    }
    queue.value = rows
    idx.value = 0
  } finally {
    starting.value = false
  }
}

function consumeStartWordIfNeeded() {
  const id = props.startWordId
  if (id == null) return
  void start(id)
  emit('consumedStartWord')
}

onMounted(() => {
  window.addEventListener('keydown', onKeyEscape)
  consumeStartWordIfNeeded()
  if (props.autoStart && !props.startWordId) {
    void start(undefined, isFirstUse.value ? 5 : undefined)
    emit('consumedAutoStart')
  }
})

watch(
  () => props.startWordId,
  (id) => {
    if (id == null) return
    void start(id)
    emit('consumedStartWord')
  },
)

function stop() {
  void flushPending()
  queue.value = null
  idx.value = 0
  undoVisible.value = false
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
  if (!q) return
  if (q.length === 0) {
    stop()
    return
  }
  if (idx.value < q.length && q[idx.value] === undefined) {
    idx.value = q.length
  }
})

function onKeyEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && queue.value?.length) stop()
}

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyEscape)
  void flushPending()
})

const prefs = computed(() => ({ ...DEFAULT_PREFS, ...snapshot.value.prefs }))
const goal = computed(() => Math.max(5, Math.min(99, prefs.value.dailyGoalWords || 15)))
const remain = computed(() => Math.max(0, goal.value - todayLearned.value))
const dailyPct = computed(() => Math.min(100, Math.round((todayLearned.value / Math.max(1, goal.value)) * 100)))
const isFirstUse = computed(
  () => Object.keys(snapshot.value.words).length === 0 && Object.keys(snapshot.value.mastered ?? {}).length === 0,
)
const ctaLabel = computed(() => {
  if (isFirstUse.value) return 'Начать с 5 первых слов'
  return todayLearned.value > 0 ? 'Продолжить' : 'Начать сессию'
})
const goalDone = computed(() => todayLearned.value >= goal.value)
const nothingToday = computed(() => counts.value.due === 0 && counts.value.fresh === 0 && wordsInScopeTotal.value > 0)
const displayStats = computed(() => {
  const s = { ...sessionStats.value }
  const p = pending.value
  if (!p) return s
  s.answered += 1
  if (p.kind === 'grade' && p.grade) s[p.grade] += 1
  if (p.kind === 'memorized') {
    s.memorized += 1
    s.good += 1
  }
  if (p.kind === 'mastered') s.memorized += 1
  return s
})
const sessionCorrect = computed(() => displayStats.value.good + displayStats.value.easy + displayStats.value.memorized)
const sessionPct = computed(() =>
  displayStats.value.answered ? Math.round((sessionCorrect.value / displayStats.value.answered) * 100) : 0,
)

const scopeSubtitle = computed(() =>
  scope.value === 'selected'
    ? prefs.value.categoryScopeMode === 'custom'
      ? (prefs.value.customCategoryIds ?? []).length === 0
        ? 'Свой набор пуст — отметьте словари в «Словаре»'
        : `Свой набор: ${(prefs.value.customCategoryIds ?? []).length} словарей`
      : 'Словари с флагом «в обучении»'
    : props.activeCategoryId
      ? 'Только открытый в «Словаре» набор'
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

const schedForCur = computed(() => (cur.value ? (snapshot.value.words[String(cur.value.id)] ?? null) : null))
const youngCard = computed(() => isYoungCardSchedule(schedForCur.value))

function onMemorized() {
  const w = cur.value
  if (!w) return
  scheduleCommit({ wordId: w.id, kind: 'memorized' })
}

function onGrade(g: Grade) {
  const w = cur.value
  if (!w) return
  scheduleCommit({ wordId: w.id, kind: 'grade', grade: g })
}

function onMarkMasteredForever() {
  const w = cur.value
  if (!w) return
  scheduleCommit({ wordId: w.id, kind: 'mastered' })
}

</script>

<template>
  <div v-if="!queue" class="learn-view">
    <header class="page-head">
      <div>
        <h1>Учить</h1>
        <p class="page-sub">
          <span v-if="isFirstUse">Начните с первых слов Oxford — сессия из 5 карточек.</span>
          <span v-else-if="streak">Серия {{ streak }} дн.</span>
          <span v-else>Персональный словарь Oxford</span>
        </p>
      </div>
    </header>

    <div class="dash-hero dash-hero-single">
      <div class="dash-card dash-today dash-today-primary">
        <div class="learn-daily-ring-wrap">
          <DailyProgressRing :done="todayLearned" :goal="goal" />
          <div class="ring-center">{{ dailyPct }}%</div>
        </div>
        <div class="dash-today-copy">
          <div class="dash-today-title">
            <template v-if="isFirstUse">Сегодня: 5 первых слов, ~3 мин</template>
            <template v-else-if="goalDone && todayLearned > 0">Сегодняшняя цель выполнена</template>
            <template v-else-if="nothingToday">Сегодня учить нечего</template>
            <template v-else>Сегодня: {{ todayQueueSize }} карточек, ~{{ etaMin }} мин</template>
          </div>
          <div class="dash-today-nums">{{ todayLearned }} / {{ goal }} карточек</div>
          <p v-if="isFirstUse" class="muted small dash-today-remain">
            Короткая первая сессия, чтобы привыкнуть к карточкам.
          </p>
          <p v-else-if="!goalDone && !nothingToday" class="muted small dash-today-remain">
            К повторению {{ counts.due }}, новых можно взять {{ Math.min(counts.fresh, prefs.newPerSession) }}. Осталось {{ remain }}.
          </p>
          <p v-else-if="goalDone" class="muted small dash-today-remain">Можно остановиться или продолжить сверх цели.</p>
          <p v-else class="muted small dash-today-remain">Все слова в области уже в расписании на потом.</p>
          <button
            type="button"
            class="btn-primary dash-continue"
            :disabled="todayQueueSize === 0 || starting"
            @click="start(undefined, isFirstUse ? 5 : undefined)"
          >
            {{ starting ? 'Собираю очередь…' : ctaLabel }}
          </button>
        </div>
      </div>
    </div>

    <p class="muted small learn-dict-link">
      <button type="button" class="btn-quiet" @click="emit('navigate', 'dictionary')">Посмотреть весь словарь</button>
      · активны {{ activeCats.length }} из {{ categories.length }}
    </p>

    <div v-if="counts.total === 0 && wordsInScopeTotal > 0" class="panel learn-empty-scope" role="status">
      <p class="learn-empty-title">В очереди «Учить» пока нечего показывать</p>
      <p class="muted small">
        Все <strong>{{ wordsInScopeTotal }}</strong> слов в этой области помечены «выучил навсегда».
      </p>
    </div>

    <div v-if="wordsInScopeTotal === 0" class="panel learn-empty-scope" role="status">
      <p class="learn-empty-title">{{ isFirstUse ? 'Начните с словаря' : 'В этой области нет слов' }}</p>
      <p class="muted small">
        Отметьте словари «В обучении» или создайте свой список в разделе «Словари». Новый аккаунт уже видит набор Oxford по умолчанию — если список пуст, откройте «Словари» и включите нужные.
      </p>
      <button type="button" class="btn-primary" @click="emit('navigate', 'dictionary')">Открыть словари</button>
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

        <label class="learn-daily-goal-label">
          Цель на день
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
                void progress.updatePrefs({ dailyGoalWords: Math.max(5, Math.min(99, Math.floor(n))) })
              }
            "
          />
        </label>

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
        >
          <div class="learn-progress-value" :style="{ width: `${progressPct}%` }" />
        </div>
        <span class="muted small learn-progress-pct">{{ progressPct }}%</span>
      </div>

      <div v-if="done" class="panel learn-done-panel">
        <h3 class="learn-done-title">{{ goalDone ? 'Цель дня достигнута' : 'Отличная работа' }}</h3>
        <p class="learn-done-metric">{{ sessionPct }}% уверенных ответов</p>
        <p class="muted small">
          {{ displayStats.answered }} карточек · хорошо/легко {{ sessionCorrect }} · снова {{ displayStats.again }} ·
          сложно {{ displayStats.hard }}
        </p>
        <p class="muted small">Прогресс сохранён в CoreWords. Карточки вернутся по расписанию SRS.</p>
        <div class="learn-done-actions">
          <button type="button" class="btn-primary" @click="stop">Вернуться на главную</button>
          <button
            v-if="!goalDone && todayQueueSize > 0"
            type="button"
            class="btn-quiet"
            @click="start()"
          >
            Продолжить
          </button>
        </div>
      </div>

      <SessionStudyCard
        v-else-if="cur"
        :key="`${cur.id}-${idx}`"
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
        @open-grammar="emit('openGrammar', $event)"
      />
    </section>

    <div v-if="undoVisible" class="session-undo" role="status">
      <span>Оценка принята</span>
      <button type="button" class="btn-quiet" @click="undoLast">Отменить</button>
    </div>
  </div>
</template>
