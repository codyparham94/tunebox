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

export interface ThemeInfo {
  id: string
  name: string
  /** design skill it comes from (.agents/skills/<skill>) */
  skill: string
  dark: boolean
  /** primary, secondary, surface: for the picker swatch */
  swatch: [string, string, string]
}

/** Every theme's tokens live in styles/themes.css under :root[data-theme='<id>']. */
export const THEMES: ThemeInfo[] = [
  { id: 'light', name: 'Bento', skill: 'bento', dark: false, swatch: ['#FAD4C0', '#80A1C1', '#FFF5E6'] },
  { id: 'dark', name: 'Bento Night', skill: 'bento', dark: true, swatch: ['#FAD4C0', '#80A1C1', '#16120F'] },
  { id: 'cafe', name: 'Café', skill: 'cafe', dark: false, swatch: ['#5D4432', '#E9E3DD', '#F9F7F5'] },
  { id: 'terracotta', name: 'Terracotta', skill: 'terracotta', dark: false, swatch: ['#C56A3C', '#F3E9D8', '#FBF6EE'] },
  { id: 'claude', name: 'Parchment', skill: 'claude', dark: false, swatch: ['#141413', '#E8E6DC', '#F0EEE6'] },
  { id: 'riso', name: 'Riso', skill: 'riso', dark: false, swatch: ['#F237A1', '#2C40A7', '#F7F1E6'] },
  { id: 'neobrutalism', name: 'Neo-Brutal', skill: 'neobrutalism', dark: false, swatch: ['#FDC800', '#432DD7', '#FBFBF9'] },
  { id: 'lingo', name: 'Lingo', skill: 'lingo', dark: false, swatch: ['#58CC02', '#CE82FF', '#FFFFFF'] },
  { id: 'vintage', name: 'Vintage OS', skill: 'vintage', dark: false, swatch: ['#008080', '#000080', '#C0C0C0'] },
  { id: 'enterprise', name: 'Enterprise', skill: 'enterprise', dark: true, swatch: ['#0C5CAB', '#0A4A8A', '#09090B'] },
  { id: 'dramatic', name: 'Dramatic', skill: 'dramatic', dark: true, swatch: ['#8B5CF6', '#F43F5E', '#09090B'] },
  { id: 'neon', name: 'Neon', skill: 'neon', dark: true, swatch: ['#BBF351', '#00BCFF', '#0A0A0F'] },
  { id: 'matrix', name: 'Matrix', skill: 'matrix', dark: true, swatch: ['#2DB58A', '#1E3A32', '#0B0C14'] }
]

/** 'system' follows Windows light/dark with the Bento palette. */
export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): string {
  if (setting === 'system') return prefersDark ? 'dark' : 'light'
  return THEMES.some((t) => t.id === setting) ? setting : 'light'
}
