import type { WordRow } from './catalogTypes'

export const REMOTE_PICTURE_MAX = 3

const cache = new Map<string, Promise<string | null>>()
const listCache = new Map<string, Promise<string[]>>()

function pixabayKey(): string | undefined {
  return import.meta.env.VITE_PIXABAY_API_KEY?.trim() || undefined
}

function pexelsKey(): string | undefined {
  return import.meta.env.VITE_PEXELS_API_KEY?.trim() || undefined
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim())
}

function cached(key: string, fn: () => Promise<string | null>): Promise<string | null> {
  let p = cache.get(key)
  if (!p) {
    p = fn().catch(() => {
      cache.delete(key)
      return null
    })
    cache.set(key, p)
  }
  return p
}

function cachedList(key: string, fn: () => Promise<string[]>): Promise<string[]> {
  let p = listCache.get(key)
  if (!p) {
    p = fn().catch(() => {
      listCache.delete(key)
      return []
    })
    listCache.set(key, p)
  }
  return p
}

function hitPreviewUrl(hit: Record<string, unknown>): string | null {
  const large = hit.largeImageURL
  const web = hit.webformatURL
  if (typeof large === 'string' && large.length > 0) return large
  if (typeof web === 'string' && web.length > 0) return web
  return null
}

async function pixabayById(apiKey: string, id: string): Promise<string | null> {
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(id)}`
  const r = await fetch(url)
  if (!r.ok) return null
  const data = (await r.json()) as { hits?: unknown[] }
  const hit = data.hits?.[0]
  if (!hit || typeof hit !== 'object') return null
  return hitPreviewUrl(hit as Record<string, unknown>)
}

async function pixabaySearchMany(apiKey: string, query: string, want: number): Promise<string[]> {
  const q = query.trim()
  if (!q || want <= 0) return []
  const perPage = Math.min(20, Math.max(want * 4, 8))
  const url =
    `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}` +
    `&q=${encodeURIComponent(q)}&image_type=photo&safesearch=true` +
    `&per_page=${perPage}&lang=en`
  const r = await fetch(url)
  if (!r.ok) return []
  const data = (await r.json()) as { hits?: unknown[] }
  const hits = data.hits
  if (!Array.isArray(hits)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const h of hits) {
    if (h && typeof h === 'object') {
      const u = hitPreviewUrl(h as Record<string, unknown>)
      if (u && !seen.has(u)) {
        seen.add(u)
        out.push(u)
        if (out.length >= want) break
      }
    }
  }
  return out
}

async function pexelsById(apiKey: string, id: string): Promise<string | null> {
  const url = `https://api.pexels.com/v1/photos/${encodeURIComponent(id)}`
  const r = await fetch(url, { headers: { Authorization: apiKey } })
  if (!r.ok) return null
  const data = (await r.json()) as { src?: Record<string, string> }
  const src = data.src
  if (!src) return null
  return src.large2x || src.large || src.portrait || src.original || null
}

/**
 * До `limit` URL превью (локальный BLOB обрабатывается в UI отдельно).
 * Pixabay: сначала по ID (если есть), затем добор из поиска по англ. слову.
 */
export async function resolveRemotePictureUrls(word: WordRow, limit = REMOTE_PICTURE_MAX): Promise<string[]> {
  const cap = Math.min(REMOTE_PICTURE_MAX, Math.max(1, limit))
  const pk = pixabayKey()
  const ek = pexelsKey()
  const source = word.picSource?.trim().toLowerCase() ?? ''
  const sid = word.picSourceId?.trim() ?? ''
  const lemma = word.word?.trim() ?? ''

  const out: string[] = []
  const seen = new Set<string>()

  const pushUnique = (u: string | null) => {
    if (!u || seen.has(u)) return
    seen.add(u)
    out.push(u)
  }

  if (sid && isHttpUrl(sid)) {
    pushUnique(sid.trim())
  }

  if (source === 'pixabay' && sid && pk && !isHttpUrl(sid)) {
    const u = await cached(`pixabay:id:${sid}`, () => pixabayById(pk, sid))
    pushUnique(u)
  }

  if (source === 'pexels' && sid && ek) {
    const u = await cached(`pexels:id:${sid}`, () => pexelsById(ek, sid))
    pushUnique(u)
  }

  if (out.length < cap && pk && lemma) {
    const batch = await cachedList(`pixabay:searchMany:${lemma.toLowerCase()}:${cap}`, () =>
      pixabaySearchMany(pk, lemma, cap),
    )
    for (const u of batch) {
      pushUnique(u)
      if (out.length >= cap) break
    }
  }

  return out.slice(0, cap)
}
