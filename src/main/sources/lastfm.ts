import { lastfmKey } from '../context'

const BASE = 'https://ws.audioscrobbler.com/2.0/'
const TTL = 60 * 60 * 1000
const cache = new Map<string, { at: number; data: unknown }>()

export interface SimilarTrack {
  title: string
  artist: string
  match: number
  duration?: number
}

export function lastfmAvailable(): boolean {
  return lastfmKey() !== ''
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function call(method: string, params: Record<string, string | number>): Promise<any> {
  const key = lastfmKey()
  if (!key) throw new Error('Last.fm API key is not set')
  const qs = new URLSearchParams({ method, api_key: key, format: 'json', autocorrect: '1' })
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v))
  const url = `${BASE}?${qs}`
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < TTL) return hit.data
  const res = await fetch(url)
  const data = (await res.json()) as any
  if (data?.error) throw new Error(`Last.fm ${method}: ${data.message}`)
  cache.set(url, { at: Date.now(), data })
  if (cache.size > 500) cache.delete(cache.keys().next().value!)
  return data
}

const list = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x])

export async function similarTracks(artist: string, track: string, limit = 50): Promise<SimilarTrack[]> {
  const d = await call('track.getSimilar', { artist, track, limit })
  return list(d?.similartracks?.track).map((t: any) => ({
    title: t.name,
    artist: t.artist?.name ?? '',
    match: Number(t.match) || 0,
    duration: Number(t.duration) || undefined
  }))
}

export async function similarArtists(artist: string, limit = 10): Promise<{ name: string; match: number }[]> {
  const d = await call('artist.getSimilar', { artist, limit })
  return list(d?.similarartists?.artist).map((a: any) => ({ name: a.name, match: Number(a.match) || 0 }))
}

export async function artistTopTracks(artist: string, limit = 10): Promise<{ title: string; artist: string }[]> {
  const d = await call('artist.getTopTracks', { artist, limit })
  return list(d?.toptracks?.track).map((t: any) => ({ title: t.name, artist: t.artist?.name ?? artist }))
}

const tagNames = (tags: any[], limit: number): string[] =>
  tags
    .filter((t) => Number(t.count ?? 100) >= 10)
    .slice(0, limit)
    .map((t) => String(t.name).toLowerCase())

export async function trackTopTags(artist: string, track: string, limit = 5): Promise<string[]> {
  const d = await call('track.getTopTags', { artist, track })
  return tagNames(list(d?.toptags?.tag), limit)
}

export async function artistTopTags(artist: string, limit = 5): Promise<string[]> {
  const d = await call('artist.getTopTags', { artist })
  return tagNames(list(d?.toptags?.tag), limit)
}

export async function tagTopTracks(tag: string, limit = 50): Promise<{ title: string; artist: string; duration?: number }[]> {
  const d = await call('tag.getTopTracks', { tag, limit })
  return list(d?.tracks?.track).map((t: any) => ({
    title: t.name,
    artist: t.artist?.name ?? '',
    duration: Number(t.duration) || undefined
  }))
}

export async function topTags(limit = 24): Promise<string[]> {
  const d = await call('chart.getTopTags', { limit })
  return list(d?.tags?.tag).map((t: any) => String(t.name).toLowerCase())
}
