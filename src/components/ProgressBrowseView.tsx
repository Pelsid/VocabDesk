import { useEffect, useMemo, useState } from 'react'
import type { Database } from 'sql.js'
import { fetchWordsByIds, listWordIdsInScope } from '../db/rewordDb'
import { parseExamples } from '../lib/examples'
import { formatDueLabel } from '../lib/srs'
import { useProgress } from '../context/ProgressContext'
import { getSchedule, type ProgressBrowseMode, matchesProgressBrowse } from '../study/localClassifier'
import { Highlighted } from './Highlighted'
import { StudyBadge } from './StudyBadge'

const MODE_COPY: Record<
  ProgressBrowseMode,
  { heading: string; hint: string }
> = {
  new_words: {
    heading: 'Новое',
    hint: 'Слова без записи в локальном SRS или со статусом «новое». Область та же, что и во вкладке «Учить».',
  },
  due_now: {
    heading: 'Повторение',
    hint: 'Карточки с наступившим сроком: повторение (review), доучивание (learning) и восстановление (relearn).',
  },
  learned_review: {
    heading: 'Изученное',
    hint: 'Интервальное повторение (review) и слова, отмеченные «Выучил навсегда».',
  },
}

function wordMatchesQuery(word: string, rus: string | null, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  return word.toLowerCase().includes(t) || (rus?.toLowerCase().includes(t) ?? false)
}

export function ProgressBrowseView(props: {
  db: Database
  mode: ProgressBrowseMode
  activeCategoryId: string | null
}) {
  const { snapshot, revision } = useProgress()
  const [scope, setScope] = useState<'selected' | 'category'>(() =>
    props.activeCategoryId ? 'category' : 'selected',
  )
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    if (!props.activeCategoryId && scope === 'category') setScope('selected')
  }, [props.activeCategoryId, scope])

  const now = Date.now()
  const copy = MODE_COPY[props.mode]

  const orderedIds = useMemo(() => {
    void revision
    const t = Date.now()
    const categoryId = scope === 'category' ? props.activeCategoryId : null
    const ids = listWordIdsInScope(props.db, scope, categoryId)
    type Item = { id: number; due: number }
    const picked: Item[] = []
    for (const id of ids) {
      const sched = getSchedule(snapshot.words, id)
      if (!matchesProgressBrowse(id, sched, props.mode, t, snapshot.mastered)) continue
      picked.push({ id, due: sched?.due ?? 0 })
    }
    if (props.mode === 'due_now') {
      picked.sort((a, b) => a.due - b.due)
    } else if (props.mode === 'learned_review') {
      picked.sort((a, b) => a.due - b.due)
    } else {
      picked.sort((a, b) => a.id - b.id)
    }
    return picked.map((p) => p.id)
  }, [props.db, props.mode, scope, props.activeCategoryId, snapshot.words, snapshot.mastered, revision])

  const rows = useMemo(() => {
    const words = fetchWordsByIds(props.db, orderedIds)
    const byId = new Map(words.map((w) => [w.id, w]))
    let list = orderedIds.map((id) => byId.get(id)).filter((w): w is NonNullable<typeof w> => Boolean(w))
    list = list.filter((w) => wordMatchesQuery(w.word, w.rus, q))
    if (props.mode === 'new_words') {
      list.sort((a, b) => a.word.localeCompare(b.word, 'und', { sensitivity: 'base' }))
    }
    return list.map((w) => ({
      w,
      sched: getSchedule(snapshot.words, w.id),
    }))
  }, [props.db, orderedIds, q, snapshot.words, props.mode])

  const scopeNote =
    scope === 'selected'
      ? 'Область: все словари с флагом «в обучении» в бэкапе'
      : props.activeCategoryId
        ? 'Область: только открытый во вкладке «Словарь» набор'
        : 'Откройте набор в «Словаре», чтобы включить «текущий словарь»'

  return (
    <div className="dictionary progress-browse">
      <section className="section">
        <div className="section-head">
          <h2>{copy.heading}</h2>
          <span className="muted small">{rows.length} слов в списке</span>
        </div>
        <p className="muted small browse-hint">{copy.hint}</p>

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
          <p className="muted small browse-scope-note">{scopeNote}</p>
        </div>

        <div className="subtoolbar">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Фильтр по слову / переводу"
            aria-label="Фильтр по слову или переводу"
          />
        </div>

        <div className="table">
          <div className="table-head row row-5">
            <div>Слово</div>
            <div>Перевод</div>
            <div>Статус</div>
            <div>Далее</div>
            <div>Медиа</div>
          </div>
          {rows.map(({ w, sched }) => {
            const open = openId === w.id
            const ex = parseExamples(w.examplesRus)
            const dueLine =
              props.mode === 'new_words' && (!sched || sched.bucket === 'new') ? (
                <span className="muted small">—</span>
              ) : sched ? (
                <span className="muted small">{formatDueLabel(sched, now)}</span>
              ) : (
                <span className="muted small">—</span>
              )
            return (
              <div key={w.id} className={`table-row ${open ? 'open' : ''}`}>
                <button
                  type="button"
                  className="row-main row-main-5"
                  onClick={() => setOpenId(open ? null : w.id)}
                >
                  <div className="w-word">
                    <span className="en">{w.word}</span>
                    {w.transcription ? <span className="ipa muted small">{w.transcription}</span> : null}
                  </div>
                  <div className="ru muted">{w.rus ?? '—'}</div>
                  <div>
                    <StudyBadge schedule={sched} now={now} />
                  </div>
                  <div>{dueLine}</div>
                  <div className="muted small">
                    {w.picBlobLen > 0 ? 'фото в бэкапе' : w.picSource ? `${w.picSource}` : '—'}
                  </div>
                </button>
                {open ? (
                  <div className="row-detail">
                    {ex.length ? (
                      <div className="examples">
                        <div className="muted small">Примеры</div>
                        <ul>
                          {ex.map((e, idx) => (
                            <li key={idx}>
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
                    ) : (
                      <div className="muted small">В бэкапе нет примеров для этого слова.</div>
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
