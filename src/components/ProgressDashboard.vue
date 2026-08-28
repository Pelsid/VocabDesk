<script setup lang="ts">
import type { Database } from 'sql.js'
import { computed } from 'vue'
import type { CategoryStat } from '../db/rewordDb'
import { computeOxfordPathRows, pctTone } from '../lib/dashboardPath'
import type { ProgressSnapshot } from '../lib/progressTypes'

const props = defineProps<{
  db: Database
  categories: CategoryStat[]
  snapshot: ProgressSnapshot
  revision: number
  counts: { total: number; due: number; fresh: number; learning: number }
  wordsInScopeTotal: number
}>()

void props.revision
void props.counts
void props.wordsInScopeTotal

const oxford = computed(() => computeOxfordPathRows(props.db, props.categories, props.snapshot))
</script>

<template>
  <section class="section progress-dash-section" aria-label="Дорожка к B1–B2">
    <div class="section-head">
      <h2>Дорожка к B1–B2</h2>
      <span class="muted small">Прогресс по уровню Oxford (локальный SRS)</span>
    </div>

    <p v-if="oxford.length === 0" class="muted small">
      В этом бэкапе нет стандартных наборов Oxford — откройте другой экспорт.
    </p>
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
  </section>
</template>
