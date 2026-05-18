<script setup lang="ts">
import type { Database } from 'sql.js'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchWordsByIds, listCategoryStats, listWordIdsInScope, type WordRow } from '../db/rewordDb'
import { DEFAULT_PREFS, type CardSchedule, type CategoryScopePrefs, type Grade } from '../lib/progressTypes'
import { SRS_PRESETS } from '../lib/srsPresets'
import { buildSessionQueue, countDueSnapshot } from '../study/sessionQueue'
import { bumpDailyLearned, getDailyLearnedCount } from '../lib/dailyLearned'
import { useProgressStore } from '../stores/progress'
import { storeToRefs } from 'pinia'
import ProgressDashboard from './ProgressDashboard.vue'
import DailyProgressRing from './DailyProgressRing.vue'
import SessionStudyCard from './SessionStudyCard.vue'

const props = defineProps<{
  db: Database
  activeCategoryId: string | null
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

function start() {
  const cid = scope.value === 'category' ? props.activeCategoryId : null
  const ids = buildSessionQueue({
    db: props.db,
    scope: scope.value,
    categoryId: cid,
    snapshot: snapshot.value,
    now: Date.now(),
  })
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

onMounted(() => window.addEventListener('keydown', onKeyEscape))
onUnmounted(() => window.removeEventListener('keydown', onKeyEscape))

const prefs = computed(() => ({ ...DEFAULT_PREFS, ...snapshot.value.prefs }))

const goal = computed(() => Math.max(5, Math.min(99, prefs.value.dailyGoalWords || 15)))

const scopeSubtitle = computed(() =>
  scope.value === 'selected'
    ? prefs.value.categoryScopeMode === 'custom'
      ? (prefs.value.customCategoryIds ?? []).length === 0
        ? 'Свой набор пуст — отметьте словари на вкладке «Словарь» или верните режим как в Reword'
        : `Свой набор: ${(prefs.value.customCategoryIds ?? []).length} словарей (галочки в списке словарей)`
      : 'Все словари с флагом «в обучении» из бэкапа'
    : props.activeCategoryId
      ? 'Только открытый во вкладке «Словарь» словарь'
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
  <div v-if="!queue" class="dictionary learn-view">
    <section class="section">
      <div class="section-head">
        <h2>Учить</h2>
        <span class="muted small"> Сегодня: {{ todayLearned }} / {{ goal }} </span>
      </div>
      <p class="muted small browse-hint">
        Одна сессия смешивает просроченные повторения, карточки в обучении и новые слова — в пределах лимитов ниже. После
        ответа оценка (или «Выучил навсегда») сохраняется только в этом браузере.
      </p>

      <ProgressDashboard
        :db="db"
        :categories="categories"
        :snapshot="snapshot"
        :revision="revision"
        :counts="counts"
        :words-in-scope-total="wordsInScopeTotal"
      />

      <div v-if="counts.total === 0 && wordsInScopeTotal > 0" class="panel learn-empty-scope" role="status">
        <p class="learn-empty-title">В очереди «Учить» пока нечего показывать</p>
        <p class="muted small">
          Все <strong>{{ wordsInScopeTotal }}</strong> слов в этой области помечены «выучил навсегда» — в смешанной сессии
          больше нечего показывать. Слова остаются в словаре и во вкладке «Изученное».
        </p>
        <p class="muted small">
          Чтобы снова повторять слова: сбросьте локальный прогресс или импортируйте прогресс заново — меню «Данные» в
          правом верхнем углу (или отредактируйте JSON прогресса и уберите лишние id из поля
          <code class="learn-code">mastered</code>).
        </p>
      </div>

      <div v-if="wordsInScopeTotal === 0" class="panel learn-empty-scope" role="status">
        <p class="learn-empty-title">В этой области нет слов</p>
        <p class="muted small">Выберите «Все выбранные» или откройте набор в «Словаре» и включите «текущий словарь».</p>
      </div>

      <div class="learn-landing-grid">
        <div class="learn-landing-col">
          <div class="learn-week-strip" aria-hidden>
            <span
              v-for="(abbr, i) in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']"
              :key="abbr"
              class="learn-wday"
              :class="{ active: i === (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1) }"
            >
              {{ abbr }}
            </span>
          </div>

          <div class="panel learn-daily-panel">
            <div class="learn-daily-panel-inner">
              <div class="learn-daily-ring-wrap">
                <DailyProgressRing :done="todayLearned" :goal="goal" />
              </div>
              <div class="learn-daily-copy">
                <div class="learn-daily-title">Выучено сегодня</div>
                <div class="learn-daily-stats-row">
                  <span class="learn-daily-big">{{ todayLearned }}</span>
                  <span class="learn-daily-slash">/</span>
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
                </div>
                <p class="muted small learn-daily-hint">Каждая оценённая карточка увеличивает счётчик. Цель можно править числом справа.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="learn-landing-col">
          <div class="browse-scope">
            <span class="field-label">Область</span>
            <div class="learn-scope-switch">
              <button type="button" :class="{ active: scope === 'selected' }" @click="scope = 'selected'">Все выбранные</button>
              <button type="button" :class="{ active: scope === 'category' }" :disabled="!activeCategoryId" @click="scope = 'category'">
                Текущий словарь
              </button>
            </div>
            <p class="muted small browse-scope-note">{{ scopeSubtitle }}</p>
          </div>

          <div class="panel learn-queue-summary">
            <span class="field-label">Очередь сессии</span>
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
              <li>
                <span class="muted">Активных слов в области (без «навсегда»)</span>
                <strong>{{ counts.total }}</strong>
              </li>
            </ul>
          </div>

          <details class="panel learn-advanced-panel">
            <summary class="learn-advanced-summary">Лимиты SRS (дополнительно)</summary>
            <div class="learn-advanced-body">
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

          <button type="button" class="btn-primary learn-start-btn" :disabled="counts.total === 0" @click="start">Начать сессию</button>
        </div>
      </div>
    </section>
  </div>

  <div v-else class="dictionary learn-view learn-session-active">
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
