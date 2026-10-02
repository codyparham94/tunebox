import { useMemo, useState } from 'react'
import { BUILT_IN_PRESETS, CUSTOM_ID, EQ_BANDS, EQ_MAX_DB, EQ_MIN_DB, formatHz } from '@shared/eq'
import { responseCurve } from '../lib/eqEngine'
import { api } from '../lib/queries'
import { eq, useEq } from '../store/eq'
import { toast } from '../store/toast'
import { PopOutIcon, TrashIcon } from './Icons'

const fmtDb = (db: number) => `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`

/** Full equalizer panel. Used in Settings and in the pop-out window. */
export function Equalizer({ popped = false }: { popped?: boolean }) {
  const { state, loaded } = useEq()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const selectedCustom = state.custom.find((p) => p.id === state.presetId)

  if (!loaded) return <p className="tile-sub">Loading equalizer…</p>

  return (
    <div className={`eq-panel${state.enabled ? '' : ' eq-off'}`}>
      <div className="eq-toolbar">
        <label className="eq-switch">
          <input type="checkbox" role="switch" checked={state.enabled} onChange={(e) => eq.setEnabled(e.target.checked)} />
          <span className="eq-switch-track" aria-hidden="true" />
          {state.enabled ? 'On' : 'Off'}
        </label>

        <label className="sr-only" htmlFor={`eq-preset-${popped ? 'pop' : 'main'}`}>
          Preset
        </label>
        <select
          id={`eq-preset-${popped ? 'pop' : 'main'}`}
          className="input eq-select"
          value={state.presetId}
          onChange={(e) => eq.selectPreset(e.target.value)}
        >
          {state.presetId === CUSTOM_ID && (
            <option value={CUSTOM_ID} disabled>
              Custom (unsaved)
            </option>
          )}
          <optgroup label="Presets">
            {BUILT_IN_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {state.custom.length > 0 && (
            <optgroup label="Your presets">
              {state.custom.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <div className="row" style={{ marginLeft: 'auto' }}>
          {selectedCustom && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => {
                eq.deleteCustom(selectedCustom.id)
                toast.info(`Deleted preset “${selectedCustom.name}”`)
              }}
            >
              <TrashIcon size={14} /> Delete
            </button>
          )}
          <button className="btn btn-sm" onClick={eq.reset}>
            Reset
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              setName(selectedCustom?.name ?? '')
              setSaving((v) => !v)
            }}
            aria-expanded={saving}
          >
            Save preset
          </button>
          {!popped && (
            <button className="btn btn-sm" onClick={() => void api.eq.popout()} title="Open the equalizer in its own window">
              <PopOutIcon size={14} /> Pop out
            </button>
          )}
        </div>
      </div>

      {saving && (
        <form
          className="row eq-save"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            eq.saveCustom(name)
            toast.success(`Saved preset “${name.trim()}”`)
            setSaving(false)
          }}
        >
          <label className="sr-only" htmlFor="eq-name">
            Preset name
          </label>
          <input id="eq-name" className="input" placeholder="Preset name, e.g. Car stereo" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
          <button className="btn btn-primary" disabled={!name.trim()}>
            Save
          </button>
          <button type="button" className="btn" onClick={() => setSaving(false)}>
            Cancel
          </button>
        </form>
      )}

      <ResponseCurve gains={state.gains} preamp={state.preamp} enabled={state.enabled} />

      <div className="eq-sliders">
        <Slider label="Preamp" value={state.preamp} onChange={eq.setPreamp} />
        <span className="eq-divider" aria-hidden="true" />
        {EQ_BANDS.map((hz, i) => (
          <Slider key={hz} label={`${formatHz(hz)}`} ariaLabel={`${formatHz(hz)}Hz band`} value={state.gains[i] ?? 0} onChange={(db) => eq.setBand(i, db)} />
        ))}
      </div>
      <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>
        Drag a slider or use the arrow keys. Double-click a slider to reset it to 0 dB.
      </p>
    </div>
  )
}

function Slider({ label, ariaLabel, value, onChange }: { label: string; ariaLabel?: string; value: number; onChange: (db: number) => void }) {
  return (
    <div className="eq-band">
      <span className="eq-value mono">{value > 0 ? `+${value}` : value}</span>
      <input
        type="range"
        className="eq-slider"
        min={EQ_MIN_DB}
        max={EQ_MAX_DB}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(0)}
        aria-label={ariaLabel ?? label}
        aria-valuetext={fmtDb(value)}
      />
      <span className="eq-label mono">{label}</span>
    </div>
  )
}

const W = 600
const H = 120
const FREQS = (() => {
  const n = 160
  const f = new Float32Array(n)
  for (let i = 0; i < n; i++) f[i] = 20 * Math.pow(1000, i / (n - 1)) // 20 Hz → 20 kHz
  return f
})()
const x = (hz: number) => (Math.log10(hz / 20) / 3) * W
const y = (db: number) => H / 2 - (Math.max(-15, Math.min(15, db)) / 15) * (H / 2 - 4)

function ResponseCurve({ gains, preamp, enabled }: { gains: number[]; preamp: number; enabled: boolean }) {
  const path = useMemo(() => {
    const db = enabled ? responseCurve(gains, preamp, FREQS) : new Float32Array(FREQS.length)
    return Array.from(FREQS, (f, i) => `${i ? 'L' : 'M'}${x(f).toFixed(1)},${y(db[i]).toFixed(1)}`).join(' ')
  }, [gains, preamp, enabled])

  return (
    <svg className="eq-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Frequency response">
      {[-12, -6, 0, 6, 12].map((db) => (
        <line key={db} x1={0} x2={W} y1={y(db)} y2={y(db)} className={db === 0 ? 'eq-grid-zero' : 'eq-grid'} />
      ))}
      {EQ_BANDS.map((hz) => (
        <line key={hz} x1={x(hz)} x2={x(hz)} y1={0} y2={H} className="eq-grid" />
      ))}
      <path d={`${path} L${W},${H} L0,${H} Z`} className="eq-fill" />
      <path d={path} className="eq-line" />
    </svg>
  )
}
