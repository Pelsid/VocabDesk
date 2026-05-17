export function normalizeAnswer(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return ''
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Compare user input against comma-separated translation field.
 * Разделители: запятая, точка с запятой, слэш, вертикальная черта.
 * (Без захватывающих групп в split — иначе в массив попадает undefined и падает normalizeAnswer.)
 */
export function matchesTranslation(
  input: string | null | undefined,
  translationField: string | null | undefined,
): boolean {
  if (!translationField?.trim()) return false
  const u = normalizeAnswer(input)
  if (!u) return false

  const variants = translationField
    .split(/\s*[,;/|]\s*/u)
    .map((p) => normalizeAnswer(p))
    .filter((v) => v.length > 0)

  return variants.some((v) => v.length >= 2 && (u === v || u.includes(v) || v.includes(u)))
}
