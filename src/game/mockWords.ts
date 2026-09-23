import type { GameWord } from './gameTypes'

/**
 * Запасной словарь, если в каталоге пользователя не хватает пар.
 * Соседние слова часто близки по смыслу — старшие уровни берут более длинный срез.
 */
export const MOCK_WORDS: GameWord[] = [
  { id: -1, english: 'house', translation: 'дом', level: 'A1' },
  { id: -2, english: 'home', translation: 'жилище', level: 'A2' },
  { id: -3, english: 'car', translation: 'машина', level: 'A1' },
  { id: -4, english: 'bus', translation: 'автобус', level: 'A1' },
  { id: -5, english: 'book', translation: 'книга', level: 'A1' },
  { id: -6, english: 'page', translation: 'страница', level: 'A1' },
  { id: -7, english: 'cat', translation: 'кошка', level: 'A1' },
  { id: -8, english: 'dog', translation: 'собака', level: 'A1' },
  { id: -9, english: 'tree', translation: 'дерево', level: 'A1' },
  { id: -10, english: 'leaf', translation: 'лист', level: 'A1' },
  { id: -11, english: 'water', translation: 'вода', level: 'A1' },
  { id: -12, english: 'river', translation: 'река', level: 'A1' },
  { id: -13, english: 'sun', translation: 'солнце', level: 'A1' },
  { id: -14, english: 'moon', translation: 'луна', level: 'A1' },
  { id: -15, english: 'girl', translation: 'девочка', level: 'A1' },
  { id: -16, english: 'boy', translation: 'мальчик', level: 'A1' },
  { id: -17, english: 'apple', translation: 'яблоко', level: 'A1' },
  { id: -18, english: 'bread', translation: 'хлеб', level: 'A1' },
  { id: -19, english: 'milk', translation: 'молоко', level: 'A1' },
  { id: -20, english: 'friend', translation: 'друг', level: 'A1' },
  { id: -21, english: 'family', translation: 'семья', level: 'A1' },
  { id: -22, english: 'school', translation: 'школа', level: 'A1' },
  { id: -23, english: 'city', translation: 'город', level: 'A1' },
  { id: -24, english: 'road', translation: 'дорога', level: 'A1' },
  { id: -25, english: 'time', translation: 'время', level: 'A1' },
  { id: -26, english: 'day', translation: 'день', level: 'A1' },
  { id: -27, english: 'night', translation: 'ночь', level: 'A1' },
  { id: -28, english: 'work', translation: 'работа', level: 'A1' },
  { id: -29, english: 'happy', translation: 'рад', level: 'A1' },
  { id: -30, english: 'big', translation: 'большой', level: 'A1' },
  { id: -31, english: 'small', translation: 'маленький', level: 'A1' },
  { id: -32, english: 'red', translation: 'красный', level: 'A1' },
  { id: -33, english: 'blue', translation: 'синий', level: 'A1' },
  { id: -34, english: 'green', translation: 'зелёный', level: 'A1' },
  { id: -35, english: 'bird', translation: 'птица', level: 'A1' },
  { id: -36, english: 'fish', translation: 'рыба', level: 'A1' },
  { id: -37, english: 'table', translation: 'стол', level: 'A1' },
  { id: -38, english: 'chair', translation: 'стул', level: 'A1' },
  { id: -39, english: 'window', translation: 'окно', level: 'A1' },
  { id: -40, english: 'door', translation: 'дверь', level: 'A1' },
]

export function pickMockWords(count: number, usedEnglish: Set<string> = new Set()): GameWord[] {
  const out: GameWord[] = []
  for (const word of MOCK_WORDS) {
    if (out.length >= count) break
    if (usedEnglish.has(word.english.toLowerCase())) continue
    out.push(word)
  }
  return out
}
