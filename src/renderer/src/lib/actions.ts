import { isLocalId } from '@shared/api'
import type { LocalPlaylist, StationSeed, Track } from '@shared/types'
import { player } from '../store/player'
import { toast } from '../store/toast'
import { api, errorMessage, invalidateLikes, invalidatePlaylists, keys, queryClient } from './queries'

async function start(seed: StationSeed, first?: Track): Promise<void> {
  try {
    const station = await api.radio.create(seed)
    void queryClient.invalidateQueries({ queryKey: keys.stations })
    player.playStation(station, first)
    toast.info(`Tuning in to ${station.name}…`)
  } catch (err) {
    toast.error(errorMessage(err))
  }
}

export async function startTrackRadio(track: Track): Promise<void> {
  const t = track.id && !isLocalId(track.id) ? track : await api.catalog.match({ ...track, id: '' }).catch(() => null)
  if (!t) return void toast.error(`Couldn’t find “${track.title}” on YouTube.`)
  const seedTrack = { ...t, artUrl: track.artUrl ?? t.artUrl }
  await start({ type: 'track', ref: t.id, name: `${t.title} Radio`, artUrl: seedTrack.artUrl, track: seedTrack }, seedTrack)
}

export function startArtistRadio(name: string, artUrl?: string): Promise<void> {
  return start({ type: 'artist', ref: name.trim(), name: `${name.trim()} Radio`, artUrl })
}

export function startTagRadio(tag: string): Promise<void> {
  const t = tag.trim().toLowerCase()
  return start({ type: 'tag', ref: t, name: `${t.replace(/\b\w/g, (c) => c.toUpperCase())} Radio` })
}

export function startPlaylistRadio(pl: LocalPlaylist): Promise<void> {
  return start({ type: 'playlist', ref: String(pl.id), name: `${pl.name} Radio`, artUrl: pl.artUrl })
}

export async function setLiked(track: Track, liked: boolean): Promise<void> {
  const t = track.id ? track : await api.catalog.match(track).catch(() => null)
  if (!t) return void toast.error(`Couldn’t find “${track.title}” on YouTube.`)
  try {
    await api.library.setLiked(t, liked)
    invalidateLikes()
  } catch (err) {
    toast.error(errorMessage(err))
  }
}

/** Resolve any metadata-only tracks (e.g. charts) before they're stored. */
export async function ensureIds(tracks: Track[]): Promise<Track[]> {
  const out: Track[] = []
  for (const t of tracks) {
    if (t.id) out.push(t)
    else {
      const m = await api.catalog.match(t).catch(() => null)
      if (m) out.push({ ...m, artUrl: t.artUrl ?? m.artUrl })
    }
  }
  return out
}

export async function addToPlaylist(playlist: { id: number; name: string }, tracks: Track[]): Promise<void> {
  try {
    const resolved = await ensureIds(tracks)
    await api.library.addTracks(playlist.id, resolved)
    invalidatePlaylists(playlist.id)
    toast.success(resolved.length === 1 ? `Added to ${playlist.name}` : `Added ${resolved.length} songs to ${playlist.name}`)
  } catch (err) {
    toast.error(errorMessage(err))
  }
}

export async function saveAsPlaylist(name: string, tracks: Track[]): Promise<LocalPlaylist | undefined> {
  try {
    const pl = await api.library.createPlaylist(name, await ensureIds(tracks))
    invalidatePlaylists()
    toast.success(`Saved “${pl.name}” to your library`)
    return pl
  } catch (err) {
    toast.error(errorMessage(err))
  }
}
