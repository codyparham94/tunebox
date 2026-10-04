import type { ImportProgress, ImportResult, PlaylistSource, Track } from '@shared/types'
import { db } from '../context'
import { createPlaylist } from '../db/playlists'
import { resolveMatch } from '../sources/catalog'
import { ACCEPT_CONFIDENCE } from '../sources/matcher'
import { playlist } from '../sources/ytmusic'
import { mapLimit } from '../util/async'
import { applePlaylist, deezerPlaylist, followShortLink, spotifyPlaylist, type ExternalPlaylist } from './external'
import { parsePlaylistUrl } from './playlistUrl'

const SOURCE_NAME: Record<PlaylistSource, string> = { youtube: 'YouTube', spotify: 'Spotify', apple: 'Apple Music', deezer: 'Deezer' }

/** YouTube searches run in parallel, but not so many that YouTube starts refusing them. */
const MATCH_CONCURRENCY = 4

export async function importPlaylist(url: string, onProgress: (p: ImportProgress) => void): Promise<ImportResult> {
  let parsed = parsePlaylistUrl(url)
  if (!parsed.ok && parsed.shortLink) parsed = parsePlaylistUrl(await followShortLink(url.trim()))
  if (!parsed.ok) throw new Error(parsed.error)

  if (parsed.source === 'youtube') {
    let remote
    try {
      remote = await playlist(parsed.id, { onProgress: (fetched, title) => onProgress({ fetched, title, done: false }) })
    } catch (err) {
      throw new Error(`Couldn’t load that playlist. It may be private or deleted. (${(err as Error).message})`)
    }
    if (remote.tracks.length === 0) throw new Error('That playlist has no playable tracks.')
    const local = createPlaylist(db(), remote.title, remote.tracks, url)
    onProgress({ fetched: remote.tracks.length, title: remote.title, done: true })
    return { playlistId: local.id, name: local.name, count: local.trackCount, source: 'youtube', skipped: 0 }
  }

  const name = SOURCE_NAME[parsed.source]
  let ext: ExternalPlaylist
  try {
    ext =
      parsed.source === 'spotify'
        ? await spotifyPlaylist(parsed.id)
        : parsed.source === 'apple'
          ? await applePlaylist(parsed.id, parsed.storefront)
          : await deezerPlaylist(parsed.id)
  } catch (err) {
    throw new Error(`Couldn’t load that ${name} playlist. It may be private or deleted. (${(err as Error).message})`)
  }
  if (ext.tracks.length === 0) throw new Error(`That ${name} playlist is empty.`)

  // Find each song on YouTube; keep the playlist's order and drop songs with no confident match.
  let done = 0
  onProgress({ fetched: 0, total: ext.tracks.length, title: ext.title, done: false })
  const matched = await mapLimit(ext.tracks, MATCH_CONCURRENCY, async (t) => {
    try {
      const r = await resolveMatch({ id: '', ...t, duration: t.duration ?? 0 })
      return r && r.confidence >= ACCEPT_CONFIDENCE ? r.track : null
    } finally {
      onProgress({ fetched: ++done, total: ext.tracks.length, title: ext.title, done: false })
    }
  })
  const tracks = matched.filter((t): t is Track => !!t)
  if (tracks.length === 0) throw new Error(`None of the songs in that ${name} playlist could be found on YouTube.`)

  const local = createPlaylist(db(), ext.title, tracks, url)
  onProgress({ fetched: ext.tracks.length, total: ext.tracks.length, title: ext.title, done: true })
  return {
    playlistId: local.id,
    name: local.name,
    count: local.trackCount,
    source: parsed.source,
    skipped: ext.tracks.length - tracks.length,
    truncated: ext.truncated
  }
}
