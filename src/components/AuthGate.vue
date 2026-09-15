<script setup lang="ts">
import { ref } from 'vue'
import { APP_DISPLAY_NAME, APP_LOGO_SRC } from '../lib/brand'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

type Mode = 'login' | 'register'
const mode = ref<Mode>('login')
const email = ref('')
const password = ref('')
const displayName = ref('')
const fieldError = ref<{ email?: string; password?: string }>({})

function validate(): boolean {
  fieldError.value = {}
  const e = email.value.trim()
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    fieldError.value.email = 'Укажите корректный email'
  }
  if (password.value.length < 8) {
    fieldError.value.password = 'Пароль — минимум 8 символов'
  } else if (password.value.length > 200) {
    fieldError.value.password = 'Пароль слишком длинный'
  } else if (e && password.value.toLowerCase() === e.toLowerCase()) {
    fieldError.value.password = 'Пароль не должен совпадать с email'
  }
  return !fieldError.value.email && !fieldError.value.password
}

async function submit() {
  if (auth.busy || !validate()) return
  try {
    if (mode.value === 'login') {
      await auth.login(email.value.trim(), password.value)
    } else {
      await auth.register(email.value.trim(), password.value, displayName.value.trim())
    }
  } catch {
    /* текст в auth.error */
  }
}

function switchMode(next: Mode) {
  mode.value = next
  auth.error = null
  fieldError.value = {}
}
</script>

<template>
  <div class="upload-screen auth-gate">
    <div class="upload-card auth-card">
      <div class="brand">
        <img class="brand-mark" :src="APP_LOGO_SRC" alt="" />
        <div>
          <h1>{{ APP_DISPLAY_NAME }}</h1>
        </div>
      </div>

      <div class="auth-layout">
        <div class="auth-copy">
          <p>
            CoreWords — это тренажёр для пополнения словарного запаса и закрепления изученных слов.
          </p>
          <p>
            В основе — Oxford 6000: около шести тысяч самых частотных слов английского языка, разбитых по
            уровням. Рядом — тематические словари; многие слова в них пересекаются с Oxford. Свои списки тоже
            можно собрать. Все наборы — в разделе «Словари».
          </p>
          <p>
            Слова возвращаются по расписанию повторений: сложные чаще, знакомые реже. Темп и параметры сессии
            настраиваются в профиле.
          </p>
          <p>
            Есть справочник грамматики A1–B2 — правила и примеры, без тестов. Для разговорной практики можно
            включить чат с AI; карточки работают и без него.
          </p>
        </div>

        <div class="auth-panel">
          <div class="home-seg auth-seg">
            <button type="button" :class="{ active: mode === 'login' }" @click="switchMode('login')">Вход</button>
            <button type="button" :class="{ active: mode === 'register' }" @click="switchMode('register')">
              Регистрация
            </button>
          </div>

          <form class="auth-form" @submit.prevent="submit">
            <label class="field">
              <span class="field-label">Email</span>
              <input v-model="email" type="email" autocomplete="username" required maxlength="190" />
              <span v-if="fieldError.email" class="auth-field-err">{{ fieldError.email }}</span>
            </label>
            <label v-if="mode === 'register'" class="field">
              <span class="field-label">Имя <span class="muted">(необязательно)</span></span>
              <input
                v-model="displayName"
                type="text"
                autocomplete="nickname"
                maxlength="40"
                placeholder="Как к вам обращаться"
              />
            </label>
            <label class="field">
              <span class="field-label">Пароль</span>
              <input
                v-model="password"
                type="password"
                :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                required
                minlength="8"
                maxlength="200"
              />
              <span v-if="fieldError.password" class="auth-field-err">{{ fieldError.password }}</span>
            </label>
            <p v-if="auth.error" class="alert">{{ auth.error }}</p>
            <button type="submit" class="btn-primary auth-submit" :disabled="auth.busy">
              {{ auth.busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
