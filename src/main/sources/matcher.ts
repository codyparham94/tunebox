import type { Track } from '@shared/types'
import { basicNormalize, normalizeArtist, normalizeTitle, similarity, trackKey } from '../util/text'

export interface MatchSource {
  title: string
  artist: string
  duration?: number
}

export interface MatchCandidate extends Track {
  kind?: 'song' | 'video'
}

export interface MatchResult {
  track: Track
  confidence: number
}

export const ACCEPT_CONFIDENCE = 0.6
/** Whole-word patterns, compiled once: they run for every candidate the matcher scores. */
const VARIANT_WORDS = ['live', 'cover', 'remix', 'karaoke', 'instrumental', 'acoustic', 'sped up', 'slowed', 'nightcore', 'reverb', '8d'].map(
  (word) => new RegExp(`(^|\\s)${word}(\\s|$)`)
)

function titleScore(a: string, b: string): number {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const s = similarity(na, nb)
  return na.includes(nb) || nb.includes(na) ? Math.max(s, 0.9) : s
}

function artistScore(source: string, candidate: string): number {
  const src = normalizeArtist(source)
  const credits = candidate.split(/\s*,\s*/).map(normalizeArtist)
  if (credits.includes(src) || basicNormalize(candidate).includes(basicNormalize(source))) return 1
  return Math.max(0, ...credits.map((c) => similarity(src, c)))
}

/** Confidence in [0, 1] that `c` is the recording described by `source`. */
export function scoreCandidate(source: MatchSource, c: MatchCandidate): number {
  const t = titleScore(source.title, c.title)
  const a = artistScore(source.artist, c.artist)
  let score: number
  if (source.duration && c.duration) {
    const diff = Math.abs(source.duration - c.duration)
    const dur = diff <= 5 ? 0.2 : diff <= 15 ? 0.1 : diff > 30 ? -0.15 : 0
    score = 0.5 * t + 0.3 * a + dur
  } else {
    score = (0.5 * t + 0.3 * a) / 0.8
  }
  if (c.kind === 'video') score -= 0.1
  if (/ - topic$/i.test(c.artist)) score += 0.05

  const srcTitle = basicNormalize(source.title)
  const candTitle = basicNormalize(`${c.title} ${c.album ?? ''}`)
  let penalty = 0
  for (const w of VARIANT_WORDS) if (w.test(candTitle) && !w.test(srcTitle)) penalty += 0.3
  score -= Math.min(penalty, 0.45)

  return Math.max(0, Math.min(1, score))
}

/** Best candidate at or above the threshold, otherwise the top result with its (low) confidence. */
export function pickBest(source: MatchSource, candidates: MatchCandidate[]): MatchResult | null {
  if (candidates.length === 0) return null
  const scored = candidates.map((c) => ({ track: c as Track, confidence: scoreCandidate(source, c) }))
  const best = scored.reduce((a, b) => (b.confidence > a.confidence ? b : a))
  if (best.confidence >= ACCEPT_CONFIDENCE) return best
  return scored[0]
}

export interface MatcherDeps {
  search(query: string): Promise<MatchCandidate[]>
  cacheGet(key: string): { videoId: string | null; confidence: number } | undefined
  cachePut(key: string, entry: { videoId: string | null; confidence: number }): void
  lookup(videoId: string): Track | undefined
}

/** Metadata track → YouTube videoId, cached in `match_cache`. */
export async function matchTrack(source: MatchSource & Partial<Track>, deps: MatcherDeps): Promise<MatchResult | null> {
  const key = trackKey(source.artist, source.title)
  const cached = deps.cacheGet(key)
  if (cached) {
    if (!cached.videoId) return null
    const known = deps.lookup(cached.videoId)
    if (known) return { track: { ...known, artUrl: source.artUrl ?? known.artUrl }, confidence: cached.confidence }
  }
  const results = await deps.search(`${source.artist} ${normalizeTitle(source.title) || source.title}`)
  const best = pickBest(source, results)
  deps.cachePut(key, { videoId: best?.track.id ?? null, confidence: best?.confidence ?? 0 })
  if (!best) return null
  return {
    confidence: best.confidence,
    track: { ...best.track, artUrl: source.artUrl ?? best.track.artUrl, album: best.track.album ?? source.album }
  }
}
