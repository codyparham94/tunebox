import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/space-mono/latin-400.css'
import '@fontsource/space-mono/latin-700.css'
import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/space-grotesk/latin-700.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/outfit/latin-400.css'
import '@fontsource/outfit/latin-600.css'
import '@fontsource/outfit/latin-800.css'
import '@fontsource/nunito/latin-400.css'
import '@fontsource/nunito/latin-700.css'
import '@fontsource/nunito/latin-800.css'
import '@fontsource/dm-serif-display/latin-400.css'
import type { ThemeSetting } from '@shared/types'
import { THEMES } from '@shared/themes'

export { THEMES, type ThemeInfo } from '@shared/themes'

/** 'system' follows Windows light/dark with the Bento palette. */
export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): string {
  if (setting === 'system') return prefersDark ? 'dark' : 'light'
  return THEMES.some((t) => t.id === setting) ? setting : 'light'
}
