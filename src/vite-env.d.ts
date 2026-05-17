/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GROQ_API_KEY?: string
  /** https://pixabay.com/api/docs/ — для картинок по SOURCE_ID и поиска по слову */
  readonly VITE_PIXABAY_API_KEY?: string
  /** https://www.pexels.com/api/ — только для бэкапов с SOURCE=pexels */
  readonly VITE_PEXELS_API_KEY?: string
}

declare module '*.wasm?url' {
  const src: string
  export default src
}
