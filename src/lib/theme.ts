export type ThemePref = 'dark' | 'light'

export function applyTheme(theme: ThemePref) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
}
