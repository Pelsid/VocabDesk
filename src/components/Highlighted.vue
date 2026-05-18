<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <template v-for="(chunk, i) in text.split('#')" :key="i">
    <mark v-if="i % 2 === 1" class="hl">{{ chunk }}</mark>
    <span v-else>{{ chunk }}</span>
  </template>
</template>
