import { defineStore } from 'pinia'
import { fetchBootstrap, fetchQuizRus, fetchWordsByIds, fetchWordsInDictionary, searchWords } from '../api/client'
import type { CategoryStat, WordRow } from '../lib/catalogTypes'
import { listWordIdsInScope } from '../lib/catalogScope'
import type { CategoryScopePrefs } from '../lib/progressTypes'

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    dictionaries: [] as CategoryStat[],
    dictionaryWordIds: {} as Record<string, number[]>,
    wordCache: {} as Record<number, WordRow>,
    ready: false,
    error: null as string | null,
  }),
  actions: {
    async loadBootstrap() {
      const boot = await fetchBootstrap()
      this.dictionaries = boot.dictionaries
      this.dictionaryWordIds = boot.dictionaryWordIds
      this.ready = true
      this.error = null
      return boot
    },
    idsInScope(scope: 'selected' | 'category', categoryId: string | null, prefs: CategoryScopePrefs): number[] {
      return listWordIdsInScope(this.dictionaryWordIds, this.dictionaries, scope, categoryId, prefs)
    },
    async ensureWords(ids: number[]): Promise<WordRow[]> {
      const missing = ids.filter((id) => !this.wordCache[id])
      if (missing.length) {
        const rows = await fetchWordsByIds(missing)
        for (const w of rows) this.wordCache[w.id] = w
      }
      return ids.map((id) => this.wordCache[id]).filter((w): w is WordRow => Boolean(w))
    },
    async loadCategoryWords(dictionaryId: string, q = ''): Promise<WordRow[]> {
      const rows = await fetchWordsInDictionary(dictionaryId, q)
      for (const w of rows) this.wordCache[w.id] = w
      return rows
    },
    async search(q: string): Promise<WordRow[]> {
      const rows = await searchWords(q)
      for (const w of rows) this.wordCache[w.id] = w
      return rows
    },
    quizRus(args: { scope: 'selected' | 'category'; categoryId: string | null; exclude: number }) {
      return fetchQuizRus(args)
    },
  },
})
