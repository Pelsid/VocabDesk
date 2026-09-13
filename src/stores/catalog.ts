import { defineStore } from 'pinia'
import {
  deleteDictionary,
  fetchBootstrap,
  fetchQuizRus,
  fetchWordsByIds,
  fetchWordsInDictionary,
  postCreateDictionary,
  putAddWords,
  putRenameDictionary,
  putRemoveWords,
  putSetDictionarySelected,
  searchWords,
} from '../api/client'
import type { CategoryStat, WordRow } from '../lib/catalogTypes'
import { listWordIdsInScope } from '../lib/catalogScope'
import type { CategoryScopePrefs } from '../lib/progressTypes'

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    dictionaries: [] as CategoryStat[],
    dictionaryWordIds: {} as Record<string, number[]>,
    wordCache: {} as Record<number, WordRow>,
    orphanWordCount: 0,
    ready: false,
    error: null as string | null,
  }),
  actions: {
    patchDictionary(next: CategoryStat) {
      const i = this.dictionaries.findIndex((d) => d.id === next.id)
      if (i >= 0) this.dictionaries[i] = next
      else this.dictionaries.push(next)
    },
    async loadBootstrap() {
      const boot = await fetchBootstrap()
      this.dictionaries = boot.dictionaries
      this.dictionaryWordIds = boot.dictionaryWordIds
      this.orphanWordCount = boot.orphanWordCount ?? 0
      this.ready = true
      this.error = null
      return boot
    },
    async refreshCatalog() {
      return this.loadBootstrap()
    },
    async createDictionary(name: string, iconKey?: string) {
      const d = await postCreateDictionary(name, iconKey)
      this.patchDictionary(d)
      this.dictionaryWordIds[d.id] ??= []
      return d
    },
    async renameDictionary(id: string, name: string) {
      const d = await putRenameDictionary(id, name)
      this.patchDictionary(d)
      return d
    },
    async setSelected(id: string, isSelected: boolean) {
      const d = await putSetDictionarySelected(id, isSelected)
      this.patchDictionary(d)
      return d
    },
    async removeDictionary(id: string) {
      await deleteDictionary(id)
      this.dictionaries = this.dictionaries.filter((d) => d.id !== id)
      delete this.dictionaryWordIds[id]
    },
    async addWordsToDictionary(dictionaryId: string, wordIds: number[]) {
      const d = await putAddWords(dictionaryId, wordIds)
      this.patchDictionary(d)
      const set = new Set(this.dictionaryWordIds[dictionaryId] ?? [])
      for (const id of wordIds) set.add(id)
      this.dictionaryWordIds[dictionaryId] = [...set]
      return d
    },
    async removeWordsFromDictionary(dictionaryId: string, wordIds: number[]) {
      const d = await putRemoveWords(dictionaryId, wordIds)
      this.patchDictionary(d)
      const drop = new Set(wordIds)
      this.dictionaryWordIds[dictionaryId] = (this.dictionaryWordIds[dictionaryId] ?? []).filter((id) => !drop.has(id))
      return d
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
