import { computed } from 'vue'
import { useProgressStore } from '../stores/progress'

export const GROQ_API_KEY_EVENT = 'vocabdesk-groq-api-key'

export function useGroqApiKey() {
  const progress = useProgressStore()
  const hasKey = computed(() => progress.hasGroqKey)
  return { hasKey }
}
