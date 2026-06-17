/** Тема оформления: светлая / тёмная / системная. Класс `.dark` на <html>. */
export type Theme = 'light' | 'dark' | 'system'

const KEY = 'svoyakniga.theme'

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' || t === 'system' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(): void {
  const t = getTheme()
  let dark = t === 'dark'
  if (t === 'system') {
    try {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch {
      dark = false
    }
  }
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
  applyTheme()
}
