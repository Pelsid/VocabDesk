<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { DEFAULT_PREFS } from '../lib/progressTypes'
import { SRS_PRESETS } from '../lib/srsPresets'
import { applyTheme, type ThemePref } from '../lib/theme'
import { useAuthStore } from '../stores/auth'
import { useProgressStore } from '../stores/progress'
import DataMenu from './DataMenu.vue'
import GroqUsageBadge from './GroqUsageBadge.vue'

const auth = useAuthStore()
const progress = useProgressStore()
const { snapshot } = storeToRefs(progress)
const prefs = computed(() => ({ ...DEFAULT_PREFS, ...snapshot.value.prefs }))

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
      <label class="profile-row">
        <span>Новых слов за сессию</span>
        <input
          type="number"
          min="5"
          max="120"
          class="profile-num"
          :value="prefs.newPerSession"
          @change="progress.updatePrefs({ newPerSession: Number(($event.target as HTMLInputElement).value), srsPresetId: null })"
        />
      </label>
      <label class="profile-row">
        <span>Повторений за сессию</span>
        <input
          type="number"
          min="20"
          max="400"
          class="profile-num"
          :value="prefs.reviewPerSession"
          @change="progress.updatePrefs({ reviewPerSession: Number(($event.target as HTMLInputElement).value), srsPresetId: null })"
        />
      </label>
      <div class="profile-block">
        <div class="muted small">Интенсивность</div>
        <label class="profile-radio">
          <input type="radio" name="srs" :checked="prefs.srsPresetId == null" @change="progress.updatePrefs({ srsPresetId: null })" />
          Вручную
        </label>
        <label v-for="p in SRS_PRESETS" :key="p.id" class="profile-radio">
          <input
            type="radio"
            name="srs"
            :checked="prefs.srsPresetId === p.id"
            @change="progress.updatePrefs({ ...p.prefs, srsPresetId: p.id })"
          />
          {{ p.label }}
        </label>
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
      <h2>Расширенные настройки</h2>
      <label class="profile-row">
        <span>Цель на день</span>
        <input
          type="number"
          min="5"
          max="99"
          class="profile-num"
          :value="prefs.dailyGoalWords"
          @change="progress.updatePrefs({ dailyGoalWords: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
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
      <p class="muted small">Удаление аккаунта уносит прогресс, настройки и личные словари. Общий каталог Oxford останется.</p>
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
