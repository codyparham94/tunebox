/**
 * Reads playlists from Spotify, Apple Music and Deezer without an account. Each returns song
 * metadata only; the importer matches every song to a YouTube video.
 *
 * - Spotify: the public embed page carries the first 100 songs. (Its anonymous web token is
 *   refused by the Web API, so longer playlists are cut at 100 and the user is told.)
 * - Apple Music: the web player's public developer token reads the whole playlist from Apple's
 *   catalog API; if that fails, the playlist page itself lists the first 100.
 * - Deezer: the public API, paged.
 */
import type { MatchSource } from '../sources/matcher'

export interface ExternalTrack extends MatchSource {
  album?: string
  artUrl?: string
}

export interface ExternalPlaylist {
  title: string
  tracks: ExternalTrack[]
  /** the service only shared part of the playlist */
  truncated?: boolean
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const SPOTIFY_EMBED_LIMIT = 100

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers } })
  if (res.status === 404) throw new Error('Playlist not found. It may be private or deleted.')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  return JSON.parse(await fetchText(url, { Accept: 'application/json', ...headers }))
}

function jsonScript(html: string, id: string): any {
  const m = html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`))
  if (!m) throw new Error('The page didn’t include the playlist (the service may have changed its site).')
  return JSON.parse(m[1])
}

/** Follows a share link (spotify.link, link.deezer.com) to the playlist address it points at. */
export async function followShortLink(url: string): Promise<string> {
  const res = await fetch(/^https?:\/\//i.test(url) ? url : `https://${url}`, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (res.url && res.url !== url) return res.url
  // Some share pages redirect with a meta tag or script instead of HTTP.
  const html = await res.text()
  const target = html.match(/https:\/\/(?:open\.spotify\.com|www\.deezer\.com|deezer\.com)\/[^"'\s<>]*playlist\/[^"'\s<>]+/)
  if (!target) throw new Error('Couldn’t open that share link. Open it in a browser and copy the full playlist address.')
  return target[0]
}

/* ---------- Spotify ---------- */

export async function spotifyPlaylist(id: string): Promise<ExternalPlaylist> {
  const data = jsonScript(await fetchText(`https://open.spotify.com/embed/playlist/${id}`), '__NEXT_DATA__')
  const entity = data?.props?.pageProps?.state?.data?.entity
  if (!entity?.trackList) throw new Error('Spotify didn’t share this playlist. It may be private.')
  const tracks: ExternalTrack[] = entity.trackList.map((t: any) => ({
    title: String(t.title ?? ''),
    artist: String(t.subtitle ?? '').replace(/ /g, ' '),
    duration: t.duration ? Math.round(t.duration / 1000) : undefined
  }))
  return { title: entity.name ?? entity.title ?? 'Spotify playlist', tracks, truncated: tracks.length >= SPOTIFY_EMBED_LIMIT }
}

/* ---------- Apple Music ---------- */

let appleToken: string | null = null

/** The developer token Apple's own web player uses, read from its script bundle. */
async function appleDeveloperToken(pageHtml: string): Promise<string> {
  if (appleToken) return appleToken
  const script = pageHtml.match(/src="(\/assets\/index~[^"]+\.js)"/)
  if (!script) throw new Error('no script bundle')
  const js = await fetchText(`https://music.apple.com${script[1]}`)
  const token = js.match(/eyJ0eXAi[\w-]+\.[\w-]+\.[\w-]+/) ?? js.match(/eyJh[\w-]+\.[\w-]+\.[\w-]+/)
  if (!token) throw new Error('no token')
  appleToken = token[0]
  return appleToken
}

const appleArt = (art: any): string | undefined => (art?.url ? String(art.url).replace('{w}', '600').replace('{h}', '600').replace('{f}', 'jpg') : undefined)

export async function applePlaylist(id: string, storefront = 'us'): Promise<ExternalPlaylist> {
  const page = await fetchText(`https://music.apple.com/${storefront}/playlist/${id}`)
  try {
    const token = await appleDeveloperToken(page)
    const headers = { Authorization: `Bearer ${token}`, Origin: 'https://music.apple.com' }
    const base = 'https://amp-api.music.apple.com'
    const meta = await fetchJson(`${base}/v1/catalog/${storefront}/playlists/${id}`, headers)
    const title = meta?.data?.[0]?.attributes?.name ?? 'Apple Music playlist'
    const tracks: ExternalTrack[] = []
    let next: string | undefined = `/v1/catalog/${storefront}/playlists/${id}/tracks?limit=100`
    while (next && tracks.length < 5000) {
      const page: any = await fetchJson(`${base}${next}`, headers)
      for (const t of page?.data ?? []) {
        const a = t.attributes ?? {}
        tracks.push({
          title: a.name ?? '',
          artist: a.artistName ?? '',
          duration: a.durationInMillis ? Math.round(a.durationInMillis / 1000) : undefined,
          album: a.albumName,
          artUrl: appleArt(a.artwork)
        })
      }
      next = page?.next
    }
    if (tracks.length) return { title, tracks }
  } catch (err) {
    console.warn('[import] Apple Music API failed, reading the page instead:', (err as Error).message)
  }
  return applePlaylistFromPage(page)
}

/** Fallback: the playlist page lists its first 100 songs. */
function applePlaylistFromPage(html: string): ExternalPlaylist {
  const data = jsonScript(html, 'serialized-server-data')
  const sections: any[] = data?.data?.[0]?.data?.sections ?? []
  const header = sections.find((s) => s.itemKind === 'containerDetailHeaderLockup')?.items?.[0]
  const list = sections.find((s) => s.itemKind === 'trackLockup')?.items ?? []
  const tracks: ExternalTrack[] = list.map((t: any) => ({
    title: t.title ?? '',
    artist: t.artistName ?? t.subtitleLinks?.map((l: any) => l.title).join(', ') ?? '',
    duration: t.duration ? Math.round(t.duration / 1000) : undefined,
    artUrl: appleArt(t.artwork?.dictionary)
  }))
  if (!tracks.length) throw new Error('Apple Music didn’t share this playlist. It may be private.')
  return { title: header?.title ?? 'Apple Music playlist', tracks, truncated: tracks.length >= 100 }
}

/* ---------- Deezer ---------- */

export async function deezerPlaylist(id: string): Promise<ExternalPlaylist> {
  const meta = await fetchJson(`https://api.deezer.com/playlist/${id}`)
  if (meta?.error) throw new Error(meta.error.message ?? 'Deezer couldn’t find that playlist.')
  const tracks: ExternalTrack[] = []
  for (let index = 0; index < (meta.nb_tracks ?? 0) && index < 5000; index += 100) {
    const page = await fetchJson(`https://api.deezer.com/playlist/${id}/tracks?index=${index}&limit=100`)
    const rows: any[] = page?.data ?? []
    for (const t of rows) {
      tracks.push({
        title: t.title_short ?? t.title ?? '',
        artist: t.artist?.name ?? '',
        duration: Number(t.duration) || undefined,
        album: t.album?.title,
        artUrl: t.album?.cover_xl ?? t.album?.cover_big
      })
    }
    if (rows.length < 100) break
  }
  return { title: meta.title ?? 'Deezer playlist', tracks }
}
