import type { StationSeed, Track } from '@shared/types'
import { db } from '../context'
import { getPlaylist } from '../db/playlists'
import { getArtistTags, setArtistTags } from '../db/tracks'
import * as lastfm from '../sources/lastfm'
import * as ytm from '../sources/ytmusic'
import { mapLimit } from '../util/async'
import { trackKey } from '../util/text'
import { mergeCandidates, type Candidate } from './scorer'

type Source = () => Promise<Candidate[]>

const cand = (
  t: { title: string; artist: string; id?: string; duration?: number; artUrl?: string; album?: string },
  similarity: number,
  source: string,
  reason: string
): Candidate => ({
  key: trackKey(t.artist, t.title),
  title: t.title,
  artist: t.artist,
  id: t.id || undefined,
  duration: t.duration || undefined,
  artUrl: t.artUrl,
  album: t.album,
  similarity: Math.max(0, Math.min(1, similarity)),
  sources: [source],
  reason
})

const first = (artist: string) => artist.split(',')[0].trim()

function similarToTrack(t: { title: string; artist: string }, scale: number, limit: number, why: string): Source {
  return async () =>
    (await lastfm.similarTracks(first(t.artist), t.title, limit)).map((s) =>
      cand(s, s.match * scale, 'lastfm-track', why)
    )
}

function similarArtistsTop(artist: string, artists = 6, perArtist = 5): Source {
  return async () => {
    const similar = (await lastfm.similarArtists(first(artist), artists * 2)).slice(0, artists)
    const lists = await mapLimit(similar, 3, async (a) =>
      (await lastfm.artistTopTracks(a.name, perArtist)).map((t, i) =>
        cand(t, a.match * 0.75 - i * 0.02, 'lastfm-artist', `Fans of ${first(artist)} like ${a.name}`)
      )
    )
    return lists.flatMap((l) => l ?? [])
  }
}

function artistOwnTop(artist: string, similarity: number, limit = 10): Source {
  return async () =>
    (await lastfm.artistTopTracks(first(artist), limit)).map((t, i) =>
      cand(t, similarity - i * 0.01, 'lastfm-artist', `More from ${first(artist)}`)
    )
}

function ytUpNext(videoId: string, label: string, limit = 25): Source {
  return async () =>
    (await ytm.upNext(videoId)).slice(0, limit).map((t, i) => cand(t, 0.65 - i * 0.006, 'ytm', `Up next after ${label}`))
}

function sourcesForTrack(t: Track, weight: number, label: string): Source[] {
  const out: Source[] = []
  if (t.id) out.push(ytUpNext(t.id, label, Math.round(25 * weight)))
  if (lastfm.lastfmAvailable()) {
    out.push(similarToTrack(t, weight, Math.round(50 * weight), `Similar to ${label}`))
    out.push(similarArtistsTop(t.artist, Math.max(2, Math.round(6 * weight))))
  }
  return out
}

async function seedSources(seed: StationSeed): Promise<Source[]> {
  const hasLastfm = lastfm.lastfmAvailable()
  switch (seed.type) {
    case 'track': {
      const t = seed.track ?? { id: seed.ref, title: seed.name, artist: '', duration: 0 }
      const out = sourcesForTrack(t, 1, `"${t.title}"`)
      if (hasLastfm && t.artist) out.push(artistOwnTop(t.artist, 0.55, 8))
      return out
    }
    case 'artist': {
      const out: Source[] = []
      if (hasLastfm) {
        out.push(artistOwnTop(seed.ref, 0.75, 15), similarArtistsTop(seed.ref, 8, 5))
      }
      out.push(async () => {
        const songs = await ytm.searchSongs(seed.ref, 5)
        const own = songs.map((s, i) => cand(s, 0.7 - i * 0.02, 'ytm', `More from ${seed.ref}`))
        const next = songs[0] ? await ytUpNext(songs[0].id, seed.ref)() : []
        return [...own, ...next]
      })
      return out
    }
    case 'playlist': {
      const pl = getPlaylist(db(), Number(seed.ref))
      const shuffled = [...pl.tracks].sort(() => Math.random() - 0.5)
      const out: Source[] = [
        async () => shuffled.slice(0, 20).map((t) => cand(t, 0.7, 'playlist', `From your playlist ${pl.name}`))
      ]
      for (const t of shuffled.slice(0, 3)) out.push(...sourcesForTrack(t, 0.5, `"${t.title}"`))
      return out
    }
    case 'tag': {
      if (hasLastfm) {
        return [
          async () =>
            (await lastfm.tagTopTracks(seed.ref, 80)).map((t, i) =>
              cand(t, 0.8 - i * 0.004, 'lastfm-tag', `Top ${seed.ref} track`)
            )
        ]
      }
      return [
        async () => {
          const songs = await ytm.searchSongs(`${seed.ref} songs`, 10)
          const next = songs[0] ? await ytUpNext(songs[0].id, seed.ref)() : []
          return [...songs.map((s) => cand(s, 0.7, 'ytm', `${seed.ref} pick`)), ...next]
        }
      ]
    }
  }
}

/** Fills `tags` from the artist-tag cache, looking up a few unknown artists per refill. */
async function attachTags(cands: Candidate[], maxLookups = 15): Promise<void> {
  const missing = new Set<string>()
  for (const c of cands) {
    const artist = first(c.artist)
    const cached = getArtistTags(db(), artist)
    if (cached) c.tags = cached
    else missing.add(artist)
  }
  if (!lastfm.lastfmAvailable() || missing.size === 0) return
  const lookups = [...missing].slice(0, maxLookups)
  await mapLimit(lookups, 4, async (artist) => setArtistTags(db(), artist, await lastfm.artistTopTags(artist)))
  for (const c of cands) c.tags ??= getArtistTags(db(), first(c.artist))
}

/** Builds the candidate pool (~100 tracks) for a seed plus tracks liked in this station. */
export async function buildPool(seed: StationSeed, liked: Track[]): Promise<Candidate[]> {
  const sources = await seedSources(seed)
  for (const t of liked.slice(0, 2)) {
    sources.push(...sourcesForTrack(t, 0.6, `"${t.title}", which you liked`))
  }
  const results = await mapLimit(sources, 4, (s) => s())
  const pool = mergeCandidates(results.flatMap((r) => r ?? []))
  if (pool.length === 0) {
    throw new Error(
      lastfm.lastfmAvailable()
        ? 'No similar tracks found for this station.'
        : 'No similar tracks found. Add a Last.fm API key in Settings for better radio.'
    )
  }
  pool.sort((a, b) => b.similarity - a.similarity)
  const top = pool.slice(0, 120)
  await attachTags(top)
  return top
}
