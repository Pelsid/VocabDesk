/**
 * В экспорте .backup у многих словарей CUSTOM_ICON пустой — иконки в мобильном клиенте подставляются по ID.
 * Берём CUSTOM_ICON из БД, если есть (book, advanced_words…), иначе эмодзи по category ID.
 */
const CUSTOM_ICON_KEY: Record<string, string> = {
  book: '📖',
  advanced_words: '📚',
  custom: '📝',
}

/** Все ID категорий из типичного english-бэкапа + осмысленные эмодзи (как в UI приложения). */
const BY_CATEGORY_ID: Record<string, string> = {
  advanced_words: '📚',
  anatomy: '🩻',
  animals: '🐘',
  appearance: '🪞',
  archaeology: '🏺',
  architecture: '🏛️',
  art: '🎨',
  basic_verbs: '🔤',
  business: '💳',
  career: '👔',
  character: '👨‍👩‍👧',
  clothing: '🧥',
  colors: '🎨',
  computer: '💻',
  construction: '🚜',
  ecology: '🌱',
  economy: '💵',
  family: '👨‍👩‍👧',
  fish: '🐠',
  flowers: '💐',
  food: '🍕',
  furniture: '🛋️',
  geography: '🌍',
  health: '🏥',
  hobby: '🎨',
  home: '🏠',
  idioms: '📘',
  irregular_verbs: '🔠',
  legal_english: '⚖️',
  literature: '📖',
  marketing: '📊',
  mass_media: '📰',
  math: '📐',
  military_weapons: '💣',
  money: '💵',
  movie: '🎬',
  music: '🎸',
  numbers: '🔢',
  photography: '📷',
  phrasal_verbs: '📗',
  politics: '🏛️',
  psychology: '🧠',
  shops: '🛒',
  signs_of_zodiac: '♏',
  social_networks: '📱',
  space: '🚀',
  sport: '🎾',
  time_calendar: '📅',
  top100: '📗',
  top1000: '📘',
  top3000: '📙',
  town: '🌆',
  transport: '🚗',
  travel: '✈️',
  trees: '🌳',
  oxford3000_a1: '📕',
  oxford3000_a2: '📗',
  oxford3000_b1: '📘',
  oxford3000_b2: '📙',
  oxford5000_c1: '📓',
}

const FALLBACK = '📚'

export function getCategoryGlyph(categoryId: string, customIconFromDb: string | null | undefined): string {
  const key = customIconFromDb?.trim()
  if (key) {
    if (CUSTOM_ICON_KEY[key]) return CUSTOM_ICON_KEY[key]
    if (BY_CATEGORY_ID[key]) return BY_CATEGORY_ID[key]
  }
  return BY_CATEGORY_ID[categoryId] ?? FALLBACK
}
