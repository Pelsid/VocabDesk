import type { CardSchedule } from '../lib/progressTypes'
import { formatDueLabel } from '../lib/srs'

export function StudyBadge(props: {
  schedule: CardSchedule | null
  now?: number
  mastered?: boolean
}) {
  const now = props.now ?? Date.now()
  if (props.mastered) {
    return (
      <span className="stage stage-mastered" title="Исключено из SRS по вашему выбору">
        навсегда
      </span>
    )
  }
  const s = props.schedule

  if (!s || s.bucket === 'new') {
    return (
      <span className="stage stage-new" title="Локальный прогресс (этот сайт)">
        новое
      </span>
    )
  }

  let label = 'повторение'
  let cls = 'stage stage-review'
  if (s.bucket === 'learning') {
    label = 'изучение'
    cls = 'stage stage-learn'
  } else if (s.bucket === 'relearn') {
    label = 'восстановление'
    cls = 'stage stage-learn'
  } else if (s.bucket === 'review' && s.intervalDays >= 14 && s.reps >= 4) {
    label = 'закреплено'
    cls = 'stage stage-done'
  }

  const due = formatDueLabel(s, now)

  return (
    <span className={cls} title={`Локально · ${due} · интервал ~${Math.round(s.intervalDays)} дн · ease ${s.ease}`}>
      {label}
    </span>
  )
}
