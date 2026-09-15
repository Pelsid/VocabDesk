<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, watchEffect } from 'vue'
import type { WordRow } from '../lib/catalogTypes'
import type { CatalogScope } from '../lib/catalogScope'
import { parseExamples, stripHighlights } from '../lib/examples'
import type { CardSchedule, CategoryScopePrefs, Grade } from '../lib/progressTypes'
import { formatDueLabel, previewNextIntervals } from '../lib/srs'
import { REMOTE_PICTURE_MAX, resolveRemotePictureUrls } from '../lib/remotePictureUrl'
import { useCatalogStore } from '../stores/catalog'
import { useProgressStore } from '../stores/progress'
import { matchesTranslation } from '../lib/text'
import { lemmaMatchesGuess, pickClozeLine } from '../lib/cloze'
import { posLabels } from '../lib/pos'
import { speakEnglish, speechSynthesisSupported } from '../lib/speech'
import { pickStudyMode, type StudyInteractionMode } from '../study/pickMode'
import { DEFAULT_PREFS } from '../lib/progressTypes'
import { resolvePromptLang } from '../lib/studyPrefs'
import Highlighted from './Highlighted.vue'
import AiHintSidebar from './AiHintSidebar.vue'
import StudyBadge from './StudyBadge.vue'
import GrammarLinks from './GrammarLinks.vue'

const props = defineProps<{
  word: WordRow
  schedule: CardSchedule | null
  variantIsYoung: boolean
  scope: CatalogScope
  scopePrefs: CategoryScopePrefs
  categoryId: string | null
}>()

const catalog = useCatalogStore()
const progressStore = useProgressStore()
const prefs = computed(() => ({ ...DEFAULT_PREFS, ...progressStore.snapshot.prefs }))
const distractors = ref<string[]>([])
const mixedPick = ref<'en' | 'ru'>(Math.random() < 0.5 ? 'en' : 'ru')

const emit = defineEmits<{
  memorized: []
  grade: [g: Grade]
  deferInSession: []
  markMasteredForever: []
  openGrammar: [id: string]
}>()

function shuffleArray<T>(a: T[]): T[] {
  const copy = a.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = copy[i]
    copy[i] = copy[j]!
    copy[j] = t!
  }
  return copy
}

function promptPref() {
  return props.variantIsYoung ? prefs.value.newWordPrompt : prefs.value.reviewWordPrompt
}

function currentPromptSide(): 'en' | 'ru' {
  if (!props.word.rus?.trim()) return 'en'
  return resolvePromptLang(promptPref(), mixedPick.value)
}

function modeForWord(): StudyInteractionMode {
  const auto = pickStudyMode(props.schedule, Boolean(props.word.rus?.trim()))
  if (currentPromptSide() === 'ru' && auto === 'cloze') {
    return props.word.rus?.trim() ? 'choice' : 'reveal'
  }
  if (auto !== 'cloze') return auto
  const lines = parseExamples(props.word.examplesRus)
    .map((e) => stripHighlights(e.original).trim())
    .filter(Boolean)
    .slice(0, 4)
  return pickClozeLine(props.word.word, lines) ? 'cloze' : 'reveal'
}

const young = computed(() => props.variantIsYoung)
const promptSide = computed(() => currentPromptSide())
const promptText = computed(() => (promptSide.value === 'en' ? props.word.word : props.word.rus?.trim() || props.word.word))
const answerText = computed(() => (promptSide.value === 'en' ? (props.word.rus ?? '—') : props.word.word))
const showPictures = computed(() => prefs.value.showPictures)
const mode = ref<StudyInteractionMode>(modeForWord())
const hintOpen = ref(false)
const notesOpen = ref(false)
const clozePhase = ref<'input' | 'solved' | 'peek'>(mode.value === 'reveal' ? 'peek' : 'input')
const clozeGuess = ref('')
const revealed = ref(mode.value === 'reveal')
const imageUrls = ref<string[]>([])
const mediaNotice = ref<string | null>(null)
const picked = ref<string | null>(null)
const galleryRemoteOkRef = shallowRef(false)

watch(
  () => props.word.id,
  () => {
    hintOpen.value = false
    notesOpen.value = false
    picked.value = null
    clozeGuess.value = ''
    mixedPick.value = Math.random() < 0.5 ? 'en' : 'ru'
    applyMode(modeForWord())
  },
)

watchEffect((onCleanup) => {
  let cancelled = false

  const cleanup = () => {
    cancelled = true
  }
  onCleanup(cleanup)

  galleryRemoteOkRef.value = false
  mediaNotice.value = null
  imageUrls.value = []

  if (!prefs.value.showPictures) return

  void (async () => {
    const urls = await resolveRemotePictureUrls(props.word, REMOTE_PICTURE_MAX)
    if (cancelled) return
    if (urls.length > 0) {
      galleryRemoteOkRef.value = true
      imageUrls.value = urls
      mediaNotice.value = null
      return
    }
    const meta =
      props.word.picSource && props.word.picSourceId
        ? `${props.word.picSource} · ${props.word.picSourceId} (нет файла в бэкапе). `
        : ''
    const hasPixabay = Boolean(import.meta.env.VITE_PIXABAY_API_KEY?.trim())
    const hint = hasPixabay
      ? 'Не удалось получить изображение (сеть, лимит API Pixabay).'
      : 'Добавьте VITE_PIXABAY_API_KEY в .env.local — картинки подгружаются через API Pixabay по ID, Pexels или поиску по слову.'
    mediaNotice.value = meta ? `${meta}${hint}` : hint
  })()
})

watch(imageUrls, (urls) => {
  if (urls.length > 0) return
  if (!galleryRemoteOkRef.value) return
  galleryRemoteOkRef.value = false
  mediaNotice.value = 'Изображения по ссылке не открылись (блокировка, сеть или устаревший URL).'
})

const ex = computed(() => parseExamples(props.word.examplesRus))
const wordPos = computed(() => posLabels(props.word.pos))
const primaryExample = computed(() => ex.value[0] ?? null)
const extraExamples = computed(() => ex.value.slice(1))
const canSpeak = computed(() => speechSynthesisSupported())

function speakLemma() {
  speakEnglish(props.word.word)
}

function speakPrimaryExample() {
  const line = primaryExample.value?.original
  if (!line) return
  speakEnglish(stripHighlights(line))
}

const exampleEnglishLines = computed(() =>
  ex.value
    .map((e) => stripHighlights(e.original).trim())
    .filter(Boolean)
    .slice(0, 4),
)

const clozeLine = computed(() => pickClozeLine(props.word.word, exampleEnglishLines.value))

const cardTitle = computed(() => (young.value ? 'Изучение нового слова' : 'Повторение слова'))

watch(
  () => [props.word.id, props.scope, props.categoryId, promptSide.value] as const,
  () => {
    distractors.value = []
    const req =
      promptSide.value === 'en'
        ? catalog.quizRus({ scope: props.scope, categoryId: props.categoryId, exclude: props.word.id })
        : catalog.quizEn({ scope: props.scope, categoryId: props.categoryId, exclude: props.word.id })
    void req
      .then((items) => {
        distractors.value = items
      })
      .catch(() => {
        distractors.value = []
      })
  },
  { immediate: true },
)

const gradeHints = computed(() =>
  previewNextIntervals(props.schedule, Date.now(), progressStore.snapshot.prefs),
)

function isCorrectChoice(label: string): boolean {
  if (promptSide.value === 'en') {
    return props.word.rus != null && matchesTranslation(label, props.word.rus)
  }
  return lemmaMatchesGuess(props.word.word, label)
}

const mcOptions = computed(() => {
  const correct = promptSide.value === 'en' ? (props.word.rus?.trim() ?? '') : props.word.word.trim()
  if (!correct) return []
  const uniq = new Set<string>()
  uniq.add(correct)
  for (const d of distractors.value) {
    if (normalizeForMc(d) === normalizeForMc(correct)) continue
    uniq.add(d)
    if (uniq.size >= 4) break
  }
  return shuffleArray([...uniq])
})

const translationKnown = computed(
  () =>
    (mode.value === 'cloze' && (clozePhase.value === 'solved' || clozePhase.value === 'peek')) ||
    (mode.value !== 'cloze' && (revealed.value || (picked.value != null && isCorrectChoice(picked.value)))),
)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && mode.value === 'cloze' && clozePhase.value === 'input' && !translationKnown.value) {
    e.preventDefault()
    if (lemmaMatchesGuess(props.word.word, clozeGuess.value)) clozePhase.value = 'solved'
  }
  if (!young.value && translationKnown.value) {
    if (e.key === '1') onGradeClick('again')
    if (e.key === '2') onGradeClick('hard')
    if (e.key === '3') onGradeClick('easy')
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

const scheduleTitle = computed(() => (props.schedule ? formatDueLabel(props.schedule, Date.now()) : 'ещё не начато'))

function onMcPick(label: string) {
  if (promptSide.value === 'en' && !props.word.rus) return
  picked.value = label
  if (isCorrectChoice(label)) revealed.value = true
}

function onImgError(e: Event) {
  const el = e.target as HTMLImageElement
  const failed = el.src
  if (failed.startsWith('blob:')) {
    imageUrls.value = []
    mediaNotice.value = 'Фото из бэкапа не отображается.'
    return
  }
  imageUrls.value = imageUrls.value.filter((u) => u !== failed)
}

function normalizeForMc(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[,.;]/g, '')
    .trim()
}

function confirmCloze() {
  if (lemmaMatchesGuess(props.word.word, clozeGuess.value)) clozePhase.value = 'solved'
}

function mcOptionClass(label: string): string {
  const ok = isCorrectChoice(label)
  const showResult = picked.value != null
  const pickedOk = picked.value != null && isCorrectChoice(picked.value)
  let cls = 'mc-option'
  if (showResult) {
    if (ok) cls += pickedOk ? ' correct' : ' reveal-correct'
    else if (picked.value === label) cls += ' wrong'
  }
  return cls
}

function applyMode(m: StudyInteractionMode) {
  mode.value = m
  picked.value = null
  clozeGuess.value = ''
  if (m === 'reveal') {
    revealed.value = true
    clozePhase.value = 'peek'
    return
  }
  revealed.value = false
  clozePhase.value = 'input'
}

function resetModeUi(m: StudyInteractionMode) {
  applyMode(m)
}

function onGradeClick(g: Grade) {
  emit('grade', g)
}

function onMemorizedClick() {
  emit('memorized')
}
</script>

<template>
  <div class="study-with-hint" :class="{ 'hint-open': hintOpen }">
    <div class="study-layout">
      <div class="study-session-card panel" :class="{ 'is-known': translationKnown }">
        <header class="study-session-card-head">
          <div class="study-session-kind-wrap">
            <span class="study-session-kind">
              <span v-if="translationKnown" class="study-check" aria-hidden>
                <svg viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="9" />
                  <path d="M6 10.4 8.8 13.1 14.2 7.4" />
                </svg>
              </span>
              {{ promptSide === 'en' ? 'Переведите на русский' : 'Переведите на английский' }}
            </span>
            <div class="muted small">{{ cardTitle }}</div>
          </div>

          <div v-if="mode !== 'cloze' || translationKnown" class="study-word-hero">
            <div class="study-lemma-row">
              <div class="study-lemma">{{ promptText }}</div>
              <button
                v-if="canSpeak && promptSide === 'en'"
                type="button"
                class="study-speak-btn"
                aria-label="Озвучить слово по-английски"
                @click="speakLemma"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden>
                  <path d="M11 5 6 9H3v6h3l5 4V5z" />
                  <path d="M16 9a4 4 0 0 1 0 6" />
                  <path d="M18.5 7a7 7 0 0 1 0 10" />
                </svg>
              </button>
              <span class="study-lang-chip">{{ promptSide === 'en' ? 'EN' : 'RU' }}</span>
            </div>
            <div v-if="(promptSide === 'en' || translationKnown) && word.transcription" class="ipa study-transcription">{{ word.transcription }}</div>
            <div v-if="(promptSide === 'en' || translationKnown) && (wordPos.length || word.oxfordLevels?.length)" class="study-word-chips">
              <span v-for="pos in wordPos" :key="pos" class="study-meta-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden>
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                {{ pos }}
              </span>
              <span v-for="lv in word.oxfordLevels" :key="lv" class="study-meta-chip study-meta-chip--oxford">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden>
                  <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" />
                  <circle cx="12" cy="10" r="2.2" />
                </svg>
                Oxford {{ lv }}
              </span>
            </div>
          </div>
          <p v-else class="muted small study-cloze-lead">
            Сначала восстановите слово по предложению — затем откроется перевод.
          </p>

          <div class="study-session-card-meta">
            <StudyBadge :schedule="schedule" :now="Date.now()" />
            <span class="due-pill">{{ scheduleTitle }}</span>
          </div>
        </header>

        <div class="study-mode-bar" role="tablist" aria-label="Способ ответа">
          <button
            type="button"
            role="tab"
            class="study-mode-btn"
            :class="{ active: mode === 'reveal' }"
            :aria-selected="mode === 'reveal'"
            @click="resetModeUi('reveal')"
          >
            <span class="mode-glyph" aria-hidden>👁</span>
            <span class="mode-label">Ответ</span>
          </button>
          <button
            type="button"
            role="tab"
            class="study-mode-btn"
            :class="{ active: mode === 'choice' }"
            :aria-selected="mode === 'choice'"
            @click="resetModeUi('choice')"
          >
            <span class="mode-glyph" aria-hidden>⊞</span>
            <span class="mode-label">Тест</span>
          </button>
          <button
            type="button"
            role="tab"
            class="study-mode-btn"
            :class="{ active: mode === 'cloze' }"
            :aria-selected="mode === 'cloze'"
            @click="resetModeUi('cloze')"
          >
            <span class="mode-glyph" aria-hidden>≡</span>
            <span class="mode-label">Контекст</span>
          </button>
        </div>

        <div v-if="mode === 'cloze' && !translationKnown">
          <div v-if="clozeLine" class="cloze-panel">
            <div class="cloze-sentence" lang="en">{{ clozeLine.display }}</div>
            <input
              v-model="clozeGuess"
              autofocus
              class="cloze-input"
              placeholder="Пропуск (англ.)"
              :disabled="clozePhase !== 'input'"
            />
            <div class="rep-actions cloze-actions">
              <button type="button" class="btn-primary" :disabled="clozePhase !== 'input'" @click="confirmCloze">
                Проверить
              </button>
              <button
                v-if="!hintOpen"
                type="button"
                class="btn-quiet"
                @click="hintOpen = true"
              >
                Подсказка
              </button>
            </div>
          </div>
          <div v-else class="muted small centered-hint">
            Нет английского примера с этим словом в бэкапе — выберите «Ответ» или «Тест».
          </div>
        </div>

        <div v-if="mode === 'choice' && !translationKnown && mcOptions.length > 0" class="mc-grid">
          <button
            v-for="label in mcOptions"
            :key="label.slice(0, 80) + '-' + normalizeForMc(label)"
            type="button"
            :class="mcOptionClass(label)"
            @click="onMcPick(label)"
          >
            {{ label }}
          </button>
        </div>

        <div v-if="mode === 'choice' && !translationKnown && mcOptions.length === 0" class="muted small centered-hint">
          Нет перевода в базе — переключитесь на «Ответ» или «Контекст».
        </div>

        <div v-if="picked != null && !translationKnown" class="muted small mc-hint">
          Не тот вариант — попробуйте ещё раз или откройте «Ответ».
        </div>

        <div v-if="translationKnown" class="study-reveal-grid">
            <div class="study-trans-card">
            <div class="study-card-kicker">
              <span class="study-check" aria-hidden>
                <svg viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="9" />
                  <path d="M6 10.4 8.8 13.1 14.2 7.4" />
                </svg>
              </span>
              Перевод
            </div>
            <div class="study-translation-row">
              <div class="study-translation">{{ answerText }}</div>
              <button
                v-if="canSpeak && promptSide === 'ru'"
                type="button"
                class="study-speak-btn"
                aria-label="Озвучить слово по-английски"
                @click="speakLemma"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden>
                  <path d="M11 5 6 9H3v6h3l5 4V5z" />
                  <path d="M16 9a4 4 0 0 1 0 6" />
                </svg>
              </button>
            </div>
          </div>

          <div class="study-example-card">
            <div class="study-example-top">
              <div class="study-card-kicker">
                <svg class="study-kicker-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden>
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                  <path d="M12 2a7 7 0 0 0-4 12.8V17h8v-2.2A7 7 0 0 0 12 2z" />
                </svg>
                Пример в контексте
              </div>
              <button
                v-if="canSpeak && primaryExample"
                type="button"
                class="study-speak-btn study-speak-btn--ghost"
                aria-label="Озвучить пример"
                @click="speakPrimaryExample"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden>
                  <path d="M11 5 6 9H3v6h3l5 4V5z" />
                  <path d="M16 9a4 4 0 0 1 0 6" />
                </svg>
              </button>
            </div>
            <template v-if="primaryExample">
              <p class="study-example-en" lang="en">
                <Highlighted :text="primaryExample.original" />
              </p>
              <p v-if="primaryExample.translate" class="study-example-ru">
                <Highlighted :text="primaryExample.translate" />
              </p>
            </template>
            <p v-else class="muted small">Нет примера для этого слова.</p>
            <div
              v-if="showPictures && imageUrls.length > 0"
              :class="['study-word-media', 'study-word-media--example', imageUrls.length === 1 ? 'study-word-media--solo' : '']"
            >
              <img
                v-for="(url, i) in imageUrls"
                :key="`${word.id}-ex-${i}-${url.slice(0, 48)}`"
                class="study-word-thumb"
                alt=""
                :src="url"
                @error="onImgError"
              />
            </div>
          </div>
        </div>

        <div
          v-else-if="showPictures && imageUrls.length > 0"
          :class="['study-word-media', imageUrls.length === 1 ? 'study-word-media--solo' : '']"
        >
          <img
            v-for="(url, i) in imageUrls"
            :key="`${word.id}-${i}-${url.slice(0, 48)}`"
            class="study-word-thumb"
            alt=""
            :src="url"
            @error="onImgError"
          />
        </div>

        <div v-if="translationKnown" class="study-below">
          <div class="study-meta-row">
            <details
              v-if="extraExamples.length || mediaNotice"
              class="study-notes-fold"
              :open="notesOpen"
              @toggle="notesOpen = ($event.target as HTMLDetailsElement).open"
            >
              <summary class="study-notes-summary">
                <svg class="study-notes-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden>
                  <path d="m9 6 6 6-6 6" />
                </svg>
                Ещё примеры и заметки
              </summary>
              <div class="study-notes-body">
                <div v-if="extraExamples.length" class="examples compact study-examples">
                  <ul>
                    <li v-for="(e, i) in extraExamples" :key="i">
                      <div class="ex-o">
                        <Highlighted :text="e.original" />
                      </div>
                      <div class="ex-t muted">
                        <Highlighted :text="e.translate" />
                      </div>
                    </li>
                  </ul>
                </div>
                <p v-if="mediaNotice" class="study-media-notice" role="note">{{ mediaNotice }}</p>
              </div>
            </details>
            <GrammarLinks
              :lemma="word.word"
              :oxford-levels="word.oxfordLevels"
              @open="emit('openGrammar', $event)"
            />
          </div>
        </div>

        <div class="study-card-foot">
          <div v-if="translationKnown" class="study-interval-head">
            <span class="study-interval-label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden>
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              Интервал повторения слова
            </span>
          </div>
          <button
            v-else-if="!hintOpen && mode !== 'cloze'"
            type="button"
            class="btn-quiet study-hint-toggle"
            @click="hintOpen = true"
          >
            Подсказка
          </button>

          <template v-if="young">
            <template v-if="translationKnown">
              <div class="study-grade-row" role="group" aria-label="Действия с новым словом">
                <button type="button" class="grade good" @click="onMemorizedClick">
                  <svg class="grade-face" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.7" />
                    <circle cx="9" cy="10" r="1.15" fill="currentColor" />
                    <circle cx="15" cy="10" r="1.15" fill="currentColor" />
                    <path d="M8.2 14.4c1.5 1.8 6.1 1.8 7.6 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                  </svg>
                  <span class="grade-copy">
                    <span class="grade-top">Запомнил</span>
                    <span class="grade-hint">в повторение</span>
                  </span>
                </button>
                <button type="button" class="btn-mastered" @click="emit('markMasteredForever')">
                  <span class="btn-mastered-title">Выучил навсегда</span>
                </button>
              </div>
            </template>
            <template v-else>
              <button type="button" class="reword-again" @click="emit('deferInSession')">Отобразить позже</button>
            </template>
          </template>
          <template v-else>
            <template v-if="translationKnown">
              <div class="study-grade-row" role="group" aria-label="Оценка ответа">
                <button type="button" class="grade again" title="Клавиша 1" @click="onGradeClick('again')">
                  <svg class="grade-face" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.7" />
                    <circle cx="9" cy="10" r="1.15" fill="currentColor" />
                    <circle cx="15" cy="10" r="1.15" fill="currentColor" />
                    <path d="M8.2 16.2c1.5-1.7 6.1-1.7 7.6 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                  </svg>
                  <span class="grade-copy">
                    <span class="grade-top">Сложно</span>
                    <span class="grade-hint">{{ gradeHints.again }}</span>
                  </span>
                </button>
                <button type="button" class="grade hard" title="Клавиша 2" @click="onGradeClick('hard')">
                  <svg class="grade-face" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.7" />
                    <circle cx="9" cy="10" r="1.15" fill="currentColor" />
                    <circle cx="15" cy="10" r="1.15" fill="currentColor" />
                    <path d="M8.4 15.6h7.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                  </svg>
                  <span class="grade-copy">
                    <span class="grade-top">Неуверенно</span>
                    <span class="grade-hint">{{ gradeHints.hard }}</span>
                  </span>
                </button>
                <button type="button" class="grade easy" title="Клавиша 3" @click="onGradeClick('easy')">
                  <svg class="grade-face" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.7" />
                    <circle cx="9" cy="10" r="1.15" fill="currentColor" />
                    <circle cx="15" cy="10" r="1.15" fill="currentColor" />
                    <path d="M8 14.2c1.6 2.2 6.4 2.2 8 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                  </svg>
                  <span class="grade-copy">
                    <span class="grade-top">Легко</span>
                    <span class="grade-hint">{{ gradeHints.easy }}</span>
                  </span>
                </button>
                <button type="button" class="btn-mastered" @click="emit('markMasteredForever')">
                  <span class="btn-mastered-title">Выучил навсегда</span>
                </button>
              </div>
            </template>
            <template v-else>
              <button type="button" class="reword-again" @click="emit('deferInSession')">Отобразить позже</button>
            </template>
          </template>
        </div>
      </div>
    </div>
    <AiHintSidebar
      v-if="hintOpen"
      :word-id="word.id"
      :lemma="word.word"
      :ipa="word.transcription"
      :mode="mode"
      :example-english-lines="exampleEnglishLines"
      @close="hintOpen = false"
    />
  </div>
</template>
