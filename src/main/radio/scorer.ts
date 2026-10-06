import { artistKey } from '../util/text'

export interface Candidate {
  /** trackKey(artist, title) */
  key: string
  title: string
  artist: string
  id?: string
  duration?: number
  album?: string
  artUrl?: string
  /** 0–1, from the strongest source */
  similarity: number
  sources: string[]
  reason: string
  tags?: string[]
}

export interface ScoreContext {
  artistAffinity: Map<string, number>
  tagAffinity: Map<string, number>
  /** trackKeys and videoIds from the last 50 plays */
  recentPlays: Set<string>
  bannedIds: Set<string>
  bannedArtists: Set<string>
}

export interface Scored {
  candidate: Candidate
  /** score before the artist-repeat penalty, which depends on pick order */
  base: number
  score: number
  reason: string
  explored?: boolean
}

export const W = { similarity: 0.45, artist: 0.25, tag: 0.15, agreement: 0.15 }
export const REPEAT_PENALTY = 0.5
export const ARTIST_REPEAT_PENALTY = 0.3
export const ARTIST_REPEAT_WINDOW = 3
export const EXPLORATION = 0.15

function bestTag(tags: string[] | undefined, aff: Map<string, number>): { tag?: string; value: number } {
  if (!tags?.length) return { value: 0 }
  let sum = 0
  let top: { tag?: string; value: number } = { value: -Infinity }
  for (const t of tags) {
    const v = aff.get(t) ?? 0
    sum += v
    if (v > top.value) top = { tag: t, value: v }
  }
  return { tag: top.tag, value: sum / tags.length }
}

/** Scores every allowed candidate. Banned tracks and artists are dropped. */
export function scoreCandidates(candidates: Candidate[], ctx: ScoreContext): Scored[] {
  const out: Scored[] = []
  for (const c of candidates) {
    const ak = artistKey(c.artist)
    if (ctx.bannedArtists.has(ak) || (c.id && ctx.bannedIds.has(c.id))) continue
    const aa = ctx.artistAffinity.get(ak) ?? 0
    const tag = bestTag(c.tags, ctx.tagAffinity)
    const agreement = Math.min(1, Math.max(0, c.sources.length - 1) / 2)
    const repeat = ctx.recentPlays.has(c.key) || (c.id !== undefined && ctx.recentPlays.has(c.id)) ? REPEAT_PENALTY : 0

    const parts = {
      similarity: W.similarity * c.similarity,
      artist: W.artist * aa,
      tag: W.tag * tag.value,
      agreement: W.agreement * agreement
    }
    const base = parts.similarity + parts.artist + parts.tag + parts.agreement - repeat

    // A strong learned preference is a better explanation than raw similarity.
    let reason = c.reason
    if (aa > 0.5 || (aa > 0.2 && parts.artist > parts.similarity)) reason = `You like ${c.artist.split(',')[0]}`
    else if (tag.tag && (tag.value > 0.5 || (tag.value > 0.2 && parts.tag > parts.similarity))) reason = `You like ${tag.tag}`
    out.push({ candidate: c, base, score: base, reason })
  }
  return out
}

/**
 * Picks `n` tracks. Most picks take the best remaining score; EXPLORATION of them are
 * drawn from the lower-scoring half so the station doesn't collapse into a loop.
 * The artist-repeat penalty is re-applied after each pick.
 */
export function pickTracks(scored: Scored[], n: number, recentArtists: string[], rng: () => number = Math.random): Scored[] {
  const remaining = [...scored]
  const artists = recentArtists.map(artistKey)
  // Normalising a name is regex-heavy; do it once per candidate, not once per candidate per pick.
  const keyOf = new Map(scored.map((s) => [s, artistKey(s.candidate.artist)]))
  const picks: Scored[] = []
  while (picks.length < n && remaining.length > 0) {
    const window = new Set(artists.slice(-ARTIST_REPEAT_WINDOW))
    const ranked = remaining
      .map((s) => ({ s, score: s.base - (window.has(keyOf.get(s)!) ? ARTIST_REPEAT_PENALTY : 0) }))
      .sort((a, b) => b.score - a.score)
    const explore = ranked.length > 1 && rng() < EXPLORATION
    const lower = ranked.slice(Math.ceil(ranked.length / 2))
    const choice = explore && lower.length > 0 ? lower[Math.floor(rng() * lower.length)] : ranked[0]
    picks.push({ ...choice.s, score: choice.score, explored: explore })
    remaining.splice(remaining.indexOf(choice.s), 1)
    artists.push(keyOf.get(choice.s)!)
  }
  return picks
}

/** Merge duplicates from different sources; agreement between sources raises the score. */
export function mergeCandidates(list: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>()
  for (const c of list) {
    const prev = byKey.get(c.key)
    if (!prev) {
      byKey.set(c.key, { ...c, sources: [...new Set(c.sources)] })
      continue
    }
    const stronger = c.similarity > prev.similarity ? c : prev
    byKey.set(c.key, {
      ...prev,
      id: prev.id ?? c.id,
      duration: prev.duration ?? c.duration,
      artUrl: prev.artUrl ?? c.artUrl,
      album: prev.album ?? c.album,
      tags: prev.tags ?? c.tags,
      similarity: stronger.similarity,
      reason: stronger.reason,
      sources: [...new Set([...prev.sources, ...c.sources])]
    })
  }
  return [...byKey.values()]
}
