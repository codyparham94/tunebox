import type { ArtistSummary, RadioTrack } from '@shared/types'
import type { Candidate } from '../radio/scorer'
import { artistKey, trackKey } from '../util/text'

/** What Discover must never suggest. */
export interface Exclusions {
  /** videoIds already played, saved, rated or disliked */
  ids: Set<string>
  /** trackKeys of the same, so other uploads of a known song are skipped too */
  keys: Set<string>
  /** artistKeys the user has turned against */
  artists: Set<string>
}

export function isFresh(c: { id?: string; title: string; artist: string }, ex: Exclusions): boolean {
  if (c.id && ex.ids.has(c.id)) return false
  if (ex.keys.has(trackKey(c.artist, c.title))) return false
  return !ex.artists.has(artistKey(c.artist))
}

/** Keeps order, but no more than `max` tracks per artist. */
export function capPerArtist<T extends { artist: string }>(list: T[], max: number): T[] {
  const counts = new Map<string, number>()
  return list.filter((t) => {
    const k = artistKey(t.artist)
    const n = counts.get(k) ?? 0
    counts.set(k, n + 1)
    return n < max
  })
}

export function toRadioTrack(c: Candidate, reason = c.reason): RadioTrack {
  return { id: c.id ?? '', title: c.title, artist: c.artist, album: c.album, duration: c.duration ?? 0, artUrl: c.artUrl, reason }
}

/**
 * Picks a shelf's tracks: fresh, playable, varied, and preferring ones the mix
 * didn't already use so the page doesn't repeat itself.
 */
export function shelfTracks(cands: Candidate[], ex: Exclusions, used: Set<string>, size: number): RadioTrack[] {
  const ok = capPerArtist(
    cands.filter((c) => c.id && isFresh(c, ex)),
    2
  )
  const unused = ok.filter((c) => !used.has(c.key))
  const rest = ok.filter((c) => used.has(c.key))
  return [...unused, ...rest].slice(0, size).map((c) => toRadioTrack(c))
}

/**
 * Related artists across several seeds. Artists related to more of the user's
 * favourites rank higher; ones they already listen to are left out.
 */
export function rankArtists(
  groups: { because: string; related: ArtistSummary[] }[],
  known: Set<string>,
  limit = 12
): ArtistSummary[] {
  // `rank` is the best position in any seed's list, so seeds take turns instead of the first one filling the list.
  const byKey = new Map<string, { artist: ArtistSummary; because: string[]; rank: number; group: number }>()
  groups.forEach((g, gi) => {
    let rank = 0
    for (const a of g.related) {
      const k = artistKey(a.name)
      if (!k || known.has(k) || k === artistKey(g.because)) continue
      const entry = byKey.get(k) ?? { artist: a, because: [], rank, group: gi }
      if (!entry.because.includes(g.because)) entry.because.push(g.because)
      entry.rank = Math.min(entry.rank, rank)
      byKey.set(k, entry)
      rank++
    }
  })
  return [...byKey.values()]
    .sort((a, b) => b.because.length - a.because.length || a.rank - b.rank || a.group - b.group)
    .slice(0, limit)
    .map(({ artist, because }) => ({
      ...artist,
      subtitle: `Similar to ${because.slice(0, 2).join(' & ')}`
    }))
}

/** Keys with the highest positive scores. */
export function topKeys(scores: Map<string, number>, n: number, min = 0.05): string[] {
  return [...scores]
    .filter(([, v]) => v >= min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k)
}
