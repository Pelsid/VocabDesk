import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import type { Database } from 'sql.js'
import {
  fetchWordsByIds,
  getPictureBlob,
  listWordIdsInScope,
  sampleRusTranslationsForQuiz,
  type WordRow,
} from '../db/rewordDb'
import { parseExamples, stripHighlights } from '../lib/examples'
import { uint8ToObjectUrl } from '../lib/imageBlob'
import { DEFAULT_PREFS, type CardSchedule, type Grade } from '../lib/progressTypes'
import { formatDueLabel } from '../lib/srs'
import { REMOTE_PICTURE_MAX, resolveRemotePictureUrls } from '../lib/remotePictureUrl'
import { matchesTranslation } from '../lib/text'
import { useProgress } from '../context/ProgressContext'
import { buildSessionQueue, countDueSnapshot } from '../study/sessionQueue'
import { bumpDailyLearned, getDailyLearnedCount } from '../lib/dailyLearned'
import { Highlighted } from './Highlighted'
import { AiHintSidebar } from './AiHintSidebar'
import { StudyBadge } from './StudyBadge'

type StudyInteractionMode = 'type' | 'reveal' | 'choice'

/** «Новое / изучение» — два действия перед оценкой; повторение — после ответа оценки 1–4 */
function isYoungCardSchedule(sched: CardSchedule | null): boolean {
  if (!sched) return true
  return sched.bucket === 'new' || sched.bucket === 'learning'
}

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

export function LearnView(props: { db: Database; activeCategoryId: string | null }) {
  const { snapshot, revision, gradeWord, updatePrefs, markWordMastered } = useProgress()

  const [scope, setScope] = useState<'selected' | 'category'>(
    props.activeCategoryId ? 'category' : 'selected',
  )
  const [queue, setQueue] = useState<WordRow[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [todayLearned, setTodayLearned] = useState(() => getDailyLearnedCount())

  useEffect(() => {
    if (!queue) setTodayLearned(getDailyLearnedCount())
  }, [queue])

  const recordCardStudied = useCallback(() => {
    bumpDailyLearned()
    setTodayLearned(getDailyLearnedCount())
  }, [])

  useEffect(() => {
    if (!props.activeCategoryId && scope === 'category') setScope('selected')
  }, [props.activeCategoryId, scope])

  const counts = useMemo(() => {
    const t = Date.now()
    const cid = scope === 'category' ? props.activeCategoryId : null
    return countDueSnapshot({ db: props.db, scope, categoryId: cid, snapshot, now: t })
  }, [props.db, props.activeCategoryId, scope, snapshot, revision])

  const scopeCategoryId = scope === 'category' ? props.activeCategoryId : null
  const allScopeIds = useMemo(
    () => listWordIdsInScope(props.db, scope, scopeCategoryId),
    [props.db, scope, scopeCategoryId],
  )
  const wordsInScopeTotal = allScopeIds.length

  const start = () => {
    const cid = scope === 'category' ? props.activeCategoryId : null
    const ids = buildSessionQueue({ db: props.db, scope, categoryId: cid, snapshot, now: Date.now() })
    if (!ids.length) {
      setQueue(null)
      setIdx(0)
      return
    }
    const rows = fetchWordsByIds(props.db, ids)
    if (!rows.length) {
      setQueue(null)
      setIdx(0)
      return
    }
    setQueue(rows)
    setIdx(0)
  }

  const stop = useCallback(() => {
    setQueue(null)
    setIdx(0)
  }, [])

  const done = Boolean(queue && idx >= queue.length)
  const cur = queue && !done ? queue[idx] : null

  const deferCurrentInSession = useCallback(() => {
    if (!queue?.length || !cur) return
    const span = 3 + Math.floor(Math.random() * 5)
    setQueue((q) => {
      if (!q?.length) return q
      const copy = q.slice()
      const insertAt = Math.min(idx + 1 + span, copy.length)
      copy.splice(insertAt, 0, cur)
      return copy
    })
    setIdx((i) => i + 1)
  }, [queue, cur, idx])

  useEffect(() => {
    if (!queue?.length) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [queue, stop])

  /** Пустая очередь или пропуск в массиве — не оставляем «пустой» экран сессии */
  useEffect(() => {
    if (queue == null) return
    if (queue.length === 0) {
      stop()
      return
    }
    if (idx < queue.length && queue[idx] === undefined) {
      setIdx(queue.length)
    }
  }, [queue, idx, stop])

  if (!queue) {
    const prefs = { ...DEFAULT_PREFS, ...snapshot.prefs }
    const goal = Math.max(5, Math.min(99, prefs.dailyGoalWords || 15))
    const scopeSubtitle =
      scope === 'selected'
        ? 'Все словари с флагом «в обучении» из бэкапа'
        : props.activeCategoryId
          ? 'Только открытый во вкладке «Словарь» словарь'
          : 'Сначала откройте словарь — эта опция недоступна'

    return (
      <div className="dictionary learn-view">
        <section className="section">
          <div className="section-head">
            <h2>Учить</h2>
            <span className="muted small">
              Сегодня: {todayLearned} / {goal}
            </span>
          </div>
          <p className="muted small browse-hint">
            Одна сессия смешивает просроченные повторения, карточки в обучении и новые слова — в пределах лимитов ниже.
            После ответа оценка (или «Выучил навсегда») сохраняется только в этом браузере.
          </p>

          {counts.total === 0 && wordsInScopeTotal > 0 ? (
            <div className="panel learn-empty-scope" role="status">
              <p className="learn-empty-title">В очереди «Учить» пока нечего показывать</p>
              <p className="muted small">
                Все <strong>{wordsInScopeTotal}</strong> слов в этой области помечены «выучил навсегда» — в смешанной сессии больше нечего показывать. Слова остаются в словаре и во вкладке «Изученное».
              </p>
              <p className="muted small">
                Чтобы снова повторять слова: сбросьте локальный прогресс или импортируйте прогресс заново — меню
                «Данные» в правом верхнем углу (или отредактируйте JSON прогресса и уберите лишние id из поля{' '}
                <code className="learn-code">mastered</code>).
              </p>
            </div>
          ) : null}

          {wordsInScopeTotal === 0 ? (
            <div className="panel learn-empty-scope" role="status">
              <p className="learn-empty-title">В этой области нет слов</p>
              <p className="muted small">
                Выберите «Все выбранные» или откройте набор в «Словаре» и включите «текущий словарь».
              </p>
            </div>
          ) : null}

          <div className="learn-landing-grid">
            <div className="learn-landing-col">
              <div className="learn-week-strip" aria-hidden>
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((abbr, i) => {
                  const d = new Date().getDay()
                  const curDay = d === 0 ? 6 : d - 1
                  return (
                    <span key={abbr} className={`learn-wday ${i === curDay ? 'active' : ''}`}>
                      {abbr}
                    </span>
                  )
                })}
              </div>

              <div className="panel learn-daily-panel">
                <div className="learn-daily-panel-inner">
                  <div className="learn-daily-ring-wrap">
                    <DailyProgressRing done={todayLearned} goal={goal} />
                  </div>
                  <div className="learn-daily-copy">
                    <div className="learn-daily-title">Выучено сегодня</div>
                    <div className="learn-daily-stats-row">
                      <span className="learn-daily-big">{todayLearned}</span>
                      <span className="learn-daily-slash">/</span>
                      <label className="learn-daily-goal-label">
                        <span className="sr-only">Цель на день</span>
                        <input
                          type="number"
                          className="learn-daily-goal-input"
                          min={5}
                          max={99}
                          value={goal}
                          onChange={(e) => {
                            const n = Number(e.target.value)
                            if (!Number.isFinite(n)) return
                            updatePrefs({ dailyGoalWords: Math.max(5, Math.min(99, Math.floor(n))) })
                          }}
                        />
                      </label>
                    </div>
                    <p className="muted small learn-daily-hint">
                      Каждая оценённая карточка увеличивает счётчик. Цель можно править числом справа.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="learn-landing-col">
              <div className="browse-scope">
                <span className="field-label">Область</span>
                <div className="learn-scope-switch">
                  <button
                    type="button"
                    className={scope === 'selected' ? 'active' : ''}
                    onClick={() => setScope('selected')}
                  >
                    Все выбранные
                  </button>
                  <button
                    type="button"
                    className={scope === 'category' ? 'active' : ''}
                    disabled={!props.activeCategoryId}
                    onClick={() => setScope('category')}
                  >
                    Текущий словарь
                  </button>
                </div>
                <p className="muted small browse-scope-note">{scopeSubtitle}</p>
              </div>

              <div className="panel learn-queue-summary">
                <span className="field-label">Очередь сессии</span>
                <ul className="learn-queue-list">
                  <li>
                    <span className="muted">Новых в запасе</span>{' '}
                    <strong>{counts.fresh}</strong>
                    <span className="muted"> · взять за раз до </span>
                    <strong>{prefs.newPerSession}</strong>
                  </li>
                  <li>
                    <span className="muted">К повторению сейчас</span> <strong>{counts.due}</strong>
                    <span className="muted"> · в очередь до </span>
                    <strong>{prefs.reviewPerSession}</strong>
                  </li>
                  <li>
                    <span className="muted">Активных слов в области (без «навсегда»)</span>{' '}
                    <strong>{counts.total}</strong>
                  </li>
                </ul>
              </div>

              <details className="panel learn-advanced-panel">
                <summary className="learn-advanced-summary">Лимиты SRS (дополнительно)</summary>
                <div className="learn-advanced-body">
                  <div className="slider-row">
                    <div className="muted small">Новых за сессию: {prefs.newPerSession}</div>
                    <input
                      type="range"
                      min={5}
                      max={120}
                      step={5}
                      value={prefs.newPerSession}
                      onChange={(e) => updatePrefs({ newPerSession: Number(e.target.value) })}
                    />
                  </div>
                  <div className="slider-row">
                    <div className="muted small">Повторений за сессию: {prefs.reviewPerSession}</div>
                    <input
                      type="range"
                      min={20}
                      max={400}
                      step={10}
                      value={prefs.reviewPerSession}
                      onChange={(e) => updatePrefs({ reviewPerSession: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </details>

              <button
                type="button"
                className="btn-primary learn-start-btn"
                onClick={start}
                disabled={counts.total === 0}
              >
                Начать сессию
              </button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  const sched = cur ? (snapshot.words[String(cur.id)] ?? null) : null
  const youngCard = cur ? isYoungCardSchedule(sched) : false
  const progressPct = queue && queue.length > 0 ? Math.min(100, Math.round(((idx + 1) / queue.length) * 100)) : 0

  return (
    <div className="dictionary learn-view learn-session-active">
      <section className="section learn-session-section">
        <div className="learn-session-toolbar">
          <div>
            <h2>Сессия</h2>
            <p className="muted small learn-session-meta">
              {done
                ? 'Все карточки этой сессии пройдены'
                : queue && queue.length > 0
                  ? `Карточка ${idx + 1} из ${queue.length}`
                  : 'Сессия'}
            </p>
          </div>
          <button type="button" className="btn-quiet" onClick={stop}>
            Закончить сессию
          </button>
        </div>

        {!done && queue && queue.length > 0 ? (
          <div className="learn-progress-block">
            <div
              className="learn-progress-track"
              role="progressbar"
              aria-valuenow={idx + 1}
              aria-valuemin={1}
              aria-valuemax={queue.length}
              aria-label={`Прогресс: ${idx + 1} из ${queue.length}`}
            >
              <div className="learn-progress-value" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="muted small learn-progress-pct">{progressPct}%</span>
          </div>
        ) : null}

        {done ? (
          <div className="panel learn-done-panel">
            <h3 className="learn-done-title">Отличная работа</h3>
            <p className="muted small">Прогресс сохранён в браузере. Карточки вернутся по расписанию SRS.</p>
            <button type="button" className="btn-primary" onClick={stop}>
              Вернуться к экрану «Учить»
            </button>
          </div>
        ) : cur ? (
          <SessionStudyCard
            key={`${cur.id}-${idx}`}
            db={props.db}
            word={cur}
            schedule={sched}
            variantIsYoung={youngCard}
            scope={scope}
            categoryId={scope === 'category' ? props.activeCategoryId : null}
            onMemorized={() => {
              gradeWord(cur.id, 'good')
              recordCardStudied()
              setIdx((i) => i + 1)
            }}
            onGrade={(g) => {
              gradeWord(cur.id, g)
              recordCardStudied()
              setIdx((i) => i + 1)
            }}
            onMarkMasteredForever={() => {
              markWordMastered(cur.id)
              recordCardStudied()
              setIdx((i) => i + 1)
            }}
            onDeferInSession={deferCurrentInSession}
          />
        ) : (
          <div className="panel learn-session-fallback" role="status">
            <p className="muted small">
              Не удалось показать карточку (сессия могла устареть). Нажмите «Закончить сессию» и начните заново.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function SessionStudyCard(props: {
  db: Database
  word: WordRow
  schedule: CardSchedule | null
  variantIsYoung: boolean
  scope: 'selected' | 'category'
  categoryId: string | null
  onMemorized: () => void
  onGrade: (g: Grade) => void
  onDeferInSession: () => void
  onMarkMasteredForever: () => void
}) {
  const now = Date.now()
  const young = props.variantIsYoung
  const [mode, setMode] = useState<StudyInteractionMode>('choice')
  const [revealed, setRevealed] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [mediaNotice, setMediaNotice] = useState<string | null>(null)
  const [guess, setGuess] = useState('')
  const [typingSkipped, setTypingSkipped] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  /** Были успешно получены URL с Pixabay/Pexels — чтобы показать сообщение, если все <img> сорвались */
  const galleryRemoteOkRef = useRef(false)

  const onGradeRef = useRef(props.onGrade)
  useEffect(() => {
    onGradeRef.current = props.onGrade
  }, [props.onGrade])

  const ex = useMemo(() => parseExamples(props.word.examplesRus), [props.word.examplesRus])

  const exampleEnglishLines = useMemo(
    () =>
      ex
        .map((e) => stripHighlights(e.original).trim())
        .filter(Boolean)
        .slice(0, 4),
    [ex],
  )

  const cardTitle = young ? 'Изучение нового слова' : 'Повторение слова'

  useEffect(() => {
    setMode('choice')
    setRevealed(false)
    setGuess('')
    setTypingSkipped(false)
    setPicked(null)
  }, [props.word.id])

  useEffect(() => {
    let cancelled = false
    let blobObjectUrl: string | null = null

    galleryRemoteOkRef.current = false
    setMediaNotice(null)

    if (props.word.pictureId && props.word.picBlobLen > 0) {
      const bytes = getPictureBlob(props.db, props.word.pictureId)
      blobObjectUrl = bytes ? uint8ToObjectUrl(bytes) : null
      if (!cancelled) {
        setImageUrls(blobObjectUrl ? [blobObjectUrl] : [])
        if (!blobObjectUrl) {
          setMediaNotice('Фото указано в бэкапе, но данные не прочитаны.')
        }
      }
      return () => {
        cancelled = true
        if (blobObjectUrl) URL.revokeObjectURL(blobObjectUrl)
      }
    }

    setImageUrls([])

    void (async () => {
      const urls = await resolveRemotePictureUrls(props.word, REMOTE_PICTURE_MAX)
      if (cancelled) return
      if (urls.length > 0) {
        galleryRemoteOkRef.current = true
        setImageUrls(urls)
        setMediaNotice(null)
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
      setMediaNotice(meta ? `${meta}${hint}` : hint)
    })()

    return () => {
      cancelled = true
    }
  }, [
    props.db,
    props.word.id,
    props.word.word,
    props.word.pictureId,
    props.word.picBlobLen,
    props.word.picSource,
    props.word.picSourceId,
  ])

  useEffect(() => {
    if (imageUrls.length > 0) return
    if (!galleryRemoteOkRef.current) return
    galleryRemoteOkRef.current = false
    setMediaNotice('Изображения по ссылке не открылись (блокировка, сеть или устаревший URL).')
  }, [imageUrls.length, props.word.id])

  const distractors = useMemo(
    () => sampleRusTranslationsForQuiz(props.db, props.scope, props.categoryId, props.word.id, 48),
    [props.db, props.scope, props.categoryId, props.word.id],
  )

  const mcOptions = useMemo(() => {
    const correct = props.word.rus?.trim() ?? ''
    if (!correct) return []
    const uniq = new Set<string>()
    uniq.add(correct)
    for (const d of distractors) {
      if (normalizeForMc(d) === normalizeForMc(correct)) continue
      uniq.add(d)
      if (uniq.size >= 4) break
    }
    return shuffleArray([...uniq])
  }, [distractors, props.word.rus])

  const translationKnown =
    revealed ||
    (picked != null && props.word.rus != null && matchesTranslation(picked, props.word.rus)) ||
    (mode === 'type' && matchesTranslation(guess, props.word.rus))

  const canReveal =
    mode !== 'type' || typingSkipped || matchesTranslation(guess, props.word.rus) || guess.trim().length === 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && mode === 'reveal' && !translationKnown && canReveal) {
        e.preventDefault()
        setRevealed(true)
      }
      if (!young && translationKnown) {
        if (e.key === '1') onGradeRef.current('again')
        if (e.key === '2') onGradeRef.current('hard')
        if (e.key === '3') onGradeRef.current('good')
        if (e.key === '4') onGradeRef.current('easy')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, translationKnown, canReveal, young])

  const scheduleTitle = props.schedule ? formatDueLabel(props.schedule, now) : 'ещё не начато'

  const onMcPick = (label: string) => {
    if (!props.word.rus) return
    setPicked(label)
    if (matchesTranslation(label, props.word.rus)) setRevealed(true)
  }

  return (
    <div className="study-with-hint">
        <div className="study-layout">
          <div className="study-session-card panel">
            <header className="study-session-card-head">
              <span className="study-session-kind">{cardTitle}</span>
              <div className="study-session-card-meta">
                <StudyBadge schedule={props.schedule} now={now} />
                <span className="muted small due-pill">{scheduleTitle}</span>
              </div>
            </header>

            {imageUrls.length > 0 ? (
              <div
                className={`study-word-media${imageUrls.length === 1 ? ' study-word-media--solo' : ''}`}
              >
                {imageUrls.map((url, i) => (
                  <img
                    key={`${props.word.id}-${i}-${url.slice(0, 48)}`}
                    className="study-word-thumb"
                    alt=""
                    src={url}
                    onError={(e) => {
                      const failed = (e.currentTarget as HTMLImageElement).src
                      if (failed.startsWith('blob:')) {
                        setImageUrls([])
                        setMediaNotice('Фото из бэкапа не отображается.')
                        return
                      }
                      setImageUrls((prev) => prev.filter((u) => u !== failed))
                    }}
                  />
                ))}
              </div>
            ) : null}

            <div className="study-word-block">
              <div className="study-lemma">{props.word.word}</div>
              {props.word.transcription ? (
                <div className="ipa muted study-transcription">{props.word.transcription}</div>
              ) : null}
            </div>
            {mediaNotice ? (
              <div className="study-media-notice" role="note">
                <span className="study-media-notice-label">Медиа</span>
                <span className="study-media-notice-text">{mediaNotice}</span>
              </div>
            ) : null}

        <div className="study-mode-bar" role="tablist" aria-label="Способ ответа">
          <button
            type="button"
            role="tab"
            className={`study-mode-btn ${mode === 'type' ? 'active' : ''}`}
            aria-selected={mode === 'type'}
            onClick={() => {
              setMode('type')
              setPicked(null)
              setRevealed(false)
            }}
          >
            <span className="mode-glyph" aria-hidden>
              ⌨
            </span>
            <span className="mode-label">Ввод</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`study-mode-btn ${mode === 'reveal' ? 'active' : ''}`}
            aria-selected={mode === 'reveal'}
            onClick={() => {
              setMode('reveal')
              setPicked(null)
              setRevealed(false)
            }}
          >
            <span className="mode-glyph" aria-hidden>
              👁
            </span>
            <span className="mode-label">Ответ</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`study-mode-btn ${mode === 'choice' ? 'active' : ''}`}
            aria-selected={mode === 'choice'}
            onClick={() => {
              setMode('choice')
              setPicked(null)
              setRevealed(false)
            }}
          >
            <span className="mode-glyph" aria-hidden>
              ⊞
            </span>
            <span className="mode-label">Тест</span>
          </button>
        </div>

        {mode === 'type' && !translationKnown ? (
          <div className="rep-box">
            <input
              autoFocus
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Наберите перевод (рус.)"
            />
            <div className="rep-actions">
              <button type="button" className="btn-quiet" onClick={() => setTypingSkipped(true)}>
                Не помню — показать
              </button>
              <button type="button" className="btn-primary" onClick={() => setRevealed(true)}>
                Проверить / показать
              </button>
            </div>
          </div>
        ) : null}

        {mode === 'reveal' && !translationKnown ? (
          <button type="button" className="btn-primary reveal-cta" onClick={() => setRevealed(true)}>
            Показать перевод
          </button>
        ) : null}

        {mode === 'choice' && !translationKnown && mcOptions.length > 0 ? (
          <div className="mc-grid">
            {mcOptions.map((label) => {
              const ok = props.word.rus != null && matchesTranslation(label, props.word.rus)
              const showResult = picked != null
              const pickedOk = picked != null && matchesTranslation(picked, props.word.rus)
              let cls = 'mc-option'
              if (showResult) {
                if (ok) cls += ' correct'
                else if (picked === label) cls += ' wrong'
                else if (!pickedOk && ok) cls += ' reveal-correct'
              }
              return (
                <button
                  type="button"
                  key={label.slice(0, 80) + '-' + normalizeForMc(label)}
                  className={cls}
                  onClick={() => onMcPick(label)}
                >
                  {label}
                </button>
              )
            })}
          </div>
        ) : null}

        {mode === 'choice' && !translationKnown && mcOptions.length === 0 ? (
          <div className="muted small centered-hint">Нет перевода в базе — переключитесь на «Ответ» или «Ввод».</div>
        ) : null}

        {picked != null && !translationKnown ? (
          <div className="muted small mc-hint">Не тот вариант — попробуйте ещё раз или откройте «Ответ».</div>
        ) : null}

            {translationKnown ? (
              <div className="answer-block study-answer-block">
                <div className="study-answer-label muted small">Перевод</div>
                <div className="big ru study-translation">{props.word.rus ?? '—'}</div>

            {ex.length ? (
              <div className="examples compact study-examples">
                <div className="muted small">Примеры</div>
                <ul>
                  {ex.map((e, i) => (
                    <li key={i}>
                      <div className="ex-o">
                        <Highlighted text={e.original} />
                      </div>
                      <div className="ex-t muted">
                        <Highlighted text={e.translate} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {young ? (
          <>
            <div className="reword-actions">
              <button type="button" className="reword-memorized" onClick={props.onMemorized}>
                Запомнил, отложить для повторения
              </button>
              <span className="reword-actions-divider" aria-hidden />
              <button type="button" className="reword-again" onClick={props.onDeferInSession}>
                Показать это слово ещё
              </button>
            </div>
            {translationKnown ? (
              <button type="button" className="btn-mastered" onClick={props.onMarkMasteredForever}>
                <span className="btn-mastered-title">Выучил навсегда</span>
                <span className="grade-hint">Не показывать в «Учить» и повторах</span>
              </button>
            ) : null}
            <p className="muted small kbd-center">
              «Запомнил» — следующий шаг в SRS (как «Хорошо»). «Ещё» — вернёт карточку позже в этой сессии. Пробел — в
              режиме «Ответ».
            </p>
          </>
        ) : (
          <>
            {translationKnown ? (
              <>
                <div className="grade-bar reword-grade-bar" role="group" aria-label="Оценка ответа">
                  <button type="button" className="grade again" onClick={() => props.onGrade('again')}>
                    <span className="grade-top">
                      Снова <span className="kbd-mini">1</span>
                    </span>
                    <span className="grade-hint">Скоро снова в очереди</span>
                  </button>
                  <button type="button" className="grade hard" onClick={() => props.onGrade('hard')}>
                    <span className="grade-top">
                      Сложно <span className="kbd-mini">2</span>
                    </span>
                    <span className="grade-hint">Короче интервал до следующего раза</span>
                  </button>
                  <button type="button" className="grade good" onClick={() => props.onGrade('good')}>
                    <span className="grade-top">
                      Хорошо <span className="kbd-mini">3</span>
                    </span>
                    <span className="grade-hint">Обычный шаг расписания</span>
                  </button>
                  <button type="button" className="grade easy" onClick={() => props.onGrade('easy')}>
                    <span className="grade-top">
                      Легко <span className="kbd-mini">4</span>
                    </span>
                    <span className="grade-hint">Дольше до следующего показа</span>
                  </button>
                </div>
                <button type="button" className="btn-mastered" onClick={props.onMarkMasteredForever}>
                  <span className="btn-mastered-title">Выучил навсегда</span>
                  <span className="grade-hint">Не показывать в «Учить» и повторах</span>
                </button>
                <div className="reword-actions defer-only">
                  <button type="button" className="reword-again" onClick={props.onDeferInSession}>
                    Показать это слово ещё
                  </button>
                </div>
                <p className="muted small kbd-center">После ответа: 1–4 · Esc — конец сессии</p>
              </>
            ) : (
              <>
                <div className="reword-actions defer-only">
                  <button type="button" className="reword-again" onClick={props.onDeferInSession}>
                    Показать это слово ещё
                  </button>
                </div>
                <p className="muted small kbd-center">Выберите режим, откройте перевод — затем оцените ответ клавишами 1–4.</p>
              </>
            )}
          </>
        )}
        </div>
      </div>
      <AiHintSidebar
        wordId={props.word.id}
        lemma={props.word.word}
        ipa={props.word.transcription}
        mode={mode}
        exampleEnglishLines={exampleEnglishLines}
      />
    </div>
  )
}

function DailyProgressRing(props: { done: number; goal: number }) {
  const g = Math.max(1, props.goal)
  const pct = Math.min(1, props.done / g)
  const r = 44
  const c = 2 * Math.PI * r
  const offset = c * (1 - pct)
  return (
    <svg width="108" height="108" viewBox="0 0 108 108" className="learn-daily-ring" aria-hidden>
      <circle className="learn-ring-bg" cx="54" cy="54" r={r} />
      <circle
        className="learn-ring-fg"
        cx="54"
        cy="54"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 54 54)"
      />
    </svg>
  )
}

function normalizeForMc(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[,.;]/g, '')
    .trim()
}
