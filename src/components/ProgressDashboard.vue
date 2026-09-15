<script setup lang="ts">
import { computed } from 'vue'
import type { CategoryStat } from '../lib/catalogTypes'
import { computeOxfordPathRows, pctRingColor, shortOxfordLabel } from '../lib/dashboardPath'
import type { ProgressSnapshot } from '../lib/progressTypes'
import { useCatalogStore } from '../stores/catalog'
import DailyProgressRing from './DailyProgressRing.vue'

const props = defineProps<{
  categories: CategoryStat[]
  snapshot: ProgressSnapshot
  revision: number
}>()

void props.revision

const catalog = useCatalogStore()
const oxford = computed(() => computeOxfordPathRows(catalog.dictionaryWordIds, props.categories, props.snapshot))
</script>

<template>
  <section class="oxford-path" aria-label="Путь к C1">
    <div class="oxford-path-head">
      <div>
        <h2 class="oxford-path-title">Твой путь к C1</h2>
        <p class="muted small">Прогресс по уровням Oxford (локальный SRS)</p>
      </div>
    </div>
    <p v-if="oxford.length === 0" class="muted small">В каталоге нет наборов Oxford.</p>
    <div v-else class="oxford-path-track">
      <template v-for="(row, i) in oxford" :key="row.id">
        <article class="oxford-node">
          <div class="oxford-node-ring-wrap">
            <DailyProgressRing :done="row.localPct" :goal="100" :size="72" :stroke="7" />
            <div class="oxford-node-center">{{ row.localPct }}%</div>
          </div>
          <div class="oxford-node-copy">
            <div class="oxford-node-top">
              <div class="oxford-node-label" :style="{ color: pctRingColor(row.localPct) }">{{ shortOxfordLabel(row.name) }}</div>
              <div class="oxford-node-pct" :style="{ color: pctRingColor(row.localPct) }">{{ row.localPct }}%</div>
            </div>
            <div class="oxford-node-bar" aria-hidden>
              <div
                class="oxford-node-bar-fill"
                :style="{ width: `${row.localPct}%`, background: pctRingColor(row.localPct) }"
              />
            </div>
            <div class="oxford-node-meta muted small">
              {{ row.learnedCount.toLocaleString('ru-RU') }} / {{ row.wordCount.toLocaleString('ru-RU') }}
            </div>
          </div>
        </article>
        <span v-if="i < oxford.length - 1" class="oxford-path-arrow" aria-hidden>→</span>
      </template>
    </div>
  </section>
</template>
