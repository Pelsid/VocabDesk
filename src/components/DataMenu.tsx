import { useMemo, useRef, useState } from 'react'
import { openRewordDatabase } from '../db/rewordDb'
import { exportDatabaseWithSchedules } from '../lib/rewordSchedule'
import type { ImportMode } from '../lib/progressTypes'
import { clearProgressStorage } from '../lib/progressStorage'
import { idbClearAll } from '../lib/backupIdb'
import { useProgress } from '../context/ProgressContext'

function downloadBlob(filename: string, data: Uint8Array, mime = 'application/octet-stream') {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const blob = new Blob([copy], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function DataMenu(props: {
  backupBuffer: ArrayBuffer | null
  onReplaceBackup: (buffer: ArrayBuffer, meta: { name: string }) => Promise<void>
}) {
  const { snapshot, importFromRewordBackupDb, clearProgressOnly, refresh } = useProgress()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const importProgressInputRef = useRef<HTMLInputElement | null>(null)
  const replaceDbInputRef = useRef<HTMLInputElement | null>(null)

  const canExport = props.backupBuffer != null

  const modes = useMemo(
    () =>
      [
        { id: 'replaceAll' as ImportMode, label: 'Полностью заменить локальный прогресс' },
        { id: 'mergeMissing' as ImportMode, label: 'Добавить только отсутствующие слова' },
        { id: 'mergeOverwrite' as ImportMode, label: 'Обновить все совпадающие ID из файла' },
      ] as const,
    [],
  )

  const [mode, setMode] = useState<ImportMode>('mergeOverwrite')

  const exportMergedBackup = async () => {
    if (!props.backupBuffer) return
    setStatus('Собираю файл…')
    try {
      const bin = await exportDatabaseWithSchedules(props.backupBuffer, snapshot.words)
      downloadBlob(`vocabdesk_merged_${yyyyMmDd()}.backup`, bin)
      setStatus('Готово: скачан merged-бэкап (прогресс вписан в WORD).')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  const exportProgressJson = () => {
    const payload = JSON.stringify(snapshot, null, 2)
    downloadBlob(`vocabdesk_progress_${yyyyMmDd()}.json`, new TextEncoder().encode(payload), 'application/json')
    setStatus('JSON прогресса скачан.')
  }

  const onImportProgressFile = async (file: File | undefined) => {
    if (!file) return
    setStatus('Читаю бэкап для импорта прогресса…')
    try {
      const buf = await file.arrayBuffer()
      const db = await openRewordDatabase(buf)
      const n = importFromRewordBackupDb(db, mode)
      db.close()
      refresh()
      setStatus(`Импорт завершён (${mode}). Обновлено записей: ${n}`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  const onReplaceDbFile = async (file: File | undefined) => {
    if (!file) return
    setStatus('Обновляю словарь…')
    try {
      const buf = await file.arrayBuffer()
      await props.onReplaceBackup(buf, { name: file.name })
      setStatus('База слов обновлена. Локальный прогресс сохранён.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  const clearEverything = async () => {
    if (!confirm('Удалить локальный прогресс И кэш бэкапа в браузере?')) return
    clearProgressStorage()
    await idbClearAll()
    refresh()
    location.reload()
  }

  const resetProgressOnly = () => {
    if (!confirm('Сбросить только прогресс обучения на этом сайте?')) return
    clearProgressOnly()
    setStatus('Прогресс обнулён.')
  }

  return (
    <>
      <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>
        Данные
      </button>

      {open ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-head">
              <div>
                <div className="modal-title">Данные и синхронизация</div>
                <div className="muted small">
                  Прогресс обучения хранится в localStorage. Файл бэкапа кэшируется в IndexedDB (из‑за размера).
                </div>
              </div>
              <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
                Закрыть
              </button>
            </div>

            <div className="modal-body">
              <section className="modal-section">
                <h3>Импорт прогресса из файла .backup</h3>
                <p className="muted small">
                  Выберите режим и файл <code>*.backup</code> экспорта со словаря. Импортируются поля прогресса из таблицы
                  WORD (приблизительное сопоставление с локальным SRS).
                </p>
                <select className="select" value={mode} onChange={(e) => setMode(e.target.value as ImportMode)}>
                  {modes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div className="row-btns">
                  <button type="button" className="btn-primary" onClick={() => importProgressInputRef.current?.click()}>
                    Выбрать бэкап…
                  </button>
                  <input
                    ref={importProgressInputRef}
                    type="file"
                    accept=".backup,application/octet-stream,*/*"
                    hidden
                    onChange={(e) => onImportProgressFile(e.target.files?.[0])}
                  />
                </div>
              </section>

              <section className="modal-section">
                <h3>Обновить словарь (новый бэкап)</h3>
                <p className="muted small">Заменяет только базу слов в IndexedDB. Прогресс не трогаем.</p>
                <div className="row-btns">
                  <button type="button" className="btn-quiet" onClick={() => replaceDbInputRef.current?.click()}>
                    Выбрать новый *.backup словаря…
                  </button>
                  <input
                    ref={replaceDbInputRef}
                    type="file"
                    accept=".backup,application/octet-stream,*/*"
                    hidden
                    onChange={(e) => onReplaceDbFile(e.target.files?.[0])}
                  />
                </div>
              </section>

              <section className="modal-section">
                <h3>Экспорт</h3>
                <div className="row-btns">
                  <button type="button" className="btn-primary" disabled={!canExport} onClick={() => void exportMergedBackup()}>
                    Скачать merged .backup
                  </button>
                  <button type="button" className="btn-quiet" onClick={exportProgressJson}>
                    Скачать progress.json
                  </button>
                </div>
                <p className="muted small">
                  Объединённый файл — это ваш исходный .backup, в который записаны локальные стадии в колонки WORD
                  (приёмник может по-разному их интерпретировать).
                </p>
              </section>

              <section className="modal-section danger-zone">
                <h3>Очистка</h3>
                <div className="row-btns">
                  <button type="button" className="btn-quiet" onClick={resetProgressOnly}>
                    Сбросить прогресс (localStorage)
                  </button>
                  <button type="button" className="btn-danger" onClick={() => void clearEverything()}>
                    Удалить всё и перезагрузить
                  </button>
                </div>
              </section>

              {status ? <div className="modal-status">{status}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function yyyyMmDd() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
