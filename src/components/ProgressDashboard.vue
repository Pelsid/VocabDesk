<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CategoryStat } from '../lib/catalogTypes'
import { computeOxfordPathRows, pctTone } from '../lib/dashboardPath'
import type { ProgressSnapshot } from '../lib/progressTypes'
import { useCatalogStore } from '../stores/catalog'

const props = defineProps<{
  categories: CategoryStat[]
  snapshot: ProgressSnapshot
  revision: number
}>()

void props.revision

const catalog = useCatalogStore()
const open = ref(false)
const oxford = computed(() => computeOxfordPathRows(catalog.dictionaryWordIds, props.categories, props.snapshot))
</script>

<template>
  <section class="section progress-dash-section" aria-label="Дорожка к B1–B2">
    <details class="oxford-path-fold" :open="open" @toggle="open = ($event.target as HTMLDetailsElement).open">
      <summary class="oxford-path-summary">
        Дорожка Oxford
        <span class="muted small">свёрнуто · прогресс по уровням</span>
      </summary>
      <p v-if="oxford.length === 0" class="muted small">В каталоге нет наборов Oxford.</p>
      <div v-else class="oxford-row">
        <article v-for="row in oxford" :key="row.id" class="oxford-card">
          <div class="oxford-name">{{ row.name }}</div>
          <div class="oxford-meta">
            <span class="muted">{{ row.learnedCount.toLocaleString('ru-RU') }} / {{ row.wordCount.toLocaleString('ru-RU') }}</span>
            <span class="oxford-pct" :class="`tone-${pctTone(row.localPct)}`">{{ row.localPct }}%</span>
          </div>
          <div class="progress thin">
            <div class="progress-bar" :class="`tone-${pctTone(row.localPct)}`" :style="{ width: `${row.localPct}%` }" />
          </div>
        </article>
      </div>
    </details>
  </section>
</template>
