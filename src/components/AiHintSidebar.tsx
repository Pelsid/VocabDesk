import { useCallback, useEffect, useState } from 'react'
import {
  fetchStudyHintFromGroq,
  GROQ_MODEL_DEFAULT,
  type StudyHintPayload,
} from '../lib/groqStudyHint'

type StudyInteractionMode = 'type' | 'reveal' | 'choice'

function pixabaySearchUrl(query: string): string {
  const q = query.trim() || 'english'
  return `https://pixabay.com/images/search/${encodeURIComponent(q)}/`
}

export function AiHintSidebar(props: {
  wordId: number
  lemma: string
  ipa: string | null
  mode: StudyInteractionMode
  exampleEnglishLines: string[]
}) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined
  const hasKey = Boolean(apiKey?.trim())
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const up = () => setOnline(navigator.onLine)
    window.addEventListener('online', up)
    window.addEventListener('offline', up)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', up)
    }
  }, [])

  const [hint, setHint] = useState<StudyHintPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setHint(null)
    setErr(null)
    setLoading(false)
  }, [props.wordId, props.mode])

  const load = useCallback(async () => {
    const key = apiKey?.trim()
    if (!key) return
    setLoading(true)
    setErr(null)
    try {
      const data = await fetchStudyHintFromGroq({
        apiKey: key,
        model: GROQ_MODEL_DEFAULT,
        lemma: props.lemma,
        ipa: props.ipa,
        studyInteractionMode: props.mode,
        exampleEnglishLines: props.exampleEnglishLines,
      })
      setHint(data)
    } catch (e) {
      setHint(null)
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [apiKey, props.lemma, props.ipa, props.mode, props.exampleEnglishLines])

  const disabled = !hasKey || !online || loading
  let disabledReason = ''
  if (!hasKey) disabledReason = 'Добавьте VITE_GROQ_API_KEY в .env.local и перезапустите dev-сервер.'
  else if (!online) disabledReason = 'Нет сети — подсказка недоступна.'

  return (
    <aside className="ai-hint-sidebar panel learn-hint-aside" aria-label="Подсказка ИИ">
      <div className="ai-hint-head">
        <span className="ai-hint-title">Подсказка ИИ</span>
        <span className="ai-hint-model muted small">{GROQ_MODEL_DEFAULT}</span>
      </div>

      <button
        type="button"
        className="btn-primary ai-hint-load"
        disabled={disabled}
        title={disabled ? disabledReason : 'Запросить подсказку у Groq'}
        onClick={() => void load()}
      >
        {loading ? 'Загрузка…' : 'Запросить подсказку'}
      </button>
      {!hasKey ? <p className="muted small ai-hint-warn">{disabledReason}</p> : null}
      {!online && hasKey ? <p className="muted small ai-hint-warn">{disabledReason}</p> : null}

      {err ? (
        <div className="ai-hint-error" role="alert">
          {err}
        </div>
      ) : null}

      {!hint && !loading && !err ? (
        <p className="muted small ai-hint-idle">По кнопке — краткий смысл, коллокации, пример (EN) и запрос для Pixabay.</p>
      ) : null}

      {hint ? (
        <div className="ai-hint-body">
          {hint.gist_ru ? (
            <section className="ai-hint-block">
              <h3 className="ai-hint-h">Смысл</h3>
              <p className="ai-hint-p">{hint.gist_ru}</p>
            </section>
          ) : null}

          {hint.collocations_en.length > 0 ? (
            <section className="ai-hint-block">
              <h3 className="ai-hint-h">Коллокации (EN)</h3>
              <ul className="ai-hint-ul">
                {hint.collocations_en.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {hint.example_en ? (
            <section className="ai-hint-block">
              <h3 className="ai-hint-h">Пример (EN)</h3>
              <p className="ai-hint-p ai-hint-mono">{hint.example_en}</p>
            </section>
          ) : null}

          {hint.register_note_ru ? (
            <section className="ai-hint-block">
              <h3 className="ai-hint-h">Регистр / стиль</h3>
              <p className="ai-hint-p">{hint.register_note_ru}</p>
            </section>
          ) : null}

          {hint.common_pitfall_ru ? (
            <section className="ai-hint-block">
              <h3 className="ai-hint-h">Ловушка</h3>
              <p className="ai-hint-p">{hint.common_pitfall_ru}</p>
            </section>
          ) : null}

          {hint.grammar_note_ru ? (
            <section className="ai-hint-block">
              <h3 className="ai-hint-h">Грамматика</h3>
              <p className="ai-hint-p">{hint.grammar_note_ru}</p>
            </section>
          ) : null}

          {hint.pixabay_query_en ? (
            <section className="ai-hint-block">
              <h3 className="ai-hint-h">Картинка (Pixabay)</h3>
              <p className="ai-hint-p ai-hint-mono">{hint.pixabay_query_en}</p>
              <a
                className="ai-hint-link"
                href={pixabaySearchUrl(hint.pixabay_query_en)}
                target="_blank"
                rel="noreferrer"
              >
                Открыть поиск на Pixabay
              </a>
            </section>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}
