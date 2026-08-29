<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { GROQ_MODEL_DEFAULT } from '../lib/groqStudyHint'
import { GROQ_USAGE_EVENT, getGroqLimitsForModel, getGroqUsageSnapshot } from '../lib/groqUsageTracker'
import { useGroqApiKey } from '../lib/groqApiKey'

const { hasKey } = useGroqApiKey()
const limits = getGroqLimitsForModel(GROQ_MODEL_DEFAULT)
const snapshot = ref(getGroqUsageSnapshot(Date.now()))

function refresh() {
  snapshot.value = getGroqUsageSnapshot(Date.now())
}

let intervalId = 0
onMounted(() => {
  window.addEventListener(GROQ_USAGE_EVENT, refresh)
  intervalId = window.setInterval(refresh, 10_000)
})
onUnmounted(() => {
  window.removeEventListener(GROQ_USAGE_EVENT, refresh)
  window.clearInterval(intervalId)
})
</script>

<template>
  <div
    v-if="hasKey"
    class="groq-usage-pill"
    :class="{ 'groq-usage-pill--warn': snapshot.lastMinute >= limits.rpm || snapshot.last24h >= limits.rpd }"
    :title="`Успешные запросы подсказок Groq (${GROQ_MODEL_DEFAULT}). Окна: последние 60 секунд и последние 24 часа. Лимиты RPM/RPD — ориентир по тарифу Groq; фактические значения см. в консоли провайдера.`"
  >
    <span class="groq-usage-label">Groq</span>
    <span class="groq-usage-metric">
      {{ snapshot.lastMinute }}/{{ limits.rpm }} <span class="groq-usage-unit">/мин</span>
    </span>
    <span class="groq-usage-sep" aria-hidden> · </span>
    <span class="groq-usage-metric">
      {{ snapshot.last24h }}/{{ limits.rpd }} <span class="groq-usage-unit">/24ч</span>
    </span>
  </div>
</template>
