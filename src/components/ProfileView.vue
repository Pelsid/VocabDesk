<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { DEFAULT_PREFS, type CardPromptLang, type IntervalUnit, type SrsPresetLoad } from '../lib/progressTypes'
import {
  clampDailyGoal,
  clampReviews,
  GOAL_MAX,
  GOAL_MIN,
  normalizeSrsPresetOverrides,
  prefsFromSrsPreset,
  resolvedPresetLoad,
  REVIEW_MAX,
  REVIEW_MIN,
  SRS_PRESETS,
} from '../lib/srsPresets'
import {
  GRADE_INTERVAL_ROWS,
  INTERVAL_UNITS,
  PROMPT_OPTIONS,
  normalizeGradeInterval,
} from '../lib/studyPrefs'
import { applyTheme, type ThemePref } from '../lib/theme'
import { useAuthStore } from '../stores/auth'
import { useProgressStore } from '../stores/progress'
import DataMenu from './DataMenu.vue'
import GroqUsageBadge from './GroqUsageBadge.vue'

const auth = useAuthStore()
const progress = useProgressStore()
const { snapshot } = storeToRefs(progress)
const prefs = computed(() => ({ ...DEFAULT_PREFS, ...snapshot.value.prefs }))

function presetLoad(id: string): SrsPresetLoad {
  const p = SRS_PRESETS.find((x) => x.id === id)
  if (!p) return { newPerSession: GOAL_MIN, reviewPerSession: REVIEW_MIN }
  return resolvedPresetLoad(p, prefs.value.srsPresetOverrides)
}

function setPresetField(id: string, field: keyof SrsPresetLoad, raw: number) {
  const p = SRS_PRESETS.find((x) => x.id === id)
  if (!p) return
  const current = resolvedPresetLoad(p, prefs.value.srsPresetOverrides)
  const nextLoad: SrsPresetLoad = {
    ...current,
    [field]: field === 'newPerSession' ? clampDailyGoal(raw) : clampReviews(raw),
  }
  const overrides = { ...normalizeSrsPresetOverrides(prefs.value.srsPresetOverrides), [id]: nextLoad }
  const patch = prefs.value.srsPresetId === id ? { ...prefsFromSrsPreset(p, overrides), srsPresetOverrides: overrides } : { srsPresetOverrides: overrides }
  void progress.updatePrefs(patch)
}

function setGradeInterval(key: (typeof GRADE_INTERVAL_ROWS)[number]['key'], patch: { value?: number; unit?: IntervalUnit }) {
  const fallback = DEFAULT_PREFS[key]
  const next = normalizeGradeInterval({ ...prefs.value[key], ...patch }, fallback)
  const extra = key === 'gradeEasyInterval' && next.unit === 'day' ? { easyIntervalDays: next.value } : {}
  void progress.updatePrefs({ [key]: next, ...extra })
}

function setPrompt(field: 'newWordPrompt' | 'reviewWordPrompt', value: CardPromptLang) {
  void progress.updatePrefs({ [field]: value })
}

const currentPassword = ref('')
const newPassword = ref('')
const deletePassword = ref('')
const accountMsg = ref<string | null>(null)
const accountErr = ref<string | null>(null)

function setTheme(theme: ThemePref) {
  applyTheme(theme)
  void progress.updatePrefs({ theme })
}

async function saveDisplayName(value: string) {
  await progress.updatePrefs({ displayName: value })
  auth.patchUser({ displayName: value.trim().slice(0, 40) })
}

async function changePassword() {
  accountErr.value = null
  accountMsg.value = null
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    accountMsg.value = 'Пароль изменён. Остальные устройства вышли.'
  } catch (e) {
    accountErr.value = e instanceof Error ? e.message : String(e)
  }
}

async function removeAccount() {
  if (!confirm('Удалить аккаунт и весь прогресс безвозвратно?')) return
  accountErr.value = null
  try {
    await auth.deleteAccount(deletePassword.value)
  } catch (e) {
    accountErr.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div class="profile-view">
    <header class="page-head">
      <div>
        <h1>Настройки</h1>
        <p class="page-sub">Обучение, оформление и данные аккаунта.</p>
      </div>
    </header>

    <section class="dash-card profile-card">
      <h2>Обучение</h2>
      <p class="muted small">Цель и повторы для режимов на экране «Учить». Выбор режима — там же.</p>
      <div v-for="p in SRS_PRESETS" :key="p.id" class="profile-preset">
        <div class="profile-preset-name">{{ p.label }}</div>
        <label class="profile-preset-field">
          <span>Слов в день</span>
          <input
            type="number"
            class="profile-num"
            :min="GOAL_MIN"
            :max="GOAL_MAX"
            :value="presetLoad(p.id).newPerSession"
            @change="setPresetField(p.id, 'newPerSession', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <label class="profile-preset-field">
          <span>Повторений</span>
          <input
            type="number"
            class="profile-num"
            :min="REVIEW_MIN"
            :max="REVIEW_MAX"
            :value="presetLoad(p.id).reviewPerSession"
            @change="setPresetField(p.id, 'reviewPerSession', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>
    </section>

    <section class="dash-card profile-card">
      <h2>Карточка</h2>
      <p class="muted small">Интервалы кнопок оценки, язык лица карточки и картинки.</p>

      <div class="profile-subhead">Интервал у кнопок</div>
      <div v-for="row in GRADE_INTERVAL_ROWS" :key="row.key" class="profile-interval">
        <div class="profile-preset-name">{{ row.label }}</div>
        <input
          type="number"
          class="profile-num"
          min="1"
          max="999"
          :value="prefs[row.key].value"
          @change="setGradeInterval(row.key, { value: Number(($event.target as HTMLInputElement).value) })"
        />
        <div class="home-seg">
          <button
            v-for="u in INTERVAL_UNITS"
            :key="u.id"
            type="button"
            :class="{ active: prefs[row.key].unit === u.id }"
            @click="setGradeInterval(row.key, { unit: u.id })"
          >
            {{ u.label }}
          </button>
        </div>
      </div>

      <div class="profile-subhead">Настройка изучения новых слов</div>
      <div class="profile-choice">
        <button
          v-for="opt in PROMPT_OPTIONS"
          :key="'new-' + opt.id"
          type="button"
          :class="{ active: prefs.newWordPrompt === opt.id }"
          @click="setPrompt('newWordPrompt', opt.id)"
        >
          {{ opt.label }}
        </button>
      </div>

      <div class="profile-subhead">Настройка повторения слов</div>
      <div class="profile-choice">
        <button
          v-for="opt in PROMPT_OPTIONS"
          :key="'rev-' + opt.id"
          type="button"
          :class="{ active: prefs.reviewWordPrompt === opt.id }"
          @click="setPrompt('reviewWordPrompt', opt.id)"
        >
          {{ opt.label }}
        </button>
      </div>

      <div class="profile-subhead">Показывать картинки?</div>
      <div class="home-seg">
        <button type="button" :class="{ active: prefs.showPictures }" @click="progress.updatePrefs({ showPictures: true })">
          Отображать
        </button>
        <button type="button" :class="{ active: !prefs.showPictures }" @click="progress.updatePrefs({ showPictures: false })">
          Скрыть
        </button>
      </div>
    </section>

    <section class="dash-card profile-card">
      <h2>Аккаунт</h2>
      <div class="profile-row">
        <span>Email</span>
        <strong>{{ auth.user?.email ?? '—' }}</strong>
      </div>
      <label class="profile-row">
        <span>Имя в приветствии</span>
        <input
          class="profile-text"
          maxlength="40"
          :value="prefs.displayName || auth.user?.displayName || ''"
          placeholder="Максим"
          @change="saveDisplayName(($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="profile-row">
        <span>Текущий пароль</span>
        <input v-model="currentPassword" class="profile-text" type="password" autocomplete="current-password" />
      </label>
      <label class="profile-row">
        <span>Новый пароль</span>
        <input v-model="newPassword" class="profile-text" type="password" autocomplete="new-password" />
      </label>
      <div class="row-btns">
        <button type="button" class="btn-primary" :disabled="auth.busy || newPassword.length < 8" @click="changePassword">
          Сменить пароль
        </button>
        <button type="button" class="btn-quiet" :disabled="auth.busy" @click="auth.logout(false)">Выйти</button>
        <button type="button" class="btn-quiet" :disabled="auth.busy" @click="auth.logout(true)">Выйти на всех устройствах</button>
      </div>
      <p v-if="accountMsg" class="muted small">{{ accountMsg }}</p>
      <p v-if="accountErr" class="alert">{{ accountErr }}</p>
    </section>

    <section class="dash-card profile-card">
      <h2>Приложение</h2>
      <div class="profile-row">
        <span>Тема</span>
        <div class="home-seg">
          <button type="button" :class="{ active: prefs.theme !== 'light' }" @click="setTheme('dark')">Тёмная</button>
          <button type="button" :class="{ active: prefs.theme === 'light' }" @click="setTheme('light')">Светлая</button>
        </div>
      </div>
      <div class="profile-row">
        <span>Язык интерфейса</span>
        <strong>Русский</strong>
      </div>
      <label class="profile-row">
        <span>Уведомления</span>
        <input
          type="checkbox"
          class="profile-switch"
          :checked="prefs.notificationsEnabled"
          @change="progress.updatePrefs({ notificationsEnabled: ($event.target as HTMLInputElement).checked })"
        />
      </label>
    </section>

    <section class="dash-card profile-card">
      <h2>Данные и AI</h2>
      <GroqUsageBadge />
      <DataMenu />
    </section>

    <section class="dash-card profile-card danger-zone">
      <h2>Опасная зона</h2>
      <p class="muted small">Удаление аккаунта уносит прогресс, настройки и личные словари. Общий каталог останется.</p>
      <label class="profile-row">
        <span>Пароль для удаления</span>
        <input v-model="deletePassword" class="profile-text" type="password" autocomplete="off" />
      </label>
      <button type="button" class="btn-danger" :disabled="auth.busy || !deletePassword" @click="removeAccount">
        Удалить аккаунт
      </button>
    </section>
  </div>
</template>
