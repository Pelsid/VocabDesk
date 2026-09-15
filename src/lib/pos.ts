/** Reword POS bitmask → русские подписи части речи. */

const POS_BITS: Array<{ bit: number; label: string }> = [
  { bit: 1, label: 'Существительное' },
  { bit: 2, label: 'Глагол' },
  { bit: 4, label: 'Прилагательное' },
  { bit: 8, label: 'Наречие' },
  { bit: 16, label: 'Местоимение' },
  { bit: 32, label: 'Предлог' },
  { bit: 64, label: 'Союз' },
  { bit: 128, label: 'Междометие' },
  { bit: 256, label: 'Артикль' },
  { bit: 512, label: 'Числительное' },
  { bit: 1024, label: 'Частица' },
  { bit: 2048, label: 'Причастие' },
]

export function posLabels(mask: number | null | undefined): string[] {
  const n = Number(mask)
  if (!Number.isFinite(n) || n <= 0) return []
  return POS_BITS.filter((p) => (n & p.bit) === p.bit).map((p) => p.label)
}
