<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { sessionDictScope } from '../lib/catalogScope'
import { DEFAULT_PREFS } from '../lib/progressTypes'
import {
  clampDailyGoal,
  clampReviews,
  GOAL_MAX,
  GOAL_MIN,
  prefsFromSrsPreset,
  REVIEW_MAX,
  REVIEW_MIN,
  SRS_PRESETS,
} from '../lib/srsPresets'
import { useProgressStore } from '../stores/progress'

const progress = useProgressStore()
const { snapshot } = storeToRefs(progress)
const prefs = computed(() => ({ ...DEFAULT_PREFS, ...snapshot.value.prefs }))
const goal = computed(() => clampDailyGoal(prefs.value.dailyGoalWords || GOAL_MIN))
const reviews = computed(() => clampReviews(prefs.value.reviewPerSession || REVIEW_MIN))
const dictScope = computed(() => sessionDictScope(prefs.value))
const activePreset = computed(() => SRS_PRESETS.find((p) => p.id === prefs.value.srsPresetId) ?? null)
const modeHint = computed(() =>
  activePreset.value?.description ?? 'Задайте цель и число повторов вручную.',
)
const scopeOpen = ref(false)
const scopeRoot = ref<HTMLElement | null>(null)

function closeScope() {
  scopeOpen.value = false
}

function onDocPointer(e: Event) {
  const t = e.target
  if (!(t instanceof Node)) return
  if (scopeRoot.value && !scopeRoot.value.contains(t)) closeScope()
}

onMounted(() => document.addEventListener('pointerdown', onDocPointer))
onUnmounted(() => document.removeEventListener('pointerdown', onDocPointer))

function setDictScope(next: 'all' | 'selected') {
  closeScope()
  void progress.updatePrefs({ sessionDictScope: next })
}

function setDailyGoal(n: number) {
  const v = clampDailyGoal(n)
  void progress.updatePrefs({ dailyGoalWords: v, newPerSession: v, srsPresetId: null })
}

function setReviews(n: number) {
  void progress.updatePrefs({
    reviewPerSession: clampReviews(n),
    srsPresetId: null,
  })
}
</script>

<template>
  <div class="session-settings">
    <div class="session-settings-head">
      <div class="session-settings-brand">
        <span class="session-settings-ico" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M4 7h10M4 12h16M4 17h8" stroke-linecap="round" />
            <circle cx="17" cy="7" r="2.2" />
            <circle cx="20" cy="17" r="2.2" />
          </svg>
        </span>
        <div>
          <h2 class="session-settings-title">Настройка сессии</h2>
          <p class="session-settings-sub">Выберите режим обучения и укажите параметры</p>
        </div>
      </div>

      <div ref="scopeRoot" class="session-scope">
        <button type="button" class="session-scope-btn" :aria-expanded="scopeOpen" @click="scopeOpen = !scopeOpen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden>
            <path d="M5 5.5h11.5a2 2 0 0 1 2 2V19l-3.2-1.6H7a2 2 0 0 1-2-2V5.5Z" stroke-linejoin="round" />
            <path d="M8 9h8M8 12.5h5" stroke-linecap="round" />
          </svg>
          {{ dictScope === 'all' ? 'Все словари' : 'Выбранные' }}
        </button>
        <div v-if="scopeOpen" class="session-scope-menu" role="listbox">
          <button type="button" role="option" :aria-selected="dictScope === 'selected'" :class="{ active: dictScope === 'selected' }" @click="setDictScope('selected')">
            Выбранные
          </button>
          <button type="button" role="option" :aria-selected="dictScope === 'all'" :class="{ active: dictScope === 'all' }" @click="setDictScope('all')">
            Все словари
          </button>
        </div>
      </div>
    </div>

    <section class="session-modes" aria-label="Режим обучения">
      <div class="session-block-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden>
          <path d="M4 12a8 8 0 1 0 2.3-5.6" stroke-linecap="round" />
          <path d="M4 5.5v4h4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Режим обучения
      </div>
      <div class="session-mode-grid">
        <button
          v-for="p in SRS_PRESETS"
          :key="p.id"
          type="button"
          class="session-mode"
          :class="[`tone-${p.id}`, { active: prefs.srsPresetId === p.id }]"
          :title="p.description"
          @click="progress.updatePrefs(prefsFromSrsPreset(p, prefs.srsPresetOverrides))"
        >
          <span class="session-mode-check" v-if="prefs.srsPresetId === p.id" aria-hidden>✓</span>
          <span class="session-mode-ico" aria-hidden>
            <svg v-if="p.id === 'calm_b1'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M5 14.5c4.5-1 7-4.8 8-9 5 1.5 7.5 6 7.5 10.2A8.2 8.2 0 0 1 12.5 21C8 21 5 18 5 14.5Z" stroke-linejoin="round" />
              <path d="M11 21c.4-3 2-6.5 5.5-9" stroke-linecap="round" />
            </svg>
            <svg v-else-if="p.id === 'steady_b2'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3 14c2.4-2.2 4.6-2.2 7 0s4.6 2.2 7 0 4.6-2.2 7 0" stroke-linecap="round" />
              <path d="M3 18c2.4-2.2 4.6-2.2 7 0s4.6 2.2 7 0 4.6-2.2 7 0" stroke-linecap="round" />
            </svg>
            <svg v-else-if="p.id === 'intensive'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M12 3s1.6 3.2.4 5.4c-.8 1.4-2.4 2.2-2.4 4.2 0 2.4 2 4.4 4.4 4.4s4.2-2 4.2-4.6c0-3.5-2.4-5.2-2.8-7.4C15.4 3.6 12 3 12 3Z" stroke-linejoin="round" />
              <path d="M10.2 14.2c.2-1.6 1.2-2.6 2.2-3.4" stroke-linecap="round" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M20 7.5A8 8 0 1 0 20 16" stroke-linecap="round" />
              <path d="M20 3.5v4h-4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          {{ p.label }}
        </button>
        <button
          type="button"
          class="session-mode session-mode-manual"
          :class="{ active: prefs.srsPresetId == null }"
          @click="progress.updatePrefs({ srsPresetId: null })"
        >
          <span class="session-mode-check" v-if="prefs.srsPresetId == null" aria-hidden>✓</span>
          <span class="session-mode-ico tone-hand" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M8.5 11V6.2a1.2 1.2 0 0 1 2.4 0V11M10.9 10.2V5.8a1.2 1.2 0 1 1 2.4 0V11M13.3 10.4V7.2a1.2 1.2 0 1 1 2.4 0V12M15.7 12.2v-2a1.2 1.2 0 1 1 2.4 0v4.4c0 2.6-1.8 5.4-5.6 5.4-2.9 0-5.4-1.6-5.4-4.7V11" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          Вручную
        </button>
      </div>
      <p class="session-mode-hint">{{ modeHint }}</p>
    </section>

    <div class="session-params">
      <section class="session-param">
        <div class="session-param-label">
          <span class="session-param-ico" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="8.2" />
              <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
            </svg>
          </span>
          Цель на день
        </div>
        <div class="session-stepper">
          <button type="button" :disabled="goal <= GOAL_MIN" aria-label="Уменьшить цель" @click="setDailyGoal(goal - 1)">−</button>
          <div class="session-goal-value">
            <strong>{{ goal }}</strong>
            <span>слов</span>
          </div>
          <button type="button" :disabled="goal >= GOAL_MAX" aria-label="Увеличить цель" @click="setDailyGoal(goal + 1)">+</button>
        </div>
      </section>

      <section class="session-param">
        <div class="session-param-label">
          <span class="session-param-ico" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M20 7.5A8 8 0 1 0 20 16" stroke-linecap="round" />
              <path d="M20 3.5v4h-4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          Повторений за сессию
        </div>
        <div class="session-stepper">
          <button type="button" :disabled="reviews <= REVIEW_MIN" aria-label="Уменьшить повторы" @click="setReviews(reviews - 1)">−</button>
          <div class="session-goal-value">
            <strong>{{ reviews }}</strong>
            <span>повторов</span>
          </div>
          <button type="button" :disabled="reviews >= REVIEW_MAX" aria-label="Увеличить повторы" @click="setReviews(reviews + 1)">+</button>
        </div>
      </section>
    </div>
  </div>
</template>
