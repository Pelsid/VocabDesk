export interface ExamplePair {
  original: string
  translate: string
}

export function parseExamples(jsonStr: string | null | undefined): ExamplePair[] {
  if (!jsonStr?.trim()) return []
  try {
    const data = JSON.parse(jsonStr) as unknown
    if (!Array.isArray(data)) return []
    return data.map((x) => {
      const row = x as { o?: unknown; t?: unknown }
      return {
        original: String(row.o ?? ''),
        translate: String(row.t ?? ''),
      }
    })
  } catch {
    return []
  }
}

/** Strip #highlight# markers for plain text fallback */
export function stripHighlights(s: string): string {
  return s.replace(/#/g, '')
}
