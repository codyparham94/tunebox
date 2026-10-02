import type { RadioTrack, Track } from '@shared/types'
import { db } from '../context'
import {
  bannedArtists,
  bannedTracks,
  readAffinity,
  recentPlays,
  recordFeedback,
  stationLikes
} from '../db/feedback'
import { getStation, touchStation } from '../db/stations'
import { getTrack, setArtistTags, setTrackTags, upsertTrack } from '../db/tracks'
import { resolveMatch } from '../sources/catalog'
import * as lastfm from '../sources/lastfm'
import { mapLimit, withTimeout } from '../util/async'
import { trackKey } from '../util/text'
import { buildPool } from './candidates'
import { pickTracks, scoreCandidates, type Candidate } from './scorer'

interface StationState {
  pool: Candidate[]
  builtAt: number
  used: Set<string>
  recentArtists: string[]
  building?: Promise<void>
}

const REFRESH_BELOW = 20
const MAX_POOL_AGE = 60 * 60 * 1000
const MIN_CONFIDENCE = 0.45
const states = new Map<number, StationState>()

function state(id: number): StationState {
  let s = states.get(id)
  if (!s) {
    s = { pool: [], builtAt: 0, used: new Set(), recentArtists: [] }
    states.set(id, s)
  }
  return s
}

async function ensurePool(stationId: number): Promise<StationState> {
  const s = state(stationId)
  const unused = s.pool.filter((c) => !s.used.has(c.key)).length
  if (unused >= REFRESH_BELOW && Date.now() - s.builtAt < MAX_POOL_AGE) return s
  s.building ??= (async () => {
    try {
      const { seed, station } = getStation(db(), stationId)
      s.pool = await buildPool(seed, stationLikes(db(), stationId), station.artists)
      s.builtAt = Date.now()
    } finally {
      s.building = undefined
    }
  })()
  await s.building
  return s
}

/** Next `count` playable tracks for a station, ranked by the scorer. */
export async function nextTracks(stationId: number, count: number): Promise<RadioTrack[]> {
  touchStation(db(), stationId)
  const s = await ensurePool(stationId)
  const recent = recentPlays(db(), 50)
  const ctx = {
    artistAffinity: readAffinity(db(), 'artist_affinity', stationId),
    tagAffinity: readAffinity(db(), 'tag_affinity', stationId),
    recentPlays: new Set([...recent.map((t) => t.id), ...recent.map((t) => trackKey(t.artist, t.title))]),
    bannedIds: bannedTracks(db(), stationId),
    bannedArtists: bannedArtists(db(), stationId)
  }
  const available = s.pool.filter((c) => !s.used.has(c.key))
  const picks = pickTracks(scoreCandidates(available, ctx), count * 2, s.recentArtists)
  picks.forEach((p) => s.used.add(p.candidate.key))

  const resolved = await mapLimit(picks, 3, async (p) => {
    const c = p.candidate
    const match = await resolveMatch({
      id: c.id ?? '',
      title: c.title,
      artist: c.artist,
      album: c.album,
      duration: c.duration ?? 0,
      artUrl: c.artUrl
    })
    if (!match || match.confidence < MIN_CONFIDENCE) return null
    if (ctx.bannedIds.has(match.track.id) || ctx.recentPlays.has(match.track.id)) return null
    return { ...match.track, reason: p.reason } satisfies RadioTrack
  })

  const out: RadioTrack[] = []
  const seen = new Set<string>()
  for (const t of resolved) {
    if (!t || seen.has(t.id)) continue
    seen.add(t.id)
    out.push(t)
    if (out.length === count) break
  }
  s.recentArtists = [...s.recentArtists, ...out.map((t) => t.artist)].slice(-10)
  return out
}

/** Make sure tags are known before feedback is recorded, so tag affinity learns too. */
export async function ensureTags(track: Track): Promise<void> {
  if (!lastfm.lastfmAvailable() || !track.id) return
  if (getTrack(db(), track.id)?.tags) return
  await withTimeout(
    (async () => {
      const artist = track.artist.split(',')[0].trim()
      let tags = await lastfm.trackTopTags(artist, track.title).catch(() => [])
      if (tags.length === 0) {
        tags = await lastfm.artistTopTags(artist).catch(() => [])
        if (tags.length) setArtistTags(db(), artist, tags)
      }
      if (tags.length && getTrack(db(), track.id)) setTrackTags(db(), track.id, tags)
    })(),
    3000
  )
}

export async function stationFeedback(stationId: number | null, track: Track, value: 1 | -1): Promise<void> {
  upsertTrack(db(), track)
  await ensureTags(track)
  recordFeedback(db(), track, stationId, value)
  // A like widens the pool with tracks similar to it on the next refill.
  if (stationId && value > 0) state(stationId).builtAt = 0
}

/** The station's mix changed; rebuild its pool on the next request but keep what it already played. */
export function retuneStation(stationId: number): void {
  const s = states.get(stationId)
  if (s) {
    s.pool = []
    s.builtAt = 0
  }
}

export function forgetStation(stationId: number): void {
  states.delete(stationId)
}
