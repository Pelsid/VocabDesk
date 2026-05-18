import initSqlJs, { type Database } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import type { CategoryScopePrefs } from '../lib/progressTypes'

let cachedFactory: Awaited<ReturnType<typeof initSqlJs>> | null = null

async function getSqlFactory() {
  if (!cachedFactory) {
    cachedFactory = await initSqlJs({
      locateFile: () => sqlWasmUrl,
    })
  }
  return cachedFactory
}

export async function openRewordDatabase(buffer: ArrayBuffer): Promise<Database> {
  const SQL = await getSqlFactory()
  const u8 = new Uint8Array(buffer)
  return new SQL.Database(u8)
}

export interface CategoryStat {
  id: string
  name: string
  isCustom: boolean
  isSelected: boolean
  /** Редко заполнено в бэкапе: ключ вида book / advanced_words или пользовательский маркер */
  customIcon: string | null
  wordCount: number
  learnedCount: number
}

/** Базовая статистика по словарям из SQLite (learnedCount по полям Q_REC в файле .backup при необходимости пересчитайте в UI) */
export function listCategoryStats(db: Database): CategoryStat[] {
  const sql = `
    SELECT
      c.ID AS id,
      c.NAME_RUS AS name,
      c.IS_CUSTOM AS isCustom,
      c.IS_SELECTED AS isSelected,
      c.CUSTOM_ICON AS customIcon,
      COUNT(DISTINCT wc.WORD_ID) AS wordCount,
      SUM(CASE WHEN w.Q_REC >= 3 THEN 1 ELSE 0 END) AS learnedCount
    FROM CATEGORY c
    JOIN WORD_CATEGORY wc ON wc.CATEGORY_ID = c.ID
    JOIN WORD w ON w.ID = wc.WORD_ID
    WHERE c.NAME_RUS IS NOT NULL AND TRIM(c.NAME_RUS) <> ''
    GROUP BY c.ID
    ORDER BY c.IS_SELECTED DESC, name COLLATE NOCASE
  `
  const stmt = db.prepare(sql)
  const rows: CategoryStat[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({
      id: String(r.id),
      name: String(r.name ?? ''),
      isCustom: Number(r.isCustom) === 1,
      isSelected: Number(r.isSelected) === 1,
      customIcon: r.customIcon == null || String(r.customIcon).trim() === '' ? null : String(r.customIcon),
      wordCount: Number(r.wordCount ?? 0),
      learnedCount: Number(r.learnedCount ?? 0),
    })
  }
  stmt.free()
  return rows
}

export type WordFilter = 'all' | 'new' | 'learning' | 'review'

export interface WordRow {
  id: number
  word: string
  rus: string | null
  transcription: string | null
  qRec: number
  qRep: number
  examplesRus: string | null
  pictureId: number | null
  picSource: string | null
  picSourceId: string | null
  picBlobLen: number
}

export function listWordsInCategory(db: Database, categoryId: string, search: string): WordRow[] {
  const q = `%${search.trim().replace(/%/g, '').replace(/_/g, '')}%`
  const hasSearch = search.trim().length > 0

  const sql = `
    SELECT
      w.ID AS id,
      w.WORD AS word,
      w.RUS AS rus,
      w.TRANSCRIPTION AS transcription,
      w.Q_REC AS qRec,
      w.Q_REP AS qRep,
      w.EXAMPLES_RUS AS examplesRus,
      w.PICTURE_ID AS pictureId,
      p.SOURCE AS picSource,
      p.SOURCE_ID AS picSourceId,
      COALESCE(LENGTH(p.CONTENT), 0) AS picBlobLen
    FROM WORD w
    JOIN WORD_CATEGORY wc ON w.ID = wc.WORD_ID
    LEFT JOIN PICTURE p ON p.ID = w.PICTURE_ID
    WHERE wc.CATEGORY_ID = $cid
      ${hasSearch ? 'AND (w.WORD LIKE $q OR w.RUS LIKE $q)' : ''}
    ORDER BY w.WORD COLLATE NOCASE
  `

  const stmt = db.prepare(sql)
  stmt.bind({ $cid: categoryId, ...(hasSearch ? { $q: q } : {}) })

  const rows: WordRow[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push(mapWordRow(r))
  }
  stmt.free()
  return rows
}

function mapWordRow(r: Record<string, unknown>): WordRow {
  return {
    id: Number(r.id),
    word: String(r.word ?? ''),
    rus: r.rus == null ? null : String(r.rus),
    transcription: r.transcription == null ? null : String(r.transcription),
    qRec: Number(r.qRec ?? 0),
    qRep: Number(r.qRep ?? 0),
    examplesRus: r.examplesRus == null ? null : String(r.examplesRus),
    pictureId: r.pictureId == null ? null : Number(r.pictureId),
    picSource: r.picSource == null ? null : String(r.picSource),
    picSourceId: r.picSourceId == null ? null : String(r.picSourceId),
    picBlobLen: Number(r.picBlobLen ?? 0),
  }
}

export function getPictureBlob(db: Database, pictureId: number): Uint8Array | null {
  const stmt = db.prepare('SELECT CONTENT FROM PICTURE WHERE ID = $id LIMIT 1')
  stmt.bind({ $id: pictureId })
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.getAsObject() as { CONTENT?: Uint8Array | null }
  stmt.free()
  const c = row.CONTENT
  if (!c || !(c instanceof Uint8Array) || c.byteLength === 0) return null
  return c
}

export function globalSearchWords(db: Database, term: string, limit = 80): WordRow[] {
  const q = `%${term.trim().replace(/%/g, '').replace(/_/g, '')}%`
  if (term.trim().length < 2) return []

  const sql = `
    SELECT
      w.ID AS id,
      w.WORD AS word,
      w.RUS AS rus,
      w.TRANSCRIPTION AS transcription,
      w.Q_REC AS qRec,
      w.Q_REP AS qRep,
      w.EXAMPLES_RUS AS examplesRus,
      w.PICTURE_ID AS pictureId,
      p.SOURCE AS picSource,
      p.SOURCE_ID AS picSourceId,
      COALESCE(LENGTH(p.CONTENT), 0) AS picBlobLen
    FROM WORD w
    LEFT JOIN PICTURE p ON p.ID = w.PICTURE_ID
    WHERE w.WORD LIKE $q OR w.RUS LIKE $q
    ORDER BY w.WORD COLLATE NOCASE
    LIMIT $lim
  `
  const stmt = db.prepare(sql)
  stmt.bind({ $q: q, $lim: limit })
  const rows: WordRow[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push(mapWordRow(r))
  }
  stmt.free()
  return rows
}

function isCustomSelectedScope(scopePrefs?: CategoryScopePrefs | null): boolean {
  return scopePrefs?.categoryScopeMode === 'custom'
}

function categoryInClausePlaceholders(ids: string[]): string {
  return ids.map((_, i) => `$c${i}`).join(', ')
}

function bindCategoryIds(ids: string[]): Record<string, string> {
  const o: Record<string, string> = {}
  ids.forEach((id, i) => {
    o[`$c${i}`] = id
  })
  return o
}

export function listWordIdsInScope(
  db: Database,
  scope: 'selected' | 'category',
  categoryId: string | null,
  scopePrefs?: CategoryScopePrefs | null,
): number[] {
  if (scope === 'category' && !categoryId) return []

  if (scope === 'selected' && isCustomSelectedScope(scopePrefs)) {
    const cids = scopePrefs!.customCategoryIds ?? []
    if (cids.length === 0) return []

    const stmt = db.prepare(`
      SELECT DISTINCT w.ID AS id
      FROM WORD w
      JOIN WORD_CATEGORY wc ON wc.WORD_ID = w.ID
      WHERE wc.CATEGORY_ID IN (${categoryInClausePlaceholders(cids)})
      ORDER BY w.ID
    `)
    stmt.bind(bindCategoryIds(cids))
    const ids: number[] = []
    while (stmt.step()) {
      const r = stmt.getAsObject() as Record<string, unknown>
      ids.push(Number(r.id))
    }
    stmt.free()
    return ids
  }

  const sqlSelected = `
    SELECT DISTINCT w.ID AS id
    FROM WORD w
    JOIN WORD_CATEGORY wc ON wc.WORD_ID = w.ID
    JOIN CATEGORY c ON c.ID = wc.CATEGORY_ID AND c.IS_SELECTED = 1
    ORDER BY w.ID
  `
  const sqlCategory = `
    SELECT DISTINCT w.ID AS id
    FROM WORD w
    JOIN WORD_CATEGORY wc ON wc.WORD_ID = w.ID
    WHERE wc.CATEGORY_ID = $cid
    ORDER BY w.ID
  `

  const stmt = db.prepare(scope === 'selected' ? sqlSelected : sqlCategory)
  if (scope === 'category') stmt.bind({ $cid: categoryId })

  const ids: number[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    ids.push(Number(r.id))
  }
  stmt.free()
  return ids
}

/** Случайные переводы (RUS) из той же области — для вариантов в тесте с выбором ответа */
export function sampleRusTranslationsForQuiz(
  db: Database,
  scope: 'selected' | 'category',
  categoryId: string | null,
  excludeId: number,
  limit: number,
  scopePrefs?: CategoryScopePrefs | null,
): string[] {
  if (scope === 'category' && !categoryId) return []

  if (scope === 'selected' && isCustomSelectedScope(scopePrefs)) {
    const cids = scopePrefs!.customCategoryIds ?? []
    if (cids.length === 0) return []

    const stmt = db.prepare(`
      SELECT DISTINCT TRIM(w.RUS) AS rus
      FROM WORD w
      JOIN WORD_CATEGORY wc ON wc.WORD_ID = w.ID
      WHERE wc.CATEGORY_ID IN (${categoryInClausePlaceholders(cids)})
        AND w.ID != $ex
        AND w.RUS IS NOT NULL AND TRIM(w.RUS) != ''
      ORDER BY RANDOM()
      LIMIT $lim
    `)
    stmt.bind({ ...bindCategoryIds(cids), $ex: excludeId, $lim: limit })
    const out: string[] = []
    while (stmt.step()) {
      const r = stmt.getAsObject() as Record<string, unknown>
      const t = String(r.rus ?? '').trim()
      if (t.length >= 2) out.push(t)
    }
    stmt.free()
    return out
  }

  const sqlSelected = `
    SELECT DISTINCT TRIM(w.RUS) AS rus
    FROM WORD w
    JOIN WORD_CATEGORY wc ON wc.WORD_ID = w.ID
    JOIN CATEGORY c ON c.ID = wc.CATEGORY_ID AND c.IS_SELECTED = 1
    WHERE w.ID != $ex
      AND w.RUS IS NOT NULL AND TRIM(w.RUS) != ''
    ORDER BY RANDOM()
    LIMIT $lim
  `
  const sqlCategory = `
    SELECT DISTINCT TRIM(w.RUS) AS rus
    FROM WORD w
    JOIN WORD_CATEGORY wc ON wc.WORD_ID = w.ID
    WHERE wc.CATEGORY_ID = $cid
      AND w.ID != $ex
      AND w.RUS IS NOT NULL AND TRIM(w.RUS) != ''
    ORDER BY RANDOM()
    LIMIT $lim
  `

  const stmt = db.prepare(scope === 'selected' ? sqlSelected : sqlCategory)
  if (scope === 'category') stmt.bind({ $cid: categoryId, $ex: excludeId, $lim: limit })
  else stmt.bind({ $ex: excludeId, $lim: limit })

  const out: string[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    const t = String(r.rus ?? '').trim()
    if (t.length >= 2) out.push(t)
  }
  stmt.free()
  return out
}

export function listWordIdsInCategory(db: Database, categoryId: string): number[] {
  const stmt = db.prepare(`
    SELECT DISTINCT w.ID AS id
    FROM WORD w
    JOIN WORD_CATEGORY wc ON wc.WORD_ID = w.ID
    WHERE wc.CATEGORY_ID = $cid
    ORDER BY w.ID
  `)
  stmt.bind({ $cid: categoryId })
  const ids: number[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    ids.push(Number(r.id))
  }
  stmt.free()
  return ids
}

export function fetchWordsByIds(db: Database, ids: number[]): WordRow[] {
  if (!ids.length) return []

  const out: WordRow[] = []
  const chunkSize = 400
  for (let i = 0; i < ids.length; i += chunkSize) {
    const part = ids.slice(i, i + chunkSize)
    const inList = part.join(',')
    const sql = `
      SELECT
        w.ID AS id,
        w.WORD AS word,
        w.RUS AS rus,
        w.TRANSCRIPTION AS transcription,
        w.Q_REC AS qRec,
        w.Q_REP AS qRep,
        w.EXAMPLES_RUS AS examplesRus,
        w.PICTURE_ID AS pictureId,
        p.SOURCE AS picSource,
        p.SOURCE_ID AS picSourceId,
        COALESCE(LENGTH(p.CONTENT), 0) AS picBlobLen
      FROM WORD w
      LEFT JOIN PICTURE p ON p.ID = w.PICTURE_ID
      WHERE w.ID IN (${inList})
    `
    const stmt = db.prepare(sql)
    const map = new Map<number, WordRow>()
    while (stmt.step()) {
      const r = stmt.getAsObject() as Record<string, unknown>
      const row = mapWordRow(r)
      map.set(row.id, row)
    }
    stmt.free()

    for (const id of part) {
      const row = map.get(id)
      if (row) out.push(row)
    }
  }

  return out
}
