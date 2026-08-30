import type { CardSchedule } from '../lib/progressTypes'

export type StudyInteractionMode = 'type' | 'reveal' | 'choice' | 'cloze'

/** Режим ответа по стадии карточки: система выбирает, пользователь может переопределить. */
export function pickStudyMode(schedule: CardSchedule | null): StudyInteractionMode {
  if (!schedule || schedule.bucket === 'new') return 'choice'
  if (schedule.bucket === 'learning' && schedule.reps <= 1 && schedule.step < 2) return 'choice'
  if (schedule.bucket === 'learning' || schedule.bucket === 'relearn') return 'type'
  if (schedule.reps >= 4 && schedule.intervalDays >= 7) return 'cloze'
  return 'type'
}
