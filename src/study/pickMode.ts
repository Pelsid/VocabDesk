import type { CardSchedule } from '../lib/progressTypes'

export type StudyInteractionMode = 'type' | 'reveal' | 'choice' | 'cloze'

/** Режим ответа по стадии карточки: система выбирает, пользователь может переопределить. */
export function pickStudyMode(schedule: CardSchedule | null, hasRus = true): StudyInteractionMode {
  let mode: StudyInteractionMode
  if (!schedule || schedule.bucket === 'new') mode = 'choice'
  else if (schedule.bucket === 'learning' && schedule.reps <= 1 && schedule.step < 2) mode = 'choice'
  else if (schedule.bucket === 'learning' || schedule.bucket === 'relearn') mode = 'type'
  else if (schedule.reps >= 4 && schedule.intervalDays >= 7) mode = 'cloze'
  else mode = 'type'
  if (!hasRus && mode === 'choice') return 'reveal'
  return mode
}
