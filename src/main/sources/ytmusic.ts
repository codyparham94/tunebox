/**
 * All youtubei.js parsing lives here. YouTube changes its responses often, so the
 * rest of the app only sees our own types. When something breaks, fix it in this file
 * (and bump youtubei.js).
 */
import vm from 'node:vm'
import { Innertube, Log, Platform, UniversalCache } from 'youtubei.js'
import type {
  AlbumSummary,
  ArtistPage,
  ArtistSummary,
  Collection,
  RemotePlaylistSummary,
  SearchResults,
  Track
} from '@shared/types'
import { normalizeArtist, normalizeTitle, upscaleArt } from '../util/text'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = any

Log.setLevel(Log.Level.NONE)

// youtubei.js needs a JS evaluator to decipher stream URLs for some clients.
// Run the extracted player functions in an isolated VM context.
Platform.shim.eval = (data, env) => {
  const props: string[] = []
  if (env.n) props.push(`n: exportedVars.nFunction(${JSON.stringify(env.n)})`)
  if (env.sig) props.push(`sig: exportedVars.sigFunction(${JSON.stringify(env.sig)})`)
  return vm.runInNewContext(`(function(){\n${data.output}\nreturn { ${props.join(', ')} }\n})()`, {}, { timeout: 5000 })
}

let client: Promise<Innertube> | undefined
let cacheDir: string | undefined

export function configureYouTube(opts: { cacheDir?: string }): void {
  cacheDir = opts.cacheDir
}

export function innertube(): Promise<Innertube> {
  client ??= Innertube.create({
    generate_session_locally: true,
    retrieve_player: true,
    cache: cacheDir ? new UniversalCache(true, cacheDir) : undefined
  }).catch((err) => {
    client = undefined
    throw err
  })
  return client
}

/** Drop the session (e.g. after repeated failures) so the next call starts fresh. */
export function resetInnertube(): void {
  client = undefined
}

/* ---------- node → app type adapters ---------- */

const text = (t: Node): string => (t == null ? '' : typeof t === 'string' ? t : (t.toString?.() ?? t.text ?? ''))

function bestThumb(node: Node): string | undefined {
  const list: Node[] =
    node?.thumbnail?.contents ?? (Array.isArray(node?.thumbnail) ? node.thumbnail : undefined) ?? node?.thumbnails ?? []
  if (!Array.isArray(list) || list.length === 0) return undefined
  const best = [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
  return upscaleArt(best?.url)
}

export function toTrack(item: Node, fallback: Partial<Track> = {}): Track | null {
  const node = item?.primary ?? item
  const id: string | undefined = node?.id ?? node?.video_id
  if (!id || typeof id !== 'string') return null
  const credits: Node[] = node.artists?.length ? node.artists : node.authors?.length ? node.authors : []
  const artist =
    credits.map((a) => a?.name).filter(Boolean).join(', ') ||
    (typeof node.author === 'string' ? node.author : node.author?.name) ||
    fallback.artist ||
    'Unknown artist'
  return {
    id,
    title: text(node.title) || 'Untitled',
    artist,
    artistId: credits[0]?.channel_id ?? node.author?.channel_id ?? fallback.artistId,
    album: node.album?.name ?? fallback.album,
    albumId: node.album?.id ?? fallback.albumId,
    duration: node.duration?.seconds ?? fallback.duration ?? 0,
    artUrl: bestThumb(node) ?? fallback.artUrl
  }
}

function toArtist(item: Node): ArtistSummary | null {
  const id = item?.id ?? item?.endpoint?.payload?.browseId
  if (!id) return null
  return { id, name: item.name ?? text(item.title), artUrl: bestThumb(item), subtitle: text(item.subtitle) || undefined }
}

function toAlbum(item: Node, fallbackArtist = ''): AlbumSummary | null {
  const id = item?.id ?? item?.endpoint?.payload?.browseId
  if (!id) return null
  const artist = item.author?.name ?? item.artists?.map((a: Node) => a.name).join(', ') ?? fallbackArtist
  return { id, title: text(item.title), artist: artist || fallbackArtist, year: item.year, artUrl: bestThumb(item) }
}

function toRemotePlaylist(item: Node): RemotePlaylistSummary | null {
  const raw: string | undefined = item?.id ?? item?.endpoint?.payload?.browseId
  if (!raw) return null
  return {
    id: raw.replace(/^VL/, ''),
    title: text(item.title),
    author: item.author?.name ?? text(item.subtitle),
    artUrl: bestThumb(item)
  }
}

const compact = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null)

/* ---------- catalog calls ---------- */

export async function searchSongs(query: string, limit = 10): Promise<Track[]> {
  const yt = await innertube()
  const res = await yt.music.search(query, { type: 'song' })
  return compact((res.songs?.contents ?? []).slice(0, limit).map((i: Node) => toTrack(i)))
}

export async function search(query: string): Promise<SearchResults> {
  const yt = await innertube()
  const [songs, artists, albums, playlists] = await Promise.allSettled([
    yt.music.search(query, { type: 'song' }),
    yt.music.search(query, { type: 'artist' }),
    yt.music.search(query, { type: 'album' }),
    yt.music.search(query, { type: 'playlist' })
  ])
  const items = (r: PromiseSettledResult<Node>, key: string): Node[] =>
    r.status === 'fulfilled' ? (r.value[key]?.contents ?? []) : []
  if ([songs, artists, albums, playlists].every((r) => r.status === 'rejected')) {
    throw (songs as PromiseRejectedResult).reason
  }
  return {
    songs: compact(items(songs, 'songs').map((i) => toTrack(i))),
    artists: compact(items(artists, 'artists').map(toArtist)),
    albums: compact(items(albums, 'albums').map((i) => toAlbum(i))),
    playlists: compact(items(playlists, 'playlists').map(toRemotePlaylist))
  }
}

/** Artists for a type-ahead. A half-typed name ("portishe") finds nothing, so it's completed first. */
export async function searchArtists(query: string, limit = 6): Promise<ArtistSummary[]> {
  const yt = await innertube()
  const find = async (q: string) =>
    compact(((await yt.music.search(q, { type: 'artist' })).artists?.contents ?? []).slice(0, limit).map(toArtist))
  const found = await find(query)
  if (found.length) return found
  const sections: Node[] = await yt.music.getSearchSuggestions(query).catch(() => [])
  const completed = sections
    .flatMap((s) => s.contents ?? [])
    .map((c: Node) => text(c.suggestion))
    .find((s: string) => s && s.toLowerCase() !== query.trim().toLowerCase())
  return completed ? find(completed) : []
}

export async function searchPlaylists(query: string): Promise<RemotePlaylistSummary[]> {
  const yt = await innertube()
  const res = await yt.music.search(query, { type: 'playlist' })
  return compact((res.playlists?.contents ?? []).map(toRemotePlaylist))
}

export async function artist(id: string): Promise<ArtistPage> {
  const yt = await innertube()
  const page = await yt.music.getArtist(id)
  const name = text(page.header?.title)
  const section = (re: RegExp): Node | undefined =>
    page.sections.find((s: Node) => re.test(text(s.title ?? s.header?.title)))
  const songs = page.sections.find((s: Node) => s.type === 'MusicShelf') as Node
  const albums = section(/^albums/i)
  const singles = section(/singles|eps/i)
  const related = section(/fans might also like|similar|related/i)
  return {
    id,
    name,
    description: text((page.header as Node)?.description) || undefined,
    artUrl: bestThumb(page.header),
    topSongs: compact((songs?.contents ?? []).map((i: Node) => toTrack(i, { artist: name, artistId: id }))),
    albums: compact((albums?.contents ?? []).map((i: Node) => toAlbum(i, name))),
    singles: compact((singles?.contents ?? []).map((i: Node) => toAlbum(i, name))),
    related: compact((related?.contents ?? []).map(toArtist))
  }
}

export async function album(id: string): Promise<Collection> {
  const yt = await innertube()
  const page = await yt.music.getAlbum(id)
  const header = page.header as Node
  const strap = header?.strapline_text_one ?? header?.author
  const artistName = text(strap) || header?.author?.name || ''
  const artistId = strap?.runs?.[0]?.endpoint?.payload?.browseId ?? header?.author?.channel_id
  const artUrl = bestThumb(header)
  const title = text(header?.title)
  return {
    id,
    title,
    subtitle: text(header?.subtitle) || undefined,
    artist: artistName,
    artistId,
    artUrl,
    tracks: compact(
      page.contents.map((i: Node) => toTrack(i, { artist: artistName, artistId, album: title, albumId: id, artUrl }))
    )
  }
}

/** Fetches a playlist, following continuations up to `max` tracks. */
export async function playlist(
  id: string,
  opts: { max?: number; onProgress?: (fetched: number, title: string) => void } = {}
): Promise<Collection> {
  const yt = await innertube()
  const max = opts.max ?? 5000
  let page: Node = await yt.music.getPlaylist(id)
  const header = page.header as Node
  const title = text(header?.title) || 'Imported playlist'
  const tracks: Track[] = []
  const take = (p: Node) => {
    for (const item of p.items ?? p.contents ?? []) {
      if (item.type === 'ContinuationItem') continue
      const t = toTrack(item)
      if (t) tracks.push(t)
    }
  }
  take(page)
  opts.onProgress?.(tracks.length, title)
  while (page.has_continuation && tracks.length < max) {
    page = await page.getContinuation()
    const before = tracks.length
    take(page)
    opts.onProgress?.(tracks.length, title)
    if (tracks.length === before) break
  }
  return {
    id,
    title,
    subtitle: text(header?.second_subtitle ?? header?.subtitle) || undefined,
    artist: text(header?.strapline_text_one) || undefined,
    artUrl: bestThumb(header),
    tracks: tracks.slice(0, max)
  }
}

/** YouTube Music's own "radio" for a track. */
export async function upNext(videoId: string): Promise<Track[]> {
  const yt = await innertube()
  const panel = await yt.music.getUpNext(videoId, true)
  return compact((panel.contents ?? []).map((i: Node) => toTrack(i))).filter((t) => t.id !== videoId)
}

/** Best-matching artist channel for a name. */
export async function findArtistId(name: string): Promise<string | undefined> {
  const yt = await innertube()
  const res = await yt.music.search(name, { type: 'artist' })
  const artists = compact((res.artists?.contents ?? []).map(toArtist))
  const want = normalizeArtist(name)
  return (artists.find((a) => normalizeArtist(a.name) === want) ?? artists[0])?.id
}

/**
 * Fills in the artist and album ids for a track that arrived without them
 * (e.g. radio picks), by finding the same song in YT Music search.
 */
export async function locate(t: Pick<Track, 'id' | 'title' | 'artist'>): Promise<{ artistId?: string; albumId?: string }> {
  const primary = t.artist.split(',')[0].trim()
  const songs = await searchSongs(`${primary} ${normalizeTitle(t.title) || t.title}`, 10)
  const title = normalizeTitle(t.title)
  const hit =
    songs.find((s) => s.id === t.id) ??
    songs.find((s) => normalizeTitle(s.title) === title && normalizeArtist(s.artist) === normalizeArtist(primary))
  const artistId = hit?.artistId ?? (await findArtistId(primary))
  return { artistId, albumId: hit?.albumId }
}

/** Best-matching YT Music album for a title + artist (e.g. from a Deezer chart). */
export async function findAlbumId(title: string, artist: string): Promise<string | undefined> {
  const yt = await innertube()
  const res = await yt.music.search(`${artist} ${title}`, { type: 'album' })
  const albums = compact((res.albums?.contents ?? []).map((i: Node) => toAlbum(i)))
  const want = normalizeTitle(title)
  const byArtist = (a: AlbumSummary) => normalizeArtist(a.artist) === normalizeArtist(artist)
  return (albums.find((a) => normalizeTitle(a.title) === want && byArtist(a)) ?? albums.find(byArtist) ?? albums[0])?.id
}
