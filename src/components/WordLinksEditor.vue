<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { deleteWordLink, fetchWordRelations, putLinkWords, searchWords } from '../api/client'
import type { WordRelation, WordRelationKind, WordRow } from '../lib/catalogTypes'
import { useCatalogStore } from '../stores/catalog'

const RELATION_LABEL: Record<WordRelationKind, string> = {
  related: 'Связано',
  synonym: 'Синоним',
  antonym: 'Антоним',
  form: 'Форма',
  collocation: 'Сочетание',
}

const props = defineProps<{
  wordId: number
}>()

const catalog = useCatalogStore()
const relations = ref<WordRelation[]>([])
const loading = ref(false)
const q = ref('')
const hits = ref<WordRow[]>([])
const relation = ref<WordRelationKind>('related')
const note = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function reload() {
  loading.value = true
  error.value = null
  try {
    relations.value = await fetchWordRelations(props.wordId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.wordId,
  () => {
    q.value = ''
    hits.value = []
    void reload()
  },
)

onMounted(() => {
  void reload()
})

watch(q, async (term) => {
  if (term.trim().length < 2) {
    hits.value = []
    return
  }
  hits.value = (await searchWords(term)).filter((w) => w.id !== props.wordId)
})

function badge(w: WordRow): string {
  if (w.oxfordLevels?.length) return `Oxford ${w.oxfordLevels.join(' · ')}`
  const first = w.dictionaryIds?.[0]
  if (!first) return w.isOwn ? 'Своё' : 'Каталог'
  return catalog.dictionaries.find((d) => d.id === first)?.name ?? first
}

async function linkTo(otherId: number) {
  busy.value = true
  error.value = null
  try {
    relations.value = await putLinkWords({
      wordId: props.wordId,
      relatedWordId: otherId,
      relation: relation.value,
      note: note.value.trim() || undefined,
    })
    q.value = ''
    hits.value = []
    note.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function unlink(rel: WordRelation) {
  busy.value = true
  error.value = null
  try {
    relations.value = await deleteWordLink(rel.wordId, rel.relatedWordId, rel.relation)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="word-links">
    <div class="muted small">Связи слов</div>
    <p v-if="loading" class="muted small">Загрузка связей…</p>
    <ul v-else-if="relations.length" class="word-links-list">
      <li v-for="rel in relations" :key="`${rel.wordId}-${rel.relatedWordId}-${rel.relation}`" class="word-links-item">
        <div>
          <strong>{{ rel.other.word }}</strong>
          <span class="muted"> — {{ rel.other.rus ?? '—' }}</span>
          <span class="oxford-level-badge">{{ RELATION_LABEL[rel.relation] }} · {{ badge(rel.other) }}</span>
          <span v-if="rel.note" class="muted small"> {{ rel.note }}</span>
        </div>
        <button type="button" class="btn-quiet" :disabled="busy" @click="unlink(rel)">Удалить</button>
      </li>
    </ul>
    <p v-else class="muted small">Пока нет связей. Можно связать с карточкой Oxford или своим словом.</p>

    <div class="word-links-add">
      <input v-model="q" class="select" placeholder="Найти слово для связи" />
      <select v-model="relation" class="select word-links-type">
        <option v-for="(label, key) in RELATION_LABEL" :key="key" :value="key">{{ label }}</option>
      </select>
      <input v-model="note" class="select" maxlength="255" placeholder="Заметка (необязательно)" />
    </div>
    <div v-if="hits.length" class="hits word-links-hits">
      <button v-for="w in hits" :key="w.id" type="button" class="hit" :disabled="busy" @click="linkTo(w.id)">
        <span class="hit-word">{{ w.word }}</span>
        <span class="muted">{{ w.rus ?? '—' }}</span>
        <span class="oxford-level-badge">{{ badge(w) }}</span>
      </button>
    </div>
    <p v-if="error" class="alert">{{ error }}</p>
  </div>
</template>
