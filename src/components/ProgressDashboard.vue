<script setup lang="ts">
import type { Database } from 'sql.js'
import { computed } from 'vue'
import type { CategoryStat } from '../db/rewordDb'
import { computeOxfordPathRows } from '../lib/dashboardPath'
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

const oxford = computed(() => computeOxfordPathRows(props.db, props.categories, props.snapshot))
const mode = computed(() => props.snapshot.prefs.categoryScopeMode ?? 'reword')
const customN = computed(() => (props.snapshot.prefs.customCategoryIds ?? []).length)
</script>

<template>
  <section class="section progress-dash-section" aria-label="Обзор прогресса">
    <div class="section-head">
      <h2>Дорожка к B1–B2</h2>
      <span class="muted small">
        Оценка по локальному SRS — ориентир, не экзамен. Полосы Oxford из бэкапа Reword.
      </span>
    </div>

    <div class="progress-dash-grid">
      <div class="panel progress-dash-card">
        <div class="progress-dash-card-title">Область «Учить»</div>
        <ul class="progress-dash-stats muted small">
          <li>
            Всего активных слов: <strong class="progress-dash-strong">{{ wordsInScopeTotal }}</strong>
          </li>
          <li>
            В работе (без «навсегда»): <strong class="progress-dash-strong">{{ counts.total }}</strong>
          </li>
          <li>
            К повторению сейчас: <strong class="progress-dash-strong">{{ counts.due }}</strong>
          </li>
          <li>
            Новых в запасе: <strong class="progress-dash-strong">{{ counts.fresh }}</strong>
          </li>
          <li>
            На стадии изучения / восстановления:
            <strong class="progress-dash-strong">{{ counts.learning }}</strong>
          </li>
        </ul>
        <p class="muted small progress-dash-note">
          Режим набора:
          <strong>{{ mode === 'custom' ? `свой список (${customN} словарей)` : 'как в файле Reword' }}</strong>.
        </p>
      </div>

      <div class="panel progress-dash-card progress-dash-oxford">
        <div class="progress-dash-card-title">Oxford / смежные полосы</div>
        <p v-if="oxford.length === 0" class="muted small">
          В этом бэкапе нет стандартных наборов Oxford — откройте другой экспорт.
        </p>
        <ul v-else class="progress-dash-oxford-list">
          <li v-for="row in oxford" :key="row.id">
            <div class="progress-dash-oxford-head">
              <span>{{ row.name }}</span>
              <span class="muted small"> {{ row.localPct }}% · {{ row.wordCount }} слов </span>
            </div>
            <div class="progress">
              <div class="progress-bar local" :style="{ width: `${row.localPct}%` }" />
            </div>
          </li>
        </ul>
        <p class="muted small progress-dash-note">
          Процент — доля слов во вкладке «Изученное» по локальному SRS (стадия повторения или «навсегда»), как в списке
          словарей.
        </p>
      </div>
    </div>
  </section>
</template>
