import type { ChartAlbum, ChartArtist, Genre, RemotePlaylistSummary, Track } from '@shared/types'

const BASE = 'https://api.deezer.com'
const TTL = 30 * 60 * 1000
const cache = new Map<string, { at: number; data: unknown }>()

/* eslint-disable @typescript-eslint/no-explicit-any */
async function get(path: string): Promise<any> {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < TTL) return hit.data
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`Deezer ${path}: HTTP ${res.status}`)
  const data = (await res.json()) as any
  if (data?.error) throw new Error(`Deezer ${path}: ${data.error.message}`)
  cache.set(path, { at: Date.now(), data })
  if (cache.size > 200) cache.delete(cache.keys().next().value!)
  return data
}

/** Chart tracks have no videoId yet; the renderer matches them on play. */
export async function chart(genreId = 0, limit = 30): Promise<Track[]> {
  const d = await get(`/chart/${genreId}/tracks?limit=${limit}`)
  return (d?.data ?? []).map(
    (t: any): Track => ({
      id: '',
      title: t.title_short ?? t.title,
      artist: t.artist?.name ?? '',
      album: t.album?.title,
      duration: Number(t.duration) || 0,
      artUrl: t.album?.cover_xl ?? t.album?.cover_big
    })
  )
}

export async function genres(): Promise<Genre[]> {
  const d = await get('/genre')
  return (d?.data ?? [])
    .filter((g: any) => g.id !== 0)
    .map((g: any): Genre => ({ id: g.id, name: g.name, artUrl: g.picture_xl ?? g.picture_big }))
}

export async function chartAlbums(genreId = 0, limit = 20): Promise<ChartAlbum[]> {
  const d = await get(`/chart/${genreId}/albums?limit=${limit}`)
  return (d?.data ?? []).map(
    (a: any): ChartAlbum => ({ title: a.title, artist: a.artist?.name ?? '', artUrl: a.cover_xl ?? a.cover_big })
  )
}

const toPlaylist = (p: any): RemotePlaylistSummary => ({
  id: String(p.id),
  title: p.title,
  author: p.user?.name,
  artUrl: p.picture_xl ?? p.picture_big,
  url: p.link ?? `https://www.deezer.com/playlist/${p.id}`,
  trackCount: Number(p.nb_tracks) || undefined
})

/** Deezer playlists matching `query`, or its chart playlists when the query is empty. */
export async function playlists(query: string, limit = 24): Promise<RemotePlaylistSummary[]> {
  const q = query.trim()
  const d = await get(q ? `/search/playlist?q=${encodeURIComponent(q)}&limit=${limit}` : `/chart/0/playlists?limit=${limit}`)
  return (d?.data ?? []).map(toPlaylist)
}

export async function chartArtists(genreId = 0, limit = 20): Promise<ChartArtist[]> {
  const d = await get(`/chart/${genreId}/artists?limit=${limit}`)
  return (d?.data ?? []).map((a: any): ChartArtist => ({ name: a.name, artUrl: a.picture_xl ?? a.picture_big }))
}
