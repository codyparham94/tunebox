import { isLocalId } from '@shared/api'
import type { ArtistSummary, DiscoverFeed, DiscoverSignals, RadioTrack, Track } from '@shared/types'
import { db } from '../context'
import { dislikedIds, establishedArtists, knownTracks, playlistSample, recentSearches, signalCounts } from '../db/discover'
import { likedTracks, readAffinity, recentPlays, topPlayed } from '../db/feedback'
import { getState, setState } from '../db/settings'
import { attachTags, cand, first, similarArtistsTop } from '../radio/candidates'
import { mergeCandidates, pickTracks, scoreCandidates, type Candidate } from '../radio/scorer'
import { resolveMatch } from '../sources/catalog'
import * as lastfm from '../sources/lastfm'
import * as ytm from '../sources/ytmusic'
import { mapLimit } from '../util/async'
import { artistKey } from '../util/text'
import { capPerArtist, isFresh, rankArtists, shelfTracks, topKeys, type Exclusions } from './rank'

const MAX_AGE = 6 * 60 * 60 * 1000
const MIX_SIZE = 25
const SHELF_SIZE = 12
const MIN_CONFIDENCE = 0.45
/** Listens before an artist (or a song) shapes Discover; a single play is just a play. */
const MIN_PLAYS = 3

interface Seed {
  id: string
  title: string
  subtitle?: string
  track: Track
  reason: string
}

let cache: DiscoverFeed | undefined
let building: Promise<DiscoverFeed> | undefined

const total = (s: DiscoverSignals) => s.likes + s.playlistTracks + s.searches + s.plays

/** The Discover page. Cached for a few hours; `refresh` rebuilds it. */
export function discoverFeed(refresh = false): Promise<DiscoverFeed> {
  cache ??= getState<DiscoverFeed>(db(), 'discover') ?? undefined
  const signals = signalCounts(db())
  // A first like or search should show up right away, not after the cache expires.
  const wasEmpty = !!cache && total(cache.signals) === 0 && total(signals) > 0
  if (!refresh && cache && !wasEmpty && Date.now() - cache.builtAt < MAX_AGE) return Promise.resolve(cache)
  building ??= build(signals)
    .then((feed) => {
      cache = feed
      setState(db(), 'discover', feed)
      return feed
    })
    .finally(() => {
      building = undefined
    })
  return building
}

function pickSeeds(): Seed[] {
  const d = db()
  const seeds: Seed[] = []
  const liked = likedTracks(d).filter((t) => !isLocalId(t.id))
  // The two newest likes, plus an older one at random so a refresh brings something new.
  const likedPicks = liked.slice(0, 2)
  const older = liked.slice(2)
  if (older.length) likedPicks.push(older[Math.floor(Math.random() * older.length)])
  for (const t of likedPicks) {
    seeds.push({
      id: `liked-${t.id}`,
      title: `Because you liked “${t.title}”`,
      subtitle: t.artist,
      track: t,
      reason: `Because you liked “${t.title}”`
    })
  }
  for (const s of recentSearches(d, 10).filter((s) => s.topTrack).slice(0, 2)) {
    const t = s.topTrack!
    seeds.push({
      id: `search-${s.query}`,
      title: `Because you searched “${s.query}”`,
      subtitle: `Starting from ${t.title} by ${t.artist}`,
      track: t,
      reason: `You searched for “${s.query}”`
    })
  }
  for (const p of playlistSample(d, 1)) {
    seeds.push({
      id: `playlist-${p.track.id}`,
      title: `Inspired by your playlist “${p.playlist}”`,
      subtitle: `Starting from ${p.track.title} by ${p.track.artist}`,
      track: p.track,
      reason: `Goes with “${p.track.title}” from ${p.playlist}`
    })
  }
  if (seeds.length < 3) {
    for (const { track: t } of topPlayed(d, 90, 3).filter((x) => x.plays >= MIN_PLAYS && !isLocalId(x.track.id))) {
      seeds.push({
        id: `played-${t.id}`,
        title: `Because you played “${t.title}”`,
        subtitle: t.artist,
        track: t,
        reason: `Because you played “${t.title}”`
      })
    }
  }
  const seen = new Set<string>()
  return seeds.filter((s) => !seen.has(s.track.id) && !!seen.add(s.track.id)).slice(0, 6)
}

async function seedCandidates(s: Seed): Promise<Candidate[]> {
  const [next, similar] = await Promise.all([
    ytm.upNext(s.track.id).catch(() => [] as Track[]),
    lastfm.lastfmAvailable()
      ? lastfm.similarTracks(first(s.track.artist), s.track.title, 30).catch(() => [])
      : Promise.resolve([])
  ])
  return [
    ...next.map((t, i) => cand(t, 0.75 - i * 0.008, 'ytm', s.reason)),
    ...similar.map((t) => cand(t, t.match * 0.9, 'lastfm-track', s.reason))
  ]
}

/** Display names (and YT Music ids, when known) for the artists the user leans towards. */
function favouriteArtists(artistAffinity: Map<string, number>): { name: string; id?: string }[] {
  const d = db()
  const names = new Map<string, { name: string; id?: string }>()
  for (const t of [...likedTracks(d), ...recentPlays(d, 300)]) {
    const k = artistKey(t.artist)
    const prev = names.get(k)
    const id = isLocalId(t.id) ? undefined : t.artistId
    if (!prev || (!prev.id && id)) names.set(k, { name: first(t.artist), id: id ?? prev?.id })
  }
  const out = topKeys(artistAffinity, 4, 0.1)
    .map((k) => names.get(k))
    .filter((a): a is { name: string; id?: string } => !!a)
  for (const s of recentSearches(d, 5)) {
    if (s.topArtist && !out.some((a) => artistKey(a.name) === artistKey(s.topArtist!))) {
      out.push({ name: first(s.topArtist), id: s.topTrack?.artistId })
    }
  }
  return out.slice(0, 6)
}

/** `heard`: every artist with any positive signal, so even a one-off play isn't suggested as new. */
async function relatedArtists(artistAffinity: Map<string, number>, heard: Map<string, number>, ex: Exclusions): Promise<ArtistSummary[]> {
  const favourites = favouriteArtists(artistAffinity)
  const groups = await mapLimit(favourites, 3, async (a) => {
    const id = a.id ?? (await ytm.findArtistId(a.name))
    return { because: a.name, related: id ? (await ytm.artist(id)).related : [] }
  })
  const known = new Set([
    ...ex.artists,
    ...favourites.map((a) => artistKey(a.name)),
    ...[...heard].filter(([, v]) => v > 0.05).map(([k]) => k)
  ])
  return rankArtists(
    groups.filter((g) => !!g),
    known,
    12
  )
}

async function resolvePicks(picks: { c: Candidate; reason: string }[], ex: Exclusions): Promise<RadioTrack[]> {
  const resolved = await mapLimit(picks, 4, async ({ c, reason }): Promise<RadioTrack | null> => {
    const m = await resolveMatch({
      id: c.id ?? '',
      title: c.title,
      artist: c.artist,
      album: c.album,
      duration: c.duration ?? 0,
      artUrl: c.artUrl
    })
    if (!m || m.confidence < MIN_CONFIDENCE || ex.ids.has(m.track.id)) return null
    return { ...m.track, artUrl: m.track.artUrl ?? c.artUrl, reason }
  })
  const seen = new Set<string>()
  return resolved.filter((t): t is RadioTrack => !!t && !seen.has(t.id) && !!seen.add(t.id))
}

async function build(signals: DiscoverSignals): Promise<DiscoverFeed> {
  if (total(signals) === 0) return { builtAt: Date.now(), mix: [], shelves: [], artists: [], tags: [], signals }

  const d = db()
  const known = knownTracks(d)
  // Dislikes always count; a liking only once the artist has been played enough (or liked).
  const established = establishedArtists(d, MIN_PLAYS)
  const heard = readAffinity(d, 'artist_affinity', null)
  const artistAffinity = new Map([...heard].filter(([k, v]) => v < 0 || established.has(k)))
  const tagAffinity = readAffinity(d, 'tag_affinity', null)
  const ex: Exclusions = {
    ids: new Set([...known.ids, ...dislikedIds(d)]),
    keys: known.keys,
    artists: new Set([...artistAffinity].filter(([, v]) => v < -0.3).map(([k]) => k))
  }
  const tags = topKeys(tagAffinity, 8)
  const seeds = pickSeeds()

  // Wider sources for the mix: fans of your top artists, and your top genre.
  const extra: (() => Promise<Candidate[]>)[] = []
  if (lastfm.lastfmAvailable()) {
    for (const a of favouriteArtists(artistAffinity).slice(0, 2)) extra.push(similarArtistsTop(a.name, 5, 4))
    if (tags[0]) {
      extra.push(async () =>
        (await lastfm.tagTopTracks(tags[0], 40)).map((t, i) =>
          cand(t, 0.7 - i * 0.005, 'lastfm-tag', `You like ${tags[0]}`)
        )
      )
    }
  }

  const [seedResults, extraResults, artists] = await Promise.all([
    mapLimit(seeds, 3, seedCandidates),
    mapLimit(extra, 3, (fn) => fn()),
    relatedArtists(artistAffinity, heard, ex).catch(() => [] as ArtistSummary[])
  ])

  const pool = mergeCandidates([...seedResults, ...extraResults].flatMap((r) => r ?? [])).filter((c) => isFresh(c, ex))
  pool.sort((a, b) => b.similarity - a.similarity)
  const top = pool.slice(0, 150)
  await attachTags(top).catch(() => undefined)
  const scored = scoreCandidates(top, {
    artistAffinity,
    tagAffinity,
    recentPlays: new Set(),
    bannedIds: ex.ids,
    bannedArtists: ex.artists
  })
  const picks = capPerArtist(
    pickTracks(scored, MIX_SIZE + 15, []).map((p) => ({ c: p.candidate, reason: p.reason, artist: p.candidate.artist })),
    2
  )
  const mix = (await resolvePicks(picks, ex)).slice(0, MIX_SIZE)

  const used = new Set(picks.slice(0, MIX_SIZE).map((p) => p.c.key))
  const shelves = seeds
    .map((s, i) => ({
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      seed: s.track,
      tracks: shelfTracks(seedResults[i] ?? [], ex, used, SHELF_SIZE)
    }))
    .filter((s) => s.tracks.length >= 4)

  return { builtAt: Date.now(), mix, shelves, artists, tags, signals }
}

/** Rebuild on the next visit (e.g. after search history is cleared). */
export function staleDiscover(): void {
  if (cache) cache = { ...cache, builtAt: 0 }
}
