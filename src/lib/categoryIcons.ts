/** Иконка личного словаря по ключу из БД, иначе эмодзи по id категории. */
const CUSTOM_ICON_KEY: Record<string, string> = {
  book: '📖',
  advanced_words: '📚',
  custom: '📝',
}

const BY_CATEGORY_ID: Record<string, string> = {
  anatomy: '🩻',
  animals: '🐘',
  appearance: '🪞',
  archaeology: '🏺',
  architecture: '🏛️',
  art: '🎨',
  business: '💳',
  career: '👔',
  character: '🎭',
  clothing: '🧥',
  colors: '🎨',
  communication: '💬',
  computer: '💻',
  construction: '🚜',
  ecology: '🌱',
  economy: '💵',
  education: '🎓',
  emotions: '💭',
  family: '👨‍👩‍👧',
  fish: '🐠',
  flowers: '💐',
  food: '🍕',
  function_words: '🔤',
  furniture: '🛋️',
  general: '📘',
  geography: '🌍',
  health: '🏥',
  hobby: '🎨',
  home: '🏠',
  legal_english: '⚖️',
  literature: '📖',
  marketing: '📊',
  mass_media: '📰',
  math: '📐',
  military_weapons: '💣',
  money: '💵',
  movie: '🎬',
  music: '🎸',
  nature: '🌿',
  numbers: '🔢',
  photography: '📷',
  politics: '🏛️',
  psychology: '🧠',
  religion: '🕊️',
  science: '🔬',
  shops: '🛒',
  social_networks: '📱',
  society: '👥',
  space: '🚀',
  sport: '🎾',
  time_calendar: '📅',
  town: '🌆',
  transport: '🚗',
  travel: '✈️',
  trees: '🌳',
  weather: '🌤️',
  level_a1: '📕',
  level_a2: '📗',
  level_b1: '📘',
  level_b2: '📙',
  level_c1: '📓',
  level_c2: '📔',
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
