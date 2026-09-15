/** Вызов Groq (OpenAI-compatible) для подсказок при изучении слов. Ключ — в окне «Данные» (localStorage) или VITE_GROQ_API_KEY. */

import { apiFetch } from '../api/client'
import { recordGroqRequest } from './groqUsageTracker'

export const GROQ_MODEL_DEFAULT = 'openai/gpt-oss-120b'

export interface StudyHintPayload {
  gist_ru: string
  collocations_en: string[]
  example_en: string | null
  register_note_ru: string | null
  common_pitfall_ru: string | null
  grammar_note_ru: string | null
  pixabay_query_en: string
}

export interface FetchStudyHintInput {
  model?: string
  lemma: string
  ipa: string | null
  /** Режим карточки: в «тесте» не передаём перевод и не просим дословный ответ */
  studyInteractionMode: 'choice' | 'type' | 'reveal'
  /** Только английские фрагменты примеров из базы (без русского) */
  exampleEnglishLines: string[]
}

function buildUserContent(input: FetchStudyHintInput): string {
  const lines: string[] = [
    `Слово (lemma): ${input.lemma}`,
    input.ipa ? `Транскрипция IPA: ${input.ipa}` : 'Транскрипция IPA: (нет)',
    `Режим карточки в приложении: ${input.studyInteractionMode === 'choice' ? 'тест с вариантами (мультивыбор)' : input.studyInteractionMode === 'type' ? 'ввод перевода' : 'раскрытие перевода'}`,
  ]
  if (input.exampleEnglishLines.length) {
    lines.push('Примеры из базы (только EN, для контекста):')
    for (const ex of input.exampleEnglishLines) lines.push(`- ${ex}`)
  }
  lines.push('')
  lines.push(
    input.studyInteractionMode === 'choice'
      ? 'ВАЖНО: пользователь проходит тест с русскими вариантами. Не называй точный русский перевод, не перечисляй кандидатов ответа, не используй формулировки, дословно совпадающие с типичным вариантом в тесте. Дай обобщённый смысл по-русски, EN-коллокации, EN-пример без перевода.'
      : 'Можно давать полезный краткий русскоязычный комментарий и явный смысл — варианты теста пользователю не показаны как список.',
  )
  lines.push(
    'Ответь ОДНИМ JSON-объектом (без markdown) со строковыми полями: gist_ru, collocations_en (массив строк), example_en (строка или пустая), register_note_ru, common_pitfall_ru, grammar_note_ru, pixabay_query_en (короткий EN-запрос для поиска картинки на Pixabay, без спецсимволов).',
  )
  return lines.join('\n')
}

const SYSTEM =
  'Ты помощник для изучения английского слова. Пишешь кратко, по делу. Строго соблюдай ограничения из сообщения пользователя. Все пояснения по смыслу — на русском, устойчивые сочетания и пример предложения — на английском.'

function parseHintJson(raw: string, lemma: string): StudyHintPayload {
  const data = JSON.parse(raw) as Record<string, unknown>
  const coll = data.collocations_en
  const collocations_en = Array.isArray(coll)
    ? coll.map((x) => String(x).trim()).filter(Boolean)
    : typeof coll === 'string'
      ? coll
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  const pq = String(data.pixabay_query_en ?? '').trim()
  return {
    gist_ru: String(data.gist_ru ?? '').trim(),
    collocations_en,
    example_en: emptyToNull(String(data.example_en ?? '').trim()),
    register_note_ru: emptyToNull(String(data.register_note_ru ?? '').trim()),
    common_pitfall_ru: emptyToNull(String(data.common_pitfall_ru ?? '').trim()),
    grammar_note_ru: emptyToNull(String(data.grammar_note_ru ?? '').trim()),
    pixabay_query_en: pq || lemma.trim() || 'english vocabulary',
  }
}

function emptyToNull(s: string): string | null {
  return s.length ? s : null
}

export async function fetchStudyHintFromGroq(input: FetchStudyHintInput): Promise<StudyHintPayload> {
  const model = input.model ?? GROQ_MODEL_DEFAULT
  const user = buildUserContent(input)

  const res = await apiFetch('/api/groq.php', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'hint',
      model,
      payload: {
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Groq API ${res.status}: ${errText.slice(0, 400)}`)
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  const content = body.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Пустой ответ от Groq')

  try {
    const payload = parseHintJson(content, input.lemma)
    recordGroqRequest()
    return payload
  } catch {
    throw new Error('Не удалось разобрать JSON подсказки')
  }
}
