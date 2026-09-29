<script setup lang="ts">
import { computed } from 'vue'
import { relatedGrammarForWord } from '../lib/grammarLinks'

const props = defineProps<{
  lemma: string
  levels?: string[]
}>()

const emit = defineEmits<{ open: [id: string] }>()

const lessons = computed(() => relatedGrammarForWord(props.lemma, props.levels))
</script>

<template>
  <div v-if="lessons.length" class="grammar-links">
    <div class="muted small">Связанная грамматика</div>
    <div class="chip-row">
      <button v-for="l in lessons" :key="l.id" type="button" class="chip" @click="emit('open', l.id)">
        {{ l.level }} · {{ l.title }}
      </button>
    </div>
  </div>
</template>
