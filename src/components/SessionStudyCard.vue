<script setup lang="ts">
import type { Database } from 'sql.js'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, watchEffect } from 'vue'
import {
  getPictureBlob,
  sampleRusTranslationsForQuiz,
  type WordRow,
} from '../db/rewordDb'
import { parseExamples, stripHighlights } from '../lib/examples'
import { uint8ToObjectUrl } from '../lib/imageBlob'
import type { CardSchedule, CategoryScopePrefs, Grade } from '../lib/progressTypes'
import { formatDueLabel } from '../lib/srs'
import { REMOTE_PICTURE_MAX, resolveRemotePictureUrls } from '../lib/remotePictureUrl'
import { matchesTranslation } from '../lib/text'
import { lemmaMatchesGuess, pickClozeLine } from '../lib/cloze'
import { speakEnglish, speechSynthesisSupported } from '../lib/speech'
import Highlighted from './Highlighted.vue'
import AiHintSidebar from './AiHintSidebar.vue'
import StudyBadge from './StudyBadge.vue'

type StudyInteractionMode = 'type' | 'reveal' | 'choice' | 'cloze'

const props = defineProps<{
  db: Database
  word: WordRow
  schedule: CardSchedule | null
  variantIsYoung: boolean
  scope: 'selected' | 'category'
  scopePrefs: CategoryScopePrefs
  categoryId: string | null
}>()

const emit = defineEmits<{
  memorized: []
  grade: [g: Grade]
  deferInSession: []
  markMasteredForever: []
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

const young = computed(() => props.variantIsYoung)
const mode = ref<StudyInteractionMode>('choice')
const clozePhase = ref<'input' | 'solved' | 'peek'>('input')
const clozeGuess = ref('')
const revealed = ref(false)
const imageUrls = ref<string[]>([])
const mediaNotice = ref<string | null>(null)
const guess = ref('')
const typingSkipped = ref(false)
const picked = ref<string | null>(null)
const galleryRemoteOkRef = shallowRef(false)

watch(
  () => props.word.id,
  () => {
    mode.value = 'choice'
    revealed.value = false
    guess.value = ''
    typingSkipped.value = false
    picked.value = null
    clozePhase.value = 'input'
    clozeGuess.value = ''
  },
)

watchEffect((onCleanup) => {
  let cancelled = false
  let blobToRevoke: string | null = null

  const cleanup = () => {
    cancelled = true
    if (blobToRevoke) {
      URL.revokeObjectURL(blobToRevoke)
      blobToRevoke = null
    }
  }
  onCleanup(cleanup)

  galleryRemoteOkRef.value = false
  mediaNotice.value = null

  if (props.word.pictureId && props.word.picBlobLen > 0) {
    const bytes = getPictureBlob(props.db, props.word.pictureId)
    const blobObjectUrl = bytes ? uint8ToObjectUrl(bytes) : null
    if (!blobObjectUrl) {
      imageUrls.value = []
      mediaNotice.value = 'Фото указано в бэкапе, но данные не прочитаны.'
      return
    }
    blobToRevoke = blobObjectUrl
    imageUrls.value = [blobObjectUrl]
    return
  }

  imageUrls.value = []

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

const exampleEnglishLines = computed(() =>
  ex.value
    .map((e) => stripHighlights(e.original).trim())
    .filter(Boolean)
    .slice(0, 4),
)

const clozeLine = computed(() => pickClozeLine(props.word.word, exampleEnglishLines.value))

const cardTitle = computed(() => (young.value ? 'Изучение нового слова' : 'Повторение слова'))

const distractors = computed(() =>
  sampleRusTranslationsForQuiz(props.db, props.scope, props.categoryId, props.word.id, 48, props.scopePrefs),
)

const mcOptions = computed(() => {
  const correct = props.word.rus?.trim() ?? ''
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
    (mode.value !== 'cloze' &&
      (revealed.value ||
        (picked.value != null && props.word.rus != null && matchesTranslation(picked.value, props.word.rus)) ||
        (mode.value === 'type' && matchesTranslation(guess.value, props.word.rus)))),
)

const canReveal = computed(
  () =>
    mode.value !== 'type' ||
    typingSkipped.value ||
    matchesTranslation(guess.value, props.word.rus) ||
    guess.value.trim().length === 0,
)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && mode.value === 'cloze' && clozePhase.value === 'input' && !translationKnown.value) {
    e.preventDefault()
    if (lemmaMatchesGuess(props.word.word, clozeGuess.value)) clozePhase.value = 'solved'
  }
  if (e.code === 'Space' && mode.value === 'reveal' && !translationKnown.value && canReveal.value) {
    e.preventDefault()
    revealed.value = true
  }
  if (!young.value && translationKnown.value) {
    if (e.key === '1') emit('grade', 'again')
    if (e.key === '2') emit('grade', 'hard')
    if (e.key === '3') emit('grade', 'good')
    if (e.key === '4') emit('grade', 'easy')
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

const scheduleTitle = computed(() => (props.schedule ? formatDueLabel(props.schedule, Date.now()) : 'ещё не начато'))

function onMcPick(label: string) {
  if (!props.word.rus) return
  picked.value = label
  if (matchesTranslation(label, props.word.rus)) revealed.value = true
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
  const ok = props.word.rus != null && matchesTranslation(label, props.word.rus)
  const showResult = picked.value != null
  const pickedOk =
    picked.value != null && props.word.rus != null && matchesTranslation(picked.value, props.word.rus)
  let cls = 'mc-option'
  if (showResult) {
    if (ok) cls += pickedOk ? ' correct' : ' reveal-correct'
    else if (picked.value === label) cls += ' wrong'
  }
  return cls
}

function resetModeUi(m: StudyInteractionMode) {
  mode.value = m
  picked.value = null
  revealed.value = false
  clozePhase.value = 'input'
  clozeGuess.value = ''
}
</script>

<template>
  <div class="study-with-hint">
    <div class="study-layout">
      <div class="study-session-card panel">
        <header class="study-session-card-head">
          <span class="study-session-kind">{{ cardTitle }}</span>
          <div class="study-session-card-meta">
            <StudyBadge :schedule="schedule" :now="Date.now()" />
            <span class="muted small due-pill">{{ scheduleTitle }}</span>
          </div>
        </header>

        <div
          v-if="imageUrls.length > 0"
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

        <div v-if="mode !== 'cloze' || translationKnown" class="study-word-block">
          <div class="study-lemma-row">
            <div class="study-lemma">{{ word.word }}</div>
            <button
              v-if="speechSynthesisSupported()"
              type="button"
              class="btn-quiet study-speak-btn"
              aria-label="Озвучить слово по-английски"
              @click="speakEnglish(word.word)"
            >
              🔊 EN
            </button>
          </div>
          <div v-if="word.transcription" class="ipa muted study-transcription">{{ word.transcription }}</div>
        </div>
        <p v-else class="muted small study-cloze-lead">
          Режим контекста: сначала восстановите слово по предложению, затем откроется перевод.
        </p>

        <div v-if="mediaNotice" class="study-media-notice" role="note">
          <span class="study-media-notice-label">Медиа</span>
          <span class="study-media-notice-text">{{ mediaNotice }}</span>
        </div>

        <div class="study-mode-bar" role="tablist" aria-label="Способ ответа">
          <button
            type="button"
            role="tab"
            class="study-mode-btn"
            :class="{ active: mode === 'type' }"
            :aria-selected="mode === 'type'"
            @click="resetModeUi('type')"
          >
            <span class="mode-glyph" aria-hidden>⌨</span>
            <span class="mode-label">Ввод</span>
          </button>
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
              <button type="button" class="btn-quiet" :disabled="clozePhase !== 'input'" @click="clozePhase = 'peek'">
                Показать слово
              </button>
            </div>
          </div>
          <div v-else class="muted small centered-hint">
            Нет английского примера с этим словом в бэкапе — выберите «Ввод», «Ответ» или «Тест».
          </div>
        </div>

        <div v-if="mode === 'type' && !translationKnown" class="rep-box">
          <input v-model="guess" autofocus placeholder="Наберите перевод (рус.)" />
          <div class="rep-actions">
            <button type="button" class="btn-quiet" @click="typingSkipped = true">Не помню — показать</button>
            <button type="button" class="btn-primary" @click="revealed = true">Проверить / показать</button>
          </div>
        </div>

        <button v-if="mode === 'reveal' && !translationKnown" type="button" class="btn-primary reveal-cta" @click="revealed = true">
          Показать перевод
        </button>

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
          Нет перевода в базе — переключитесь на «Ответ» или «Ввод».
        </div>

        <div v-if="picked != null && !translationKnown" class="muted small mc-hint">
          Не тот вариант — попробуйте ещё раз или откройте «Ответ».
        </div>

        <div v-if="translationKnown" class="answer-block study-answer-block">
          <div class="study-answer-label muted small">Перевод</div>
          <div class="big ru study-translation">{{ word.rus ?? '—' }}</div>

          <div v-if="ex.length" class="examples compact study-examples">
            <div class="muted small">Примеры</div>
            <ul>
              <li v-for="(e, i) in ex" :key="i">
                <div class="ex-o">
                  <Highlighted :text="e.original" />
                </div>
                <div class="ex-t muted">
                  <Highlighted :text="e.translate" />
                </div>
              </li>
            </ul>
          </div>
        </div>

        <template v-if="young">
          <div class="reword-actions">
            <button type="button" class="reword-memorized" @click="emit('memorized')">Запомнил, отложить для повторения</button>
            <span class="reword-actions-divider" aria-hidden />
            <button type="button" class="reword-again" @click="emit('deferInSession')">Показать это слово ещё</button>
          </div>
          <button v-if="translationKnown" type="button" class="btn-mastered" @click="emit('markMasteredForever')">
            <span class="btn-mastered-title">Выучил навсегда</span>
            <span class="grade-hint">Не показывать в «Учить» и повторах</span>
          </button>
          <p class="muted small kbd-center">
            «Запомнил» — следующий шаг в SRS (как «Хорошо»). «Ещё» — вернёт карточку позже в этой сессии. Пробел — в режиме «Ответ».
          </p>
        </template>
        <template v-else>
          <template v-if="translationKnown">
            <div class="grade-bar reword-grade-bar" role="group" aria-label="Оценка ответа">
              <button type="button" class="grade again" @click="emit('grade', 'again')">
                <span class="grade-top"> Снова <span class="kbd-mini">1</span> </span>
                <span class="grade-hint">Скоро снова в очереди</span>
              </button>
              <button type="button" class="grade hard" @click="emit('grade', 'hard')">
                <span class="grade-top"> Сложно <span class="kbd-mini">2</span> </span>
                <span class="grade-hint">Короче интервал до следующего раза</span>
              </button>
              <button type="button" class="grade good" @click="emit('grade', 'good')">
                <span class="grade-top"> Хорошо <span class="kbd-mini">3</span> </span>
                <span class="grade-hint">Обычный шаг расписания</span>
              </button>
              <button type="button" class="grade easy" @click="emit('grade', 'easy')">
                <span class="grade-top"> Легко <span class="kbd-mini">4</span> </span>
                <span class="grade-hint">Дольше до следующего показа</span>
              </button>
            </div>
            <button type="button" class="btn-mastered" @click="emit('markMasteredForever')">
              <span class="btn-mastered-title">Выучил навсегда</span>
              <span class="grade-hint">Не показывать в «Учить» и повторах</span>
            </button>
            <div class="reword-actions defer-only">
              <button type="button" class="reword-again" @click="emit('deferInSession')">Показать это слово ещё</button>
            </div>
            <p class="muted small kbd-center">После ответа: 1–4 · Esc — конец сессии</p>
          </template>
          <template v-else>
            <div class="reword-actions defer-only">
              <button type="button" class="reword-again" @click="emit('deferInSession')">Показать это слово ещё</button>
            </div>
            <p class="muted small kbd-center">
              Выберите режим, откройте перевод — затем оцените ответ клавишами 1–4.
            </p>
          </template>
        </template>
      </div>
    </div>
    <AiHintSidebar
      :word-id="word.id"
      :lemma="word.word"
      :ipa="word.transcription"
      :mode="mode"
      :example-english-lines="exampleEnglishLines"
    />
  </div>
</template>
