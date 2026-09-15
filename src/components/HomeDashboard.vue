<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { sessionDictScope } from '../lib/catalogScope'
import { DEFAULT_PREFS } from '../lib/progressTypes'
import { computeOxfordTotals, estimateAccuracy } from '../lib/dashboardPath'
import { allTimeTotal, monthWeekCounts, prevWeekTotal, weekCounts } from '../lib/activitySeries'
import { countDueSnapshot } from '../study/sessionQueue'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import { useProgressStore } from '../stores/progress'
import type { AppTab } from './AppSidebar.vue'
import DailyProgressRing from './DailyProgressRing.vue'
import ProgressDashboard from './ProgressDashboard.vue'
import QueueSettingsCard from './QueueSettingsCard.vue'

const emit = defineEmits<{
  navigate: [tab: AppTab]
  startLearn: []
}>()

const TIPS = [
  'Повторяй слова в контексте — так они запоминаются намного лучше.',
  'Короткие сессии каждый день сильнее длинной раз в неделю.',
  'Если слово никак не даётся — составь своё предложение с ним.',
]

const WEEK_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTH_LABELS = ['−3 нед.', '−2 нед.', '−1 нед.', 'Эта']

const auth = useAuthStore()
const catalog = useCatalogStore()
const progress = useProgressStore()
const { snapshot, revision, daily } = storeToRefs(progress)

type ActivityRange = 'week' | 'month' | 'all'
const activityRange = ref<ActivityRange>('week')
const recentReady = ref(false)

const prefs = computed(() => ({ ...DEFAULT_PREFS, ...snapshot.value.prefs }))
const displayName = computed(() => (prefs.value.displayName || auth.user?.displayName || '').trim())
const greeting = computed(() => (displayName.value ? `Привет, ${displayName.value}!` : 'Привет!'))
const goal = computed(() => Math.max(5, Math.min(99, prefs.value.dailyGoalWords || 15)))
const todayLearned = computed(() => daily.value.todayCount)
const streak = computed(() => daily.value.streak)

const scopePrefs = computed(() => ({
  categoryScopeMode: snapshot.value.prefs.categoryScopeMode ?? 'reword',
  customCategoryIds: snapshot.value.prefs.customCategoryIds ?? [],
}))

const scopeIds = computed(() => catalog.idsInScope(sessionDictScope(prefs.value), null, scopePrefs.value))
const counts = computed(() => {
  void revision.value
  return countDueSnapshot({ ids: scopeIds.value, snapshot: snapshot.value, now: Date.now() })
})

const newToday = computed(() => Math.min(counts.value.fresh, prefs.value.dailyGoalWords || prefs.value.newPerSession))
const reviewToday = computed(() => counts.value.dueReview)
const hardToday = computed(() => counts.value.dueHard)
const todayQueueSize = computed(() => counts.value.due + newToday.value)

const oxfordTotals = computed(() => {
  void revision.value
  return computeOxfordTotals(catalog.dictionaryWordIds, snapshot.value)
})
const oxfordPct = computed(() =>
  oxfordTotals.value.total ? Math.round((oxfordTotals.value.learned / oxfordTotals.value.total) * 100) : 0,
)
const accuracy = computed(() => {
  void revision.value
  return estimateAccuracy(snapshot.value)
})

const categories = computed(() => catalog.dictionaries)
const dictCount = computed(() => categories.value.length)

const tip = computed(() => TIPS[new Date().getDate() % TIPS.length])

const weekSeries = computed(() => weekCounts(daily.value.dayCounts))
const monthSeries = computed(() => monthWeekCounts(daily.value.dayCounts))
const weekSum = computed(() => weekSeries.value.reduce((a, n) => a + n, 0))
const prevSum = computed(() => prevWeekTotal(daily.value.dayCounts))
const weekDelta = computed(() => {
  if (prevSum.value <= 0) return weekSum.value > 0 ? 100 : 0
  return Math.round(((weekSum.value - prevSum.value) / prevSum.value) * 100)
})
const activityTotal = computed(() => {
  if (activityRange.value === 'month') return monthSeries.value.reduce((a, n) => a + n, 0)
  if (activityRange.value === 'all') return allTimeTotal(daily.value.dayCounts)
  return weekSum.value
})
const activityPeriodLabel = computed(() => {
  if (activityRange.value === 'month') return 'за 4 недели'
  if (activityRange.value === 'all') return 'всего'
  return 'за неделю'
})
const chartValues = computed(() => {
  if (activityRange.value === 'month') return monthSeries.value
  if (activityRange.value === 'all') return [allTimeTotal(daily.value.dayCounts)]
  return weekSeries.value
})
const chartLabels = computed(() => {
  if (activityRange.value === 'month') return MONTH_LABELS
  if (activityRange.value === 'all') return ['Всего']
  return WEEK_LABELS
})
const chartMax = computed(() => Math.max(1, ...chartValues.value))

const recentMeta = computed(() => {
  void revision.value
  return Object.entries(snapshot.value.words)
    .filter(([, s]) => s.lastReviewMs)
    .sort((a, b) => (b[1].lastReviewMs ?? 0) - (a[1].lastReviewMs ?? 0))
    .slice(0, 5)
    .map(([id, s]) => ({
      id: Number(id),
      bucket: s.bucket,
      label: s.bucket === 'new' || s.bucket === 'learning' ? 'новое' : 'повторение',
    }))
})

watch(
  recentMeta,
  async (rows) => {
    recentReady.value = false
    if (rows.length) await catalog.ensureWords(rows.map((r) => r.id))
    recentReady.value = true
  },
  { immediate: true },
)

const recentRows = computed(() => {
  void recentReady.value
  return recentMeta.value.map((r) => ({
    ...r,
    word: catalog.wordCache[r.id]?.word ?? `№${r.id}`,
    rus: catalog.wordCache[r.id]?.rus ?? '',
  }))
})

const ctaLabel = computed(() => {
  if (Object.keys(snapshot.value.words).length === 0) return 'Начать обучение'
  return todayLearned.value > 0 ? 'Продолжить обучение' : 'Начать обучение'
})
</script>

<template>
  <div class="home-dash">
    <header class="home-greet">
      <div>
        <h1>{{ greeting }}</h1>
        <p class="page-sub">Сегодня отличный день, чтобы выучить несколько новых слов 🚀</p>
      </div>
      <div class="home-greet-stats">
        <div class="home-chip">
          <span class="home-chip-ico" aria-hidden>🔥</span>
          <div>
            <strong>{{ streak }} дней</strong>
            <span>Не меняй серию, чтобы не сгореть</span>
          </div>
        </div>
        <div class="home-chip">
          <span class="home-chip-ico" aria-hidden>📅</span>
          <div>
            <strong>{{ todayLearned }}/{{ goal }} карточек</strong>
            <span>Сегодня</span>
          </div>
        </div>
      </div>
    </header>

    <div class="home-grid">
      <article class="home-hero">
        <div class="home-hero-copy">
          <div class="home-kicker">Сегодня</div>
          <div class="home-hero-num">{{ todayQueueSize }} карточек</div>
          <ul class="home-legend">
            <li><i class="dot dot-new" />{{ newToday }} новых</li>
            <li><i class="dot dot-rev" />{{ reviewToday }} повторений</li>
            <li><i class="dot dot-hard" />{{ hardToday }} сложных</li>
          </ul>
          <div class="home-hero-actions">
            <button type="button" class="btn-primary home-cta" :disabled="todayQueueSize === 0" @click="emit('startLearn')">
              ▶ {{ ctaLabel }} →
            </button>
          </div>
        </div>
      </article>

      <article class="dash-card home-progress-card">
        <div class="home-kicker">Твой прогресс</div>
        <div class="home-progress-main">
          <div class="home-progress-ring">
            <DailyProgressRing :done="oxfordTotals.learned" :goal="Math.max(1, oxfordTotals.total)" :size="132" :stroke="11" />
            <div class="ring-center home-ring-pct">{{ oxfordPct }}%</div>
          </div>
          <div>
            <div class="muted small">Изучено слов</div>
            <div class="home-progress-n">{{ oxfordTotals.learned.toLocaleString('ru-RU') }}</div>
            <div class="muted small">из {{ oxfordTotals.total.toLocaleString('ru-RU') }}</div>
          </div>
        </div>
        <div class="home-progress-foot">
          <div><span class="muted small">Сегодня</span><strong>{{ todayLearned }}</strong></div>
          <div><span class="muted small">Всего</span><strong>{{ oxfordTotals.learned.toLocaleString('ru-RU') }}</strong></div>
          <div><span class="muted small">Средняя точность</span><strong>{{ accuracy }}%</strong></div>
        </div>
      </article>

      <ProgressDashboard :categories="categories" :snapshot="snapshot" :revision="revision" />

      <section class="dash-card home-activity">
        <div class="home-activity-head">
          <h2>Активность</h2>
          <div class="home-seg home-activity-seg" aria-label="Период активности">
            <button type="button" :class="{ active: activityRange === 'week' }" :aria-pressed="activityRange === 'week'" @click="activityRange = 'week'">Неделя</button>
            <button type="button" :class="{ active: activityRange === 'month' }" :aria-pressed="activityRange === 'month'" @click="activityRange = 'month'">Месяц</button>
            <button type="button" :class="{ active: activityRange === 'all' }" :aria-pressed="activityRange === 'all'" @click="activityRange = 'all'">Всего</button>
          </div>
        </div>
        <div class="home-activity-body">
          <div class="home-bars" :style="{ '--n': chartValues.length }">
            <div v-for="(n, i) in chartValues" :key="chartLabels[i]" class="home-bar-col">
              <span class="home-bar-n">{{ n || '' }}</span>
              <div class="home-bar-track">
                <div class="home-bar" :class="{ on: n > 0 }" :style="{ height: `${Math.max(n ? 12 : 4, (n / chartMax) * 100)}%` }" />
              </div>
              <span class="muted small">{{ chartLabels[i] }}</span>
            </div>
          </div>
          <div class="home-activity-side">
            <p class="home-activity-stat">
              Слов изучено <strong>{{ activityTotal }}</strong> {{ activityPeriodLabel }}
            </p>
            <div
              v-if="activityRange === 'week'"
              class="home-delta"
              :class="{ down: weekDelta < 0 }"
              title="К прошлой неделе"
            >
              {{ weekDelta >= 0 ? '+' : '' }}{{ weekDelta }}%
            </div>
          </div>
        </div>
      </section>

      <section class="dash-card home-queue">
        <QueueSettingsCard />
      </section>

      <section class="dash-card home-recent">
        <div class="section-head">
          <h2>Последние слова</h2>
          <button type="button" class="btn-quiet" @click="emit('navigate', 'learned')">Посмотреть все</button>
        </div>
        <p v-if="recentRows.length === 0" class="muted small">Пока нет оценённых карточек.</p>
        <ul v-else class="home-recent-list">
          <li v-for="row in recentRows" :key="row.id">
            <span>
              <strong>{{ row.word }}</strong>
              <span class="muted small">{{ row.rus }}</span>
            </span>
            <span class="home-recent-tag">{{ row.label }}</span>
          </li>
        </ul>
      </section>

      <section class="dash-card home-quick">
        <h2>Быстрый доступ</h2>
        <div class="quick-grid home-quick-grid">
          <button type="button" class="quick-card" @click="emit('navigate', 'dictionary')">
            <span class="quick-ico purple" aria-hidden>📘</span>
            <span class="quick-title">Словари</span>
            <span class="muted small">{{ dictCount }} наборов</span>
          </button>
          <button type="button" class="quick-card" @click="emit('navigate', 'repeat')">
            <span class="quick-ico violet" aria-hidden>↺</span>
            <span class="quick-title">Повторение</span>
            <span class="muted small">{{ counts.due.toLocaleString('ru-RU') }} карточек</span>
          </button>
          <button type="button" class="quick-card" @click="emit('navigate', 'learned')">
            <span class="quick-ico green" aria-hidden>✓</span>
            <span class="quick-title">Изученное</span>
            <span class="muted small">{{ oxfordTotals.learned.toLocaleString('ru-RU') }} слов</span>
          </button>
          <button type="button" class="quick-card" @click="emit('navigate', 'newWords')">
            <span class="quick-ico orange" aria-hidden>★</span>
            <span class="quick-title">Новое</span>
            <span class="muted small">{{ counts.fresh.toLocaleString('ru-RU') }} слов</span>
          </button>
        </div>
      </section>

      <article class="dash-card home-advice">
        <div class="home-kicker">💡 Совет дня</div>
        <p>{{ tip }}</p>
      </article>
    </div>
  </div>
</template>
