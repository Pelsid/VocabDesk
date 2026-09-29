import { sessionDictScope } from '../lib/catalogScope'
import type { WordRow } from '../lib/catalogTypes'
import { DEFAULT_PREFS } from '../lib/progressTypes'
import { useCatalogStore } from '../stores/catalog'
import { useProgressStore } from '../stores/progress'
import { buildSessionQueue } from '../study/sessionQueue'
import type { GameWord } from './gameTypes'
import { pickMockWords } from './mockWords'

const MAX_TILE_TEXT = 18

function shortTranslation(rus: string | null | undefined): string {
  if (!rus) return ''
  const first = rus.split(/[,;/|]/)[0] ?? ''
  return first.replace(/\(.*?\)/g, '').trim()
}

function fromRow(row: WordRow): GameWord | null {
  const english = row.word?.trim() ?? ''
  const translation = shortTranslation(row.rus)
  if (!english || !translation) return null
  if (english.length > MAX_TILE_TEXT || translation.length > MAX_TILE_TEXT) return null
  if (english.toLowerCase() === translation.toLowerCase()) return null
  return {
    id: row.id,
    english,
    translation,
    level: row.levels?.[0] ?? 'A1',
  }
}

/**
 * Слова текущего уровня.
 * Сначала очередь обучения пользователя, затем mock, если пар не хватает.
 * Чтобы подключить другой источник, достаточно заменить тело этой функции.
 */
export async function getGameWords(count: number): Promise<GameWord[]> {
  const need = Math.max(1, count)
  const real: GameWord[] = []
  try {
    const catalog = useCatalogStore()
    const progress = useProgressStore()
    const prefs = { ...DEFAULT_PREFS, ...progress.snapshot.prefs }
    const scopePrefs = {
      categoryScopeMode: prefs.categoryScopeMode ?? 'reword',
      customCategoryIds: prefs.customCategoryIds ?? [],
    }
    const ids = catalog.idsInScope(sessionDictScope(prefs), null, scopePrefs)
    const queued = buildSessionQueue({ ids, snapshot: progress.snapshot, now: Date.now() })
    const queuedSet = new Set(queued)
    const rest = ids.filter((id) => !queuedSet.has(id))
    const pick = [...queued, ...rest].slice(0, Math.max(need * 3, need))
    if (pick.length) {
      const rows = await catalog.ensureWords(pick)
      const byId = new Map(rows.map((row) => [row.id, row]))
      for (const id of pick) {
        const row = byId.get(id)
        if (!row) continue
        const word = fromRow(row)
        if (!word) continue
        real.push(word)
        if (real.length >= need) break
      }
    }
  } catch {
    // Каталог недоступен — ниже доберём пары из mock.
  }

  if (real.length >= need) return real.slice(0, need)

  const used = new Set(real.map((word) => word.english.toLowerCase()))
  const pad = pickMockWords(need - real.length, used)
  return [...real, ...pad].slice(0, need)
}
