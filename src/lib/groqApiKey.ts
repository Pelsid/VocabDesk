/** Ключ Groq: сначала localStorage (окно «Данные»), иначе VITE_GROQ_API_KEY из .env. */

import { computed, onMounted, onUnmounted, ref } from 'vue'

const LS_KEY = 'vocabdesk-groq-api-key'
export const GROQ_API_KEY_EVENT = 'vocabdesk-groq-api-key'

function envGroqApiKey(): string {
  return (import.meta.env.VITE_GROQ_API_KEY as string | undefined)?.trim() ?? ''
}

/** Только то, что пользователь сохранил в браузере (без fallback на .env). */
export function getStoredGroqApiKey(): string {
  try {
    return localStorage.getItem(LS_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function getGroqApiKey(): string {
  return getStoredGroqApiKey() || envGroqApiKey()
}

export function hasGroqApiKey(): boolean {
  return Boolean(getGroqApiKey())
}

export function setGroqApiKey(key: string): void {
  const trimmed = key.trim()
  try {
    if (trimmed) localStorage.setItem(LS_KEY, trimmed)
    else localStorage.removeItem(LS_KEY)
  } catch {
    /* квота / приватный режим */
  }
  window.dispatchEvent(new CustomEvent(GROQ_API_KEY_EVENT))
}

export function clearGroqApiKey(): void {
  setGroqApiKey('')
}

export function useGroqApiKey() {
  const apiKey = ref(getGroqApiKey())
  const hasKey = computed(() => Boolean(apiKey.value))

  function refresh() {
    apiKey.value = getGroqApiKey()
  }

  onMounted(() => {
    window.addEventListener(GROQ_API_KEY_EVENT, refresh)
  })
  onUnmounted(() => {
    window.removeEventListener(GROQ_API_KEY_EVENT, refresh)
  })

  return { apiKey, hasKey }
}
