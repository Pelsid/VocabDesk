import type { CategoryStat } from './catalogTypes'
import type { CategoryScopePrefs } from './progressTypes'

export type CatalogScope = 'all' | 'selected' | 'category'

export function sessionDictScope(prefs: { sessionDictScope?: string | null }): 'all' | 'selected' {
  return prefs.sessionDictScope === 'all' ? 'all' : 'selected'
}

export function listWordIdsInScope(
  wordIdsByDict: Record<string, number[]>,
  dictionaries: CategoryStat[],
  scope: CatalogScope,
  categoryId: string | null,
  scopePrefs?: CategoryScopePrefs | null,
): number[] {
  if (scope === 'category') {
    if (!categoryId) return []
    return [...(wordIdsByDict[categoryId] ?? [])]
  }
  if (scope === 'all') {
    const set = new Set<number>()
    for (const d of dictionaries) {
      for (const wid of wordIdsByDict[d.id] ?? []) set.add(wid)
    }
    return [...set]
  }
  if (scopePrefs?.categoryScopeMode === 'custom') {
    const set = new Set<number>()
    for (const id of scopePrefs.customCategoryIds ?? []) {
      for (const wid of wordIdsByDict[id] ?? []) set.add(wid)
    }
    return [...set]
  }
  const set = new Set<number>()
  for (const d of dictionaries) {
    if (!d.isSelected) continue
    for (const wid of wordIdsByDict[d.id] ?? []) set.add(wid)
  }
  return [...set]
}

export function listWordIdsInCategory(wordIdsByDict: Record<string, number[]>, categoryId: string): number[] {
  return [...(wordIdsByDict[categoryId] ?? [])]
}
