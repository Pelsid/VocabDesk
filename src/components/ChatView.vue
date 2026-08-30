<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import GroqUsageBadge from './GroqUsageBadge.vue'
import {
  createChatThread,
  loadChatThreads,
  saveChatThreads,
  streamGroqChat,
  titleFromFirstMessage,
  type ChatThread,
} from '../lib/groqChat'
import { useGroqApiKey } from '../lib/groqApiKey'

const TOPICS = [
  { label: 'Путешествие по Европе', prompt: "Let's talk about travelling in Europe. Ask me where I'd like to go first." },
  { label: 'Повседневные дела', prompt: "Let's practise small talk about a typical weekday. Start with the morning." },
  { label: 'Работа и учёба', prompt: "Let's discuss work or studies. Ask what I'm focusing on this week." },
  { label: 'Еда и ресторан', prompt: "Let's role-play ordering food at a restaurant. You are the waiter." },
]

const { hasKey } = useGroqApiKey()

const threads = ref<ChatThread[]>(loadChatThreads())
const activeId = ref<string | null>(threads.value[0]?.id ?? null)
const showHistory = ref(false)
const draft = ref('')
const sending = ref(false)
const err = ref<string | null>(null)
const threadEl = ref<HTMLElement | null>(null)
let abort: AbortController | null = null

const active = computed(() => threads.value.find((t) => t.id === activeId.value) ?? null)

function persist() {
  saveChatThreads(threads.value)
}

function ensureThread(): ChatThread {
  let t = active.value
  if (t) return t
  t = createChatThread()
  threads.value = [t, ...threads.value]
  activeId.value = t.id
  persist()
  return t
}

function openNew() {
  const t = createChatThread()
  threads.value = [t, ...threads.value]
  activeId.value = t.id
  showHistory.value = false
  persist()
}

function selectThread(id: string) {
  activeId.value = id
  showHistory.value = false
}

async function scrollBottom() {
  await nextTick()
  const el = threadEl.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  () => active.value?.messages.length,
  () => void scrollBottom(),
)

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

async function sendText(text: string) {
  const content = text.trim()
  if (!content || sending.value || !hasKey.value) return
  err.value = null
  const thread = ensureThread()
  const now = Date.now()
  thread.messages.push({ role: 'user', content, at: now })
  if (thread.messages.filter((m) => m.role === 'user').length === 1) {
    thread.title = titleFromFirstMessage(content)
  }
  thread.updatedAt = now
  const assistant: { role: 'assistant'; content: string; at: number } = { role: 'assistant', content: '', at: Date.now() }
  thread.messages.push(assistant)
  persist()
  draft.value = ''
  sending.value = true
  abort?.abort()
  abort = new AbortController()
  try {
    const history = thread.messages.filter((m) => m !== assistant)
    const full = await streamGroqChat({
      history,
      signal: abort.signal,
      onDelta(chunk) {
        assistant.content += chunk
        threads.value = threads.value.slice()
      },
    })
    assistant.content = full
    thread.updatedAt = Date.now()
    persist()
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') return
    err.value = e instanceof Error ? e.message : String(e)
    if (!assistant.content) {
      thread.messages = thread.messages.filter((m) => m !== assistant)
    }
    persist()
  } finally {
    sending.value = false
    abort = null
    void scrollBottom()
  }
}

function onSubmit(e: Event) {
  e.preventDefault()
  void sendText(draft.value)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void sendText(draft.value)
  }
}

onUnmounted(() => abort?.abort())
</script>

<template>
  <div class="chat-view">
    <header class="page-head">
      <div>
        <h1>Чат с AI</h1>
        <p class="page-sub">Необязательная практика — карточки работают и без ключа</p>
      </div>
      <div class="page-head-aside">
        <GroqUsageBadge />
        <button type="button" class="chat-head-link" @click="showHistory = !showHistory">История чатов</button>
        <button type="button" class="btn-quiet" @click="openNew">Новый чат</button>
      </div>
    </header>

    <div v-if="showHistory" class="chat-history">
      <button
        v-for="t in threads"
        :key="t.id"
        type="button"
        class="chat-history-item"
        :class="{ active: t.id === activeId }"
        @click="selectThread(t.id)"
      >
        <div class="word-card-en">{{ t.title }}</div>
        <div class="muted small">{{ t.messages.length }} сообщений</div>
      </button>
      <p v-if="threads.length === 0" class="muted small">Пока нет сохранённых диалогов.</p>
    </div>

    <div v-if="!hasKey" class="chat-empty panel">
      <p class="learn-empty-title">AI-диалоги необязательны</p>
      <p class="muted small">
        Это практика разговора, не ядро VocabDesk. Карточки и повторение работают без ключа. Чтобы включить чат,
        откройте «Данные» внизу меню и вставьте ключ Groq.
      </p>
    </div>

    <template v-else>
      <div v-if="!active || active.messages.length === 0" class="chat-topics">
        <button v-for="t in TOPICS" :key="t.label" type="button" class="chip" @click="sendText(t.prompt)">
          {{ t.label }}
        </button>
      </div>

      <div ref="threadEl" class="chat-thread" aria-live="polite">
        <div v-if="!active || active.messages.length === 0" class="chat-empty">
          <p class="learn-empty-title">AI-диалоги — необязательная практика</p>
          <p class="muted">Выберите тему или напишите что-нибудь по-английски. Например:</p>
          <p class="chat-onboard-example">I want to practise ordering coffee in a café.</p>
        </div>
        <div v-for="(m, i) in active?.messages ?? []" :key="`${m.at}-${i}`" class="chat-row" :class="m.role">
          <span v-if="m.role === 'assistant'" class="chat-avatar" aria-hidden>✦</span>
          <div class="chat-bubble">
            {{ m.content || (sending && i === (active?.messages.length ?? 1) - 1 ? '…' : '') }}
            <span class="chat-time">{{ formatTime(m.at) }}</span>
          </div>
        </div>
      </div>

      <p v-if="err" class="alert">{{ err }}</p>

      <form class="chat-composer" @submit="onSubmit">
        <textarea
          v-model="draft"
          class="chat-input"
          rows="1"
          placeholder="Напишите сообщение…"
          :disabled="sending"
          @keydown="onKey"
        />
        <button type="submit" class="chat-send" :disabled="sending || !draft.trim()" aria-label="Отправить">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22 11 13 2 9 22 2z" />
          </svg>
        </button>
      </form>
    </template>
  </div>
</template>
