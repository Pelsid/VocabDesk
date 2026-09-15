/** Практика диалога через Groq (тот же ключ, что и у подсказок в сессии). */

import { apiFetch } from '../api/client'
import { GROQ_MODEL_DEFAULT } from './groqStudyHint'
import { recordGroqRequest } from './groqUsageTracker'

const LS_KEY = 'vocabdesk-chat-threads-v1'

export const CHAT_SYSTEM_PROMPT = `You are a friendly English conversation partner for a Russian-speaking learner.
Keep replies short (2–6 sentences). Stay in English most of the time; you may add a brief Russian hint only if the user is stuck.
Gently correct mistakes: quote the improved phrase, then continue the dialogue.
Do not dump vocabulary lists or SRS answers. Do not reveal translations of study-card lemmas unless the user asked for that word.
Ask a follow-up question so the dialogue continues.`

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
  at: number
}

export interface ChatThread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function loadChatThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isThread)
  } catch {
    return []
  }
}

function isThread(x: unknown): x is ChatThread {
  if (!x || typeof x !== 'object') return false
  const t = x as ChatThread
  return typeof t.id === 'string' && Array.isArray(t.messages)
}

export function saveChatThreads(threads: ChatThread[]): void {
  try {
    const trimmed = threads
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40)
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed))
  } catch {
    /* quota */
  }
}

export function createChatThread(): ChatThread {
  const now = Date.now()
  return { id: newId(), title: 'Новый диалог', createdAt: now, updatedAt: now, messages: [] }
}

export function titleFromFirstMessage(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return 'Новый диалог'
  return t.length > 42 ? `${t.slice(0, 42)}…` : t
}

export async function streamGroqChat(args: {
  history: ChatMessage[]
  onDelta: (chunk: string) => void
  signal?: AbortSignal
}): Promise<string> {
  const messages = [
    { role: 'system' as const, content: CHAT_SYSTEM_PROMPT },
    ...args.history.map((m) => ({ role: m.role, content: m.content })),
  ]

  const res = await apiFetch('/api/groq.php', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'chat',
      stream: true,
      model: GROQ_MODEL_DEFAULT,
      messages,
    }),
    signal: args.signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Groq API ${res.status}: ${errText.slice(0, 400)}`)
  }

  if (!res.body) {
    throw new Error('Пустой поток ответа Groq')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string | null } }>
        }
        const piece = json.choices?.[0]?.delta?.content
        if (piece) {
          full += piece
          args.onDelta(piece)
        }
      } catch {
        /* keep reading */
      }
    }
  }

  if (!full.trim()) throw new Error('Пустой ответ от Groq')
  recordGroqRequest()
  return full
}
