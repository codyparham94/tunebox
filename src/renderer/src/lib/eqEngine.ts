import { EQ_BANDS, type EqState } from '@shared/eq'

/**
 * <audio> → preamp → 10 biquad bands → speakers. Built lazily on first play, since an
 * element can be attached to a MediaElementAudioSourceNode only once.
 */
let ctx: AudioContext | null = null
let preamp: GainNode | null = null
let bands: BiquadFilterNode[] = []
let current: EqState | null = null

function makeBands(c: BaseAudioContext): BiquadFilterNode[] {
  return EQ_BANDS.map((freq, i) => {
    const f = c.createBiquadFilter()
    f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
    f.frequency.value = freq
    f.Q.value = 1.1
    return f
  })
}

export function connectEq(audio: HTMLAudioElement): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  ctx = new AudioContext()
  const source = ctx.createMediaElementSource(audio)
  preamp = ctx.createGain()
  bands = makeBands(ctx)
  let node: AudioNode = preamp
  source.connect(preamp)
  for (const b of bands) {
    node.connect(b)
    node = b
  }
  node.connect(ctx.destination)
  if (current) applyEq(current)
}

/** Smoothly moves the live filters to `state`. Safe to call before audio exists. */
export function applyEq(state: EqState): void {
  current = state
  if (!ctx || !preamp) return
  const t = ctx.currentTime
  bands.forEach((b, i) => b.gain.setTargetAtTime(state.enabled ? (state.gains[i] ?? 0) : 0, t, 0.02))
  preamp.gain.setTargetAtTime(state.enabled ? Math.pow(10, state.preamp / 20) : 1, t, 0.02)
}

/* ---------- response curve for the UI (works without any playing audio) ---------- */

let offline: { bands: BiquadFilterNode[] } | null = null

/** Combined gain in dB at each frequency for the given band gains + preamp. */
export function responseCurve(gains: number[], preampDb: number, freqs: Float32Array<ArrayBuffer>): Float32Array {
  offline ??= { bands: makeBands(new OfflineAudioContext(1, 128, 44100)) }
  const total = new Float32Array(freqs.length).fill(preampDb)
  const mag = new Float32Array(freqs.length)
  const phase = new Float32Array(freqs.length)
  offline.bands.forEach((b, i) => {
    b.gain.value = gains[i] ?? 0
    b.getFrequencyResponse(freqs, mag, phase)
    for (let k = 0; k < freqs.length; k++) total[k] += 20 * Math.log10(mag[k])
  })
  return total
}
