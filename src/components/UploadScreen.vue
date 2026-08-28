<script setup lang="ts">
import { APP_DISPLAY_NAME } from '../lib/brand'

defineProps<{
  busy: boolean
  error: string | null
}>()

const emit = defineEmits<{ pick: [file: File] }>()

function onDrop(e: DragEvent) {
  e.preventDefault()
  const f = e.dataTransfer?.files?.[0]
  if (f) emit('pick', f)
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f) emit('pick', f)
}
</script>

<template>
  <div class="upload-screen">
    <div class="upload-card">
      <div class="brand">
        <div class="brand-mark">VD</div>
        <div>
          <h1>{{ APP_DISPLAY_NAME }}</h1>
          <p class="muted">
            В браузере: откройте резервную копию SQLite словаря (файл .backup из экспорта). Данные не отправляются на
            сервер — всё только в этом устройстве и профиле браузера.
          </p>
        </div>
      </div>

      <label class="dropzone" @dragover.prevent @drop="onDrop">
        <input type="file" accept=".backup,application/octet-stream,*/*" :disabled="busy" @change="onFileChange" />
        <div class="dropzone-inner">
          <div class="drop-title">{{ busy ? 'Загрузка базы…' : 'Выберите файл *.backup словаря' }}</div>
          <div class="muted small">
            Перетащите сюда или нажмите для выбора. Копия сохранится в IndexedDB браузера, чтобы не загружать файл каждый
            раз.
          </div>
        </div>
      </label>

      <div v-if="error" class="alert">{{ error }}</div>

      <div class="hint muted small">
        Прогресс обучения хранится в localStorage и считается по правилам этого сайта. Сверить его с файлом .backup можно
        через меню «Данные» в боковой панели после выбора словаря.
      </div>
    </div>
  </div>
</template>
