import { describe, expect, it } from 'vitest'
import { BUILT_IN_PRESETS, DEFAULT_EQ, EQ_BANDS, EQ_MAX_DB, EQ_MIN_DB, autoPreamp, findPreset } from '../src/shared/eq'

describe('equalizer presets', () => {
  it('has many presets with unique ids and names', () => {
    expect(BUILT_IN_PRESETS.length).toBeGreaterThanOrEqual(20)
    expect(new Set(BUILT_IN_PRESETS.map((p) => p.id)).size).toBe(BUILT_IN_PRESETS.length)
    expect(new Set(BUILT_IN_PRESETS.map((p) => p.name)).size).toBe(BUILT_IN_PRESETS.length)
  })

  it('every preset sets every band within range', () => {
    for (const p of BUILT_IN_PRESETS) {
      expect(p.gains, p.name).toHaveLength(EQ_BANDS.length)
      for (const g of p.gains) {
        expect(g).toBeGreaterThanOrEqual(EQ_MIN_DB)
        expect(g).toBeLessThanOrEqual(EQ_MAX_DB)
      }
    }
  })

  it('boosted presets get headroom so they do not clip', () => {
    expect(autoPreamp([0, 0, 0])).toBe(0)
    expect(autoPreamp([-6, -3])).toBe(0)
    expect(autoPreamp([6, 2])).toBe(-3)
    for (const p of BUILT_IN_PRESETS) expect(p.preamp).toBeLessThanOrEqual(0)
  })

  it('finds built-in and saved presets', () => {
    const state = { ...DEFAULT_EQ, custom: [{ id: 'user-1', name: 'Car', gains: Array(10).fill(1), preamp: -0.5 }] }
    expect(findPreset(state, 'rock')?.name).toBe('Rock')
    expect(findPreset(state, 'user-1')?.name).toBe('Car')
    expect(findPreset(state, 'nope')).toBeUndefined()
  })

  it('defaults to off and flat', () => {
    expect(DEFAULT_EQ.enabled).toBe(false)
    expect(DEFAULT_EQ.gains.every((g) => g === 0)).toBe(true)
  })
})
