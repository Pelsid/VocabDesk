<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CEFR_LEVELS, GRAMMAR_LESSONS, getLesson, searchLessons } from '../grammar/catalog'
import type { CefrLevel, GrammarLesson } from '../grammar/types'
import {
  clearGrammarDone,
  loadGrammarDone,
  loadSelectedGrammarLessonId,
  saveSelectedGrammarLessonId,
  toggleGrammarLessonDone,
} from '../lib/grammarProgress'

type LevelFilter = CefrLevel | 'all'

const level = ref<LevelFilter>('all')
const query = ref('')
const selectedId = ref<string | null>(loadSelectedGrammarLessonId())
const done = ref<Set<string>>(loadGrammarDone())

const filtered = computed(() => searchLessons(query.value, level.value))

const selected = computed(() => (selectedId.value ? getLesson(selectedId.value) ?? null : null))

const doneInScope = computed(() => {
  const list = level.value === 'all' ? GRAMMAR_LESSONS : GRAMMAR_LESSONS.filter((l) => l.level === level.value)
  let n = 0
  for (const lesson of list) if (done.value.has(lesson.id)) n += 1
  return { n, total: list.length }
})

const seeAlsoLessons = computed(() => {
  const lesson = selected.value
  if (!lesson) return []
  return lesson.seeAlso.map((id) => getLesson(id)).filter((x): x is GrammarLesson => x != null)
})

watch(selectedId, (id) => {
  saveSelectedGrammarLessonId(id)
})

function select(id: string) {
  selectedId.value = id
}

function backToList() {
  selectedId.value = null
}

function toggleDone() {
  const id = selectedId.value
  if (!id) return
  done.value = new Set(toggleGrammarLessonDone(id))
}

function resetDone() {
  done.value = clearGrammarDone()
}

function isDone(id: string): boolean {
  return done.value.has(id)
}
</script>

<template>
  <div class="grammar-view" :class="{ 'grammar-view--reading': selected }">
    <aside class="grammar-list panel" aria-label="Темы грамматики">
      <header class="grammar-list-head">
        <h1>Грамматика</h1>
        <p class="page-sub">
          Справочник A1–B2: правила и примеры. Без тестов. C1 (inversion глубже, cleft, hedging) — после закрытия B2, не
          отдельный том.
        </p>
        <p class="muted small grammar-progress">
          Изучено: <strong>{{ doneInScope.n }}</strong> из {{ doneInScope.total }}{{
            level === 'all' ? '' : ` · ${level}`
          }}
        </p>
      </header>

      <div class="chip-row grammar-chips" aria-label="Уровень">
        <button type="button" class="chip" :class="{ active: level === 'all' }" @click="level = 'all'">Все</button>
        <button
          v-for="lv in CEFR_LEVELS"
          :key="lv"
          type="button"
          class="chip"
          :class="{ active: level === lv }"
          @click="level = lv"
        >
          {{ lv }}
        </button>
      </div>

      <div class="field grammar-search">
        <span class="field-label">Поиск</span>
        <input v-model="query" type="search" placeholder="Тема, форма, gist…" />
      </div>

      <ul class="grammar-topics">
        <li v-for="lesson in filtered" :key="lesson.id">
          <button
            type="button"
            class="grammar-topic"
            :class="{ active: selectedId === lesson.id, done: isDone(lesson.id) }"
            @click="select(lesson.id)"
          >
            <span class="grammar-topic-level">{{ lesson.level }}</span>
            <span class="grammar-topic-title">{{ lesson.title }}</span>
            <span v-if="isDone(lesson.id)" class="grammar-topic-check" aria-label="изучено">✓</span>
          </button>
        </li>
      </ul>

      <p v-if="filtered.length === 0" class="muted small grammar-empty-search">Ничего не нашлось.</p>

      <button type="button" class="btn-quiet grammar-reset" @click="resetDone">Сбросить отметки</button>
    </aside>

    <article v-if="selected" class="grammar-lesson panel" :aria-label="selected.title">
      <button type="button" class="btn-quiet dict-back grammar-back" @click="backToList">← К списку</button>

      <header class="grammar-lesson-head">
        <span class="grammar-badge">{{ selected.level }}</span>
        <h2>{{ selected.title }}</h2>
        <p class="grammar-gist">{{ selected.gist }}</p>
      </header>

      <section class="grammar-block">
        <h3 class="grammar-h">Форма</h3>
        <p class="grammar-form">{{ selected.form }}</p>
      </section>

      <section class="grammar-block">
        <h3 class="grammar-h">Правила</h3>
        <ul class="grammar-rules">
          <li v-for="(rule, i) in selected.rules" :key="i">{{ rule }}</li>
        </ul>
      </section>

      <section class="grammar-block">
        <h3 class="grammar-h">Примеры</h3>
        <ul class="grammar-ex-list">
          <li v-for="(ex, i) in selected.examples" :key="i" class="grammar-ex">
            <p class="grammar-ex-en" lang="en">{{ ex.en }}</p>
            <p class="grammar-ex-ru">{{ ex.ru }}</p>
            <p v-if="ex.note" class="muted small">{{ ex.note }}</p>
          </li>
        </ul>
      </section>

      <section class="grammar-block">
        <h3 class="grammar-h">Частые ошибки</h3>
        <ul class="grammar-rules grammar-pitfalls">
          <li v-for="(p, i) in selected.pitfalls" :key="i">{{ p }}</li>
        </ul>
      </section>

      <section v-if="seeAlsoLessons.length > 0" class="grammar-block">
        <h3 class="grammar-h">См. также</h3>
        <div class="chip-row">
          <button
            v-for="rel in seeAlsoLessons"
            :key="rel.id"
            type="button"
            class="chip"
            @click="select(rel.id)"
          >
            {{ rel.level }} · {{ rel.title }}
          </button>
        </div>
      </section>

      <footer class="grammar-lesson-foot">
        <button type="button" :class="isDone(selected.id) ? 'btn-quiet' : 'btn-primary'" @click="toggleDone">
          {{ isDone(selected.id) ? 'Снять отметку' : 'Отметить как изученное' }}
        </button>
      </footer>
    </article>

    <div v-else class="grammar-idle panel">
      <p class="learn-empty-title">Выберите тему</p>
      <p class="muted small">Слева список по уровням. Идите по порядку: A1 → A2 → B1 → B2.</p>
    </div>
  </div>
</template>
