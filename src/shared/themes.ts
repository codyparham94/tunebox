export interface ThemeInfo {
  id: string
  name: string
  /** where the palette comes from: a local design skill or an awesome-design-md entry */
  source: string
  dark: boolean
  /** primary, secondary, surface: for the picker swatch */
  swatch: [string, string, string]
}

/** Every theme's tokens live in renderer/src/styles/themes.css under :root[data-theme='<id>']. */
export const THEMES: ThemeInfo[] = [
  // light
  { id: 'light', name: 'Bento', source: 'bento skill', dark: false, swatch: ['#FAD4C0', '#80A1C1', '#FFF5E6'] },
  { id: 'cafe', name: 'Café', source: 'cafe skill', dark: false, swatch: ['#5D4432', '#E9E3DD', '#F9F7F5'] },
  { id: 'terracotta', name: 'Terracotta', source: 'terracotta skill', dark: false, swatch: ['#C56A3C', '#F3E9D8', '#FBF6EE'] },
  { id: 'claude', name: 'Parchment', source: 'claude skill', dark: false, swatch: ['#141413', '#E8E6DC', '#F0EEE6'] },
  { id: 'riso', name: 'Riso', source: 'riso skill', dark: false, swatch: ['#F237A1', '#2C40A7', '#F7F1E6'] },
  { id: 'neobrutalism', name: 'Neo-Brutal', source: 'neobrutalism skill', dark: false, swatch: ['#FDC800', '#432DD7', '#FBFBF9'] },
  { id: 'lingo', name: 'Lingo', source: 'lingo skill', dark: false, swatch: ['#58CC02', '#CE82FF', '#FFFFFF'] },
  { id: 'vintage', name: 'Vintage OS', source: 'vintage skill', dark: false, swatch: ['#008080', '#000080', '#C0C0C0'] },
  // dark
  { id: 'dark', name: 'Bento Night', source: 'bento skill', dark: true, swatch: ['#FAD4C0', '#80A1C1', '#16120F'] },
  { id: 'enterprise', name: 'Enterprise', source: 'enterprise skill', dark: true, swatch: ['#0C5CAB', '#0A4A8A', '#09090B'] },
  { id: 'dramatic', name: 'Dramatic', source: 'dramatic skill', dark: true, swatch: ['#8B5CF6', '#F43F5E', '#09090B'] },
  { id: 'neon', name: 'Neon', source: 'neon skill', dark: true, swatch: ['#BBF351', '#00BCFF', '#0A0A0F'] },
  { id: 'matrix', name: 'Matrix', source: 'matrix skill', dark: true, swatch: ['#2DB58A', '#1E3A32', '#0B0C14'] },
  { id: 'cosmic', name: 'Cosmic', source: 'cosmic skill', dark: true, swatch: ['#3B82F6', '#8B5CF6', '#070B1A'] },
  { id: 'power', name: 'Power', source: 'power skill', dark: true, swatch: ['#FAFAFA', '#262626', '#000000'] },
  { id: 'arcade', name: 'Arcade', source: 'pacman skill', dark: true, swatch: ['#2A3FE5', '#FFE000', '#000000'] },
  { id: 'greenroom', name: 'Green Room', source: 'awesome-design-md: spotify', dark: true, swatch: ['#1ED760', '#2A2A2A', '#121212'] },
  { id: 'indigo', name: 'Indigo Night', source: 'awesome-design-md: linear', dark: true, swatch: ['#5E6AD2', '#23252A', '#08090A'] },
  { id: 'command', name: 'Command', source: 'awesome-design-md: raycast', dark: true, swatch: ['#FFFFFF', '#57C1FF', '#07080A'] },
  { id: 'ember', name: 'Ember Terminal', source: 'awesome-design-md: warp', dark: true, swatch: ['#F7F5F0', '#4A4038', '#2B2622'] },
  { id: 'mint', name: 'Mint Night', source: 'awesome-design-md: supabase', dark: true, swatch: ['#3ECF8E', '#24B47E', '#1C1C1C'] },
  { id: 'console', name: 'Console', source: 'awesome-design-md: playstation', dark: true, swatch: ['#0070D1', '#D53B00', '#121314'] },
  { id: 'nightshade', name: 'Nightshade', source: 'awesome-design-md: sentry', dark: true, swatch: ['#C2EF4E', '#FA7FAA', '#1F1633'] },
  { id: 'void', name: 'Void', source: 'awesome-design-md: x.ai', dark: true, swatch: ['#FFFFFF', '#FF7A17', '#0A0A0A'] },
  { id: 'circuit', name: 'Circuit', source: 'awesome-design-md: nvidia', dark: true, swatch: ['#76B900', '#0046A4', '#000000'] },
  { id: 'raging', name: 'Raging Bull', source: 'awesome-design-md: lamborghini', dark: true, swatch: ['#FFC000', '#3A3A3A', '#000000'] }
]

export const DARK_THEME_IDS = new Set(THEMES.filter((t) => t.dark).map((t) => t.id))
