import type { ImportProgress, ImportResult } from '@shared/types'
import { db } from '../context'
import { createPlaylist } from '../db/playlists'
import { playlist } from '../sources/ytmusic'
import { parsePlaylistUrl } from './playlistUrl'

export async function importPlaylist(url: string, onProgress: (p: ImportProgress) => void): Promise<ImportResult> {
  const parsed = parsePlaylistUrl(url)
  if (!parsed.ok) throw new Error(parsed.error)
  let remote
  try {
    remote = await playlist(parsed.id, { onProgress: (fetched, title) => onProgress({ fetched, title, done: false }) })
  } catch (err) {
    throw new Error(`Couldn’t load that playlist. It may be private or deleted. (${(err as Error).message})`)
  }
  if (remote.tracks.length === 0) throw new Error('That playlist has no playable tracks.')
  const local = createPlaylist(db(), remote.title, remote.tracks, url)
  onProgress({ fetched: remote.tracks.length, title: remote.title, done: true })
  return { playlistId: local.id, name: local.name, count: local.trackCount }
}
