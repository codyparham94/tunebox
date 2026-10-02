import { create } from 'zustand'
import { BUILT_IN_PRESETS, CUSTOM_ID, DEFAULT_EQ, EQ_MAX_DB, EQ_MIN_DB, findPreset, type EqState } from '@shared/eq'
import { applyEq } from '../lib/eqEngine'
import { api } from '../lib/queries'

/** Identifies this window, so it ignores its own broadcasts. */
const CLIENT_ID = crypto.randomUUID()

export const useEq = create<{ state: EqState; loaded: boolean }>(() => ({ state: DEFAULT_EQ, loaded: false }))

const clamp = (db: number) => Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, Math.round(db * 2) / 2))

/** Apply locally right away, then save + sync to the other window (main or pop-out). */
function commit(next: EqState): void {
  useEq.setState({ state: next })
  applyEq(next)
  void api.eq.set(next, CLIENT_ID)
}

let listening = false

export const eq = {
  async load(): Promise<void> {
    const state = await api.eq.get()
    useEq.setState({ state, loaded: true })
    applyEq(state)
    if (listening) return
    listening = true
    window.api.onEq(({ state: next, clientId }) => {
      if (clientId === CLIENT_ID) return
      useEq.setState({ state: next })
      applyEq(next)
    })
  },

  setEnabled(enabled: boolean): void {
    commit({ ...useEq.getState().state, enabled })
  },

  /** Moving a band switches to an unsaved custom curve and turns the EQ on. */
  setBand(index: number, db: number): void {
    const s = useEq.getState().state
    const gains = s.gains.map((g, i) => (i === index ? clamp(db) : g))
    commit({ ...s, gains, presetId: CUSTOM_ID, enabled: true })
  },

  setPreamp(db: number): void {
    const s = useEq.getState().state
    commit({ ...s, preamp: clamp(db), presetId: CUSTOM_ID, enabled: true })
  },

  selectPreset(id: string): void {
    const s = useEq.getState().state
    const preset = findPreset(s, id)
    if (!preset) return
    commit({ ...s, presetId: id, gains: [...preset.gains], preamp: preset.preamp, enabled: true })
  },

  reset(): void {
    eq.selectPreset(BUILT_IN_PRESETS[0].id)
  },

  /** Saves the current curve. Reusing a custom preset's name overwrites it. */
  saveCustom(name: string): void {
    const s = useEq.getState().state
    const clean = name.trim().slice(0, 40)
    if (!clean) return
    const existing = s.custom.find((p) => p.name.toLowerCase() === clean.toLowerCase())
    const preset = { id: existing?.id ?? `user-${Date.now()}`, name: clean, gains: [...s.gains], preamp: s.preamp }
    const custom = existing ? s.custom.map((p) => (p.id === existing.id ? preset : p)) : [...s.custom, preset]
    commit({ ...s, custom, presetId: preset.id })
  },

  deleteCustom(id: string): void {
    const s = useEq.getState().state
    commit({ ...s, custom: s.custom.filter((p) => p.id !== id), presetId: s.presetId === id ? CUSTOM_ID : s.presetId })
  }
}
