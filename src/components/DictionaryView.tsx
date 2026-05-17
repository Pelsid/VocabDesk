import { useMemo, useState } from 'react'
import type { Database } from 'sql.js'
import type { CategoryStat } from '../db/rewordDb'
import { globalSearchWords, listWordIdsInCategory, listWordsInCategory, type WordFilter } from '../db/rewordDb'
import { Highlighted } from './Highlighted'
import { StudyBadge } from './StudyBadge'
import { parseExamples } from '../lib/examples'
import { useProgress } from '../context/ProgressContext'
import { getSchedule, isReviewStageForDictionaryPct, isWordMastered, matchesLocalFilter } from '../study/localClassifier'
import { getCategoryGlyph } from '../lib/categoryIcons'

export function DictionaryView(props: {
  db: Database
  categories: CategoryStat[]
  selectedId: string | null
  onSelectCategory: (id: string | null) => void
}) {
  const { snapshot, revision } = useProgress()
  const [globalQ, setGlobalQ] = useState('')
  const [onlySelectedCats, setOnlySelectedCats] = useState(false)

  const filteredCats = useMemo(() => {
    const base = onlySelectedCats ? props.categories.filter((c) => c.isSelected) : props.categories
    const q = globalQ.trim().toLowerCase()
    if (!q) return base
    return base.filter((c) => c.name.toLowerCase().includes(q))
  }, [props.categories, globalQ, onlySelectedCats])

  const enrichedCats = useMemo(() => {
    void revision
    return filteredCats.map((c) => {
      const ids = listWordIdsInCategory(props.db, c.id)
      const learnedLocal = ids.reduce(
        (acc, id) =>
          acc +
          (isReviewStageForDictionaryPct(getSchedule(snapshot.words, id), isWordMastered(snapshot.mastered, id))
            ? 1
            : 0),
        0,
      )
      const localPct = ids.length ? Math.round((learnedLocal / ids.length) * 100) : 0
      const backupPct = c.wordCount ? Math.round((c.learnedCount / c.wordCount) * 100) : 0
      return { c, localPct, backupPct }
    })
  }, [filteredCats, props.db, revision, snapshot.words, snapshot.mastered])

  const globalHits = useMemo(() => {
    if (globalQ.trim().length < 2) return []
    return globalSearchWords(props.db, globalQ, 60)
  }, [props.db, globalQ])

  const now = Date.now()

  return (
    <div className="dictionary">
      <div className="toolbar">
        <div className="field">
          <span className="field-label">Поиск</span>
          <input
            value={globalQ}
            onChange={(e) => setGlobalQ(e.target.value)}
            placeholder="Категория или слово (от 2 букв для слов)"
          />
        </div>
        <label className="toggle">
          <input type="checkbox" checked={onlySelectedCats} onChange={(e) => setOnlySelectedCats(e.target.checked)} />
          Только активные словари из файла экспорта
        </label>
      </div>

      {globalQ.trim().length >= 2 ? (
        <section className="section dictionary-global-hits">
          <div className="section-head">
            <h2>Слова по запросу</h2>
            <span className="muted small">{globalHits.length} совпадений (лимит 60)</span>
          </div>
          <div className="hits">
            {globalHits.map((w) => (
              <div key={w.id} className="hit">
                <span className="hit-word">{w.word}</span>
                <span className="muted">{w.rus ?? '—'}</span>
                <StudyBadge
                  schedule={getSchedule(snapshot.words, w.id)}
                  now={now}
                  mastered={isWordMastered(snapshot.mastered, w.id)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className={props.selectedId ? 'dictionary-columns' : 'dictionary-columns dictionary-columns-single'}>
        <section className="section dictionary-cats-pane">
          <div className="section-head">
            <h2>Словари</h2>
            <span className="muted small">{enrichedCats.length} наборов</span>
          </div>
          <div className="cat-grid">
            {enrichedCats.map(({ c, localPct, backupPct }) => {
              const active = props.selectedId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`cat-card ${active ? 'active' : ''}`}
                  onClick={() => props.onSelectCategory(c.id)}
                >
                  <div className="cat-top">
                    <span className="cat-icon" aria-hidden title="Иконка словаря">
                      {getCategoryGlyph(c.id, c.customIcon)}
                    </span>
                    <div className="cat-name-block">
                      <div className="cat-name">{c.name}</div>
                    </div>
                    <div
                      className={`pct ${c.isSelected ? 'on' : 'off'}`}
                      title="Словарь помечен как активный для обучения в приложении экспорта"
                    >
                      {c.isSelected ? 'в обучении' : 'архив'}
                    </div>
                  </div>
                  <div className="cat-meta muted small">
                    {c.wordCount} слов · здесь после изучения (аналог Q≥3): {localPct}% · в файле .backup (Q≥3):{' '}
                    {backupPct}%
                  </div>
                  <div className="progress">
                    <div className="progress-bar local" style={{ width: `${localPct}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {props.selectedId ? (
          <div className="dictionary-words-pane">
            <WordListPanel
              db={props.db}
              categoryId={props.selectedId}
              categoryName={props.categories.find((x) => x.id === props.selectedId)?.name ?? ''}
              categoryGlyph={getCategoryGlyph(
                props.selectedId,
                props.categories.find((x) => x.id === props.selectedId)?.customIcon ?? null,
              )}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function WordListPanel(props: {
  db: Database
  categoryId: string
  categoryName: string
  categoryGlyph: string
}) {
  const { snapshot, revision } = useProgress()
  const [filter, setFilter] = useState<WordFilter>('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  const rowsAll = useMemo(() => listWordsInCategory(props.db, props.categoryId, q), [props.db, props.categoryId, q])

  const rows = useMemo(() => {
    void revision
    const now = Date.now()
    return rowsAll
      .filter((w) => matchesLocalFilter(getSchedule(snapshot.words, w.id), filter, w.id, snapshot.mastered))
      .map((w) => ({
        w,
        sched: getSchedule(snapshot.words, w.id),
        now,
      }))
  }, [rowsAll, snapshot.words, snapshot.mastered, filter, revision])

  return (
    <section className="section">
      <div className="section-head section-head-with-icon">
        <h2>
          <span className="section-icon" aria-hidden>
            {props.categoryGlyph}
          </span>
          {props.categoryName}
        </h2>
        <span className="muted small">{rows.length} слов в списке</span>
      </div>

      <div className="subtoolbar">
        <div className="seg">
          {(
            [
              ['all', 'Все'],
              ['new', 'Новые'],
              ['learning', 'Изучение'],
              ['review', 'Повторение'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фильтр по слову / переводу" />
      </div>

      <div className="table">
        <div className="table-head row">
          <div>Слово</div>
          <div>Перевод</div>
          <div>Статус</div>
          <div>Медиа</div>
        </div>
        {rows.map(({ w, sched, now }) => {
          const open = openId === w.id
          const ex = parseExamples(w.examplesRus)
          return (
            <div key={w.id} className={`table-row ${open ? 'open' : ''}`}>
              <button type="button" className="row-main" onClick={() => setOpenId(open ? null : w.id)}>
                <div className="w-word">
                  <span className="en">{w.word}</span>
                  {w.transcription ? <span className="ipa muted small">{w.transcription}</span> : null}
                </div>
                <div className="ru muted">{w.rus ?? '—'}</div>
                <div>
                  <StudyBadge
                    schedule={sched}
                    now={now}
                    mastered={isWordMastered(snapshot.mastered, w.id)}
                  />
                </div>
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
  )
}
