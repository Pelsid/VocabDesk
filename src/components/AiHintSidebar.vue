<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  fetchStudyHintFromGroq,
  GROQ_MODEL_DEFAULT,
  type StudyHintPayload,
} from '../lib/groqStudyHint'

type StudyInteractionMode = 'type' | 'reveal' | 'choice' | 'cloze'

const props = defineProps<{
  wordId: number
  lemma: string
  ipa: string | null
  mode: StudyInteractionMode
  exampleEnglishLines: string[]
}>()

function pixabaySearchUrl(query: string): string {
  const q = query.trim() || 'english'
  return `https://pixabay.com/images/search/${encodeURIComponent(q)}/`
}

const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined
const hasKey = computed(() => Boolean(apiKey?.trim()))
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

function upOnline() {
  online.value = navigator.onLine
}

const hint = ref<StudyHintPayload | null>(null)
const loading = ref(false)
const err = ref<string | null>(null)

watch([() => props.wordId, () => props.mode], () => {
  hint.value = null
  err.value = null
  loading.value = false
})

onMounted(() => {
  window.addEventListener('online', upOnline)
  window.addEventListener('offline', upOnline)
})
onUnmounted(() => {
  window.removeEventListener('online', upOnline)
  window.removeEventListener('offline', upOnline)
})

async function load() {
  const key = apiKey?.trim()
  if (!key) return
  loading.value = true
  err.value = null
  try {
    hint.value = await fetchStudyHintFromGroq({
      apiKey: key,
      model: GROQ_MODEL_DEFAULT,
      lemma: props.lemma,
      ipa: props.ipa,
      studyInteractionMode: props.mode === 'cloze' ? 'type' : props.mode,
      exampleEnglishLines: props.exampleEnglishLines,
    })
  } catch (e) {
    hint.value = null
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const disabled = computed(() => !hasKey.value || !online.value || loading.value)

const disabledReason = computed(() => {
  if (!hasKey.value) return 'Добавьте VITE_GROQ_API_KEY в .env.local и перезапустите dev-сервер.'
  if (!online.value) return 'Нет сети — подсказка недоступна.'
  return ''
})
</script>

<template>
  <aside class="ai-hint-sidebar panel learn-hint-aside" aria-label="Подсказка ИИ">
    <div class="ai-hint-head">
      <span class="ai-hint-title">Подсказка ИИ</span>
      <span class="ai-hint-model muted small">{{ GROQ_MODEL_DEFAULT }}</span>
    </div>

    <button
      type="button"
      class="btn-primary ai-hint-load"
      :disabled="disabled"
      :title="disabled ? disabledReason : 'Запросить подсказку у Groq'"
      @click="load()"
    >
      {{ loading ? 'Загрузка…' : 'Запросить подсказку' }}
    </button>
    <p v-if="!hasKey" class="muted small ai-hint-warn">{{ disabledReason }}</p>
    <p v-if="!online && hasKey" class="muted small ai-hint-warn">{{ disabledReason }}</p>

    <div v-if="err" class="ai-hint-error" role="alert">{{ err }}</div>

    <p v-if="!hint && !loading && !err" class="muted small ai-hint-idle">
      По кнопке — краткий смысл, коллокации, пример (EN) и запрос для Pixabay.
    </p>

    <div v-if="hint" class="ai-hint-body">
      <section v-if="hint.gist_ru" class="ai-hint-block">
        <h3 class="ai-hint-h">Смысл</h3>
        <p class="ai-hint-p">{{ hint.gist_ru }}</p>
      </section>

      <section v-if="hint.collocations_en.length > 0" class="ai-hint-block">
        <h3 class="ai-hint-h">Коллокации (EN)</h3>
        <ul class="ai-hint-ul">
          <li v-for="c in hint.collocations_en" :key="c">{{ c }}</li>
        </ul>
      </section>

      <section v-if="hint.example_en" class="ai-hint-block">
        <h3 class="ai-hint-h">Пример (EN)</h3>
        <p class="ai-hint-p ai-hint-mono">{{ hint.example_en }}</p>
      </section>

      <section v-if="hint.register_note_ru" class="ai-hint-block">
        <h3 class="ai-hint-h">Регистр / стиль</h3>
        <p class="ai-hint-p">{{ hint.register_note_ru }}</p>
      </section>

      <section v-if="hint.common_pitfall_ru" class="ai-hint-block">
        <h3 class="ai-hint-h">Ловушка</h3>
        <p class="ai-hint-p">{{ hint.common_pitfall_ru }}</p>
      </section>

      <section v-if="hint.grammar_note_ru" class="ai-hint-block">
        <h3 class="ai-hint-h">Грамматика</h3>
        <p class="ai-hint-p">{{ hint.grammar_note_ru }}</p>
      </section>

      <section v-if="hint.pixabay_query_en" class="ai-hint-block">
        <h3 class="ai-hint-h">Картинка (Pixabay)</h3>
        <p class="ai-hint-p ai-hint-mono">{{ hint.pixabay_query_en }}</p>
        <a class="ai-hint-link" :href="pixabaySearchUrl(hint.pixabay_query_en)" target="_blank" rel="noreferrer">
          Открыть поиск на Pixabay
        </a>
      </section>
    </div>
  </aside>
</template>
