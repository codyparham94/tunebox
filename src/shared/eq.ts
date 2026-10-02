/** Centre frequencies (Hz) of the 10 bands. First is a low shelf, last a high shelf. */
export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const EQ_MIN_DB = -12
export const EQ_MAX_DB = 12

export interface EqPreset {
  id: string
  name: string
  /** dB per band, same order as EQ_BANDS */
  gains: number[]
  /** dB applied before the bands, to leave headroom for boosts */
  preamp: number
}

export interface EqState {
  enabled: boolean
  /** id of the selected preset, or 'custom' once a band is moved by hand */
  presetId: string
  gains: number[]
  preamp: number
  /** presets the user saved */
  custom: EqPreset[]
}

export const CUSTOM_ID = 'custom'

/** Headroom so boosted presets don't clip: half the largest boost, in 0.5 dB steps. */
export function autoPreamp(gains: number[]): number {
  const peak = Math.max(0, ...gains)
  return peak > 0 ? -Math.round(peak) / 2 : 0
}

const p = (id: string, name: string, gains: number[]): EqPreset => ({ id, name, gains, preamp: autoPreamp(gains) })

export const BUILT_IN_PRESETS: EqPreset[] = [
  p('flat', 'Flat', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  p('bass-boost', 'Bass Boost', [6, 5.5, 4.5, 2.5, 0.5, 0, 0, 0, 0, 0]),
  p('bass-reducer', 'Bass Reducer', [-6, -5, -4, -2, -0.5, 0, 0, 0, 0, 0]),
  p('treble-boost', 'Treble Boost', [0, 0, 0, 0, 0, 0.5, 2, 4, 5.5, 6]),
  p('treble-reducer', 'Treble Reducer', [0, 0, 0, 0, 0, -0.5, -2, -4, -5.5, -6]),
  p('vocal', 'Vocal Boost', [-2, -2, -1, 1, 3, 4, 4, 2.5, 1, 0]),
  p('spoken', 'Spoken Word', [-3, -2, 0, 1, 3.5, 4.5, 4, 3, 1.5, 0]),
  p('loudness', 'Loudness', [6, 4, 0, 0, -2, 0, -1, -5, 5, 1]),
  p('late-night', 'Late Night', [-4, -3, -1, 0, 1, 2, 2, 1, -1, -2]),
  p('headphones', 'Headphones', [3, 2, 0, -1, -1, 0, 1, 2, 3, 2.5]),
  p('small-speakers', 'Small Speakers', [5, 4, 3.5, 2.5, 1, 0, -1, -1.5, -2, -2.5]),
  p('deep', 'Deep', [5, 3.5, 1.5, 1, 3, 2.5, 1.5, -2, -3.5, -4.5]),
  p('rock', 'Rock', [5, 4, 3, 1, -1, -1, 1, 3, 4, 5]),
  p('metal', 'Metal', [4, 3, 0, -2, -3, -1, 2, 4, 4, 3]),
  p('pop', 'Pop', [-1, 0, 2, 3.5, 4, 3, 1.5, 0, -0.5, -1]),
  p('dance', 'Dance', [4, 6, 4.5, 0, 1.5, 3, 4.5, 4, 3, 0]),
  p('electronic', 'Electronic', [5, 4.5, 1.5, 0, -2, 2, 1, 1.5, 4.5, 5]),
  p('hip-hop', 'Hip-Hop', [5.5, 4.5, 1.5, 3, -1, -1, 1.5, -0.5, 2, 3]),
  p('rnb', 'R&B', [3, 6.5, 5.5, 1.5, -2.5, -1.5, 2.5, 3, 3, 3.5]),
  p('jazz', 'Jazz', [3, 2.5, 1, 2, -1.5, -1.5, 0, 1.5, 3, 3.5]),
  p('classical', 'Classical', [4, 3, 2.5, 1.5, -1, -1, 0, 2, 3, 3.5]),
  p('acoustic', 'Acoustic', [4, 4, 3, 1, 2, 1.5, 3, 3.5, 3, 2]),
  p('piano', 'Piano', [2.5, 1.5, 0, 2.5, 3, 1.5, 3.5, 4.5, 3, 3.5]),
  p('country', 'Country', [1, 1, 0, 1.5, 3, 3, 2, 1.5, 1, 0]),
  p('latin', 'Latin', [4.5, 3, 0, 0, -1.5, -1.5, -1.5, 0, 3, 4.5]),
  p('lounge', 'Lounge', [-3, -1.5, -0.5, 1.5, 4, 2.5, 0, -1.5, 2, 1])
]

export const DEFAULT_EQ: EqState = {
  enabled: false,
  presetId: 'flat',
  gains: [...BUILT_IN_PRESETS[0].gains],
  preamp: 0,
  custom: []
}

export function findPreset(state: EqState, id: string): EqPreset | undefined {
  return BUILT_IN_PRESETS.find((x) => x.id === id) ?? state.custom.find((x) => x.id === id)
}

export const formatHz = (hz: number): string => (hz >= 1000 ? `${hz / 1000}k` : String(hz))
