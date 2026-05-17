import type { DragEvent } from 'react'

import { APP_DISPLAY_NAME } from '../lib/brand'

export function UploadScreen(props: {
  busy: boolean
  error: string | null
  onPick: (file: File) => void
}) {
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) props.onPick(f)
  }

  return (
    <div className="upload-screen">
      <div className="upload-card">
        <div className="brand">
          <div className="brand-mark">VD</div>
          <div>
            <h1>{APP_DISPLAY_NAME}</h1>
            <p className="muted">
              В браузере: откройте резервную копию SQLite словаря (файл .backup из экспорта). Данные не отправляются на
              сервер — всё только в этом устройстве и профиле браузера.
            </p>
          </div>
        </div>

        <label
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept=".backup,application/octet-stream,*/*"
            disabled={props.busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) props.onPick(f)
            }}
          />
          <div className="dropzone-inner">
            <div className="drop-title">
              {props.busy ? 'Загрузка базы…' : 'Выберите файл *.backup словаря'}
            </div>
            <div className="muted small">
              Перетащите сюда или нажмите для выбора. Копия сохранится в IndexedDB браузера, чтобы не загружать файл каждый
              раз.
            </div>
          </div>
        </label>

        {props.error ? <div className="alert">{props.error}</div> : null}

        <div className="hint muted small">
          Прогресс обучения хранится в localStorage и считается по правилам этого сайта. Сверить его с файлом .backup можно
          через меню «Данные» вверху после выбора словаря.
        </div>
      </div>
    </div>
  )
}
