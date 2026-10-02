import { ipcMain, type WebContents } from 'electron'
import { API_METHODS, EVENT, type TuneboxApi } from '@shared/api'
import type { ResolverHealth, Settings } from '@shared/types'
import { db } from '../context'
import * as feedback from '../db/feedback'
import * as playlists from '../db/playlists'
import { getSettings, setSettings } from '../db/settings'
import * as stations from '../db/stations'
import { upsertTrack } from '../db/tracks'
import { importPlaylist } from '../import/importer'
import { updateTray } from '../os/tray'
import { ensureTags, forgetStation, nextTracks, stationFeedback } from '../radio/station'
import { resolveMatch } from '../sources/catalog'
import * as deezer from '../sources/deezer'
import * as lastfm from '../sources/lastfm'
import * as ytm from '../sources/ytmusic'
import { resolveStream } from '../stream/resolver'
import { ytdlpUpdate } from '../stream/ytdlp'

const FALLBACK_TAGS = [
  'chill', 'indie', 'hip-hop', 'electronic', 'rock', 'jazz', 'pop', 'soul',
  'lo-fi', 'classical', 'metal', 'folk', 'rnb', 'house', 'ambient', 'country'
]

export interface IpcDeps {
  getHealth(): ResolverHealth | null
  runHealthCheck(): Promise<ResolverHealth>
  onSettingsChanged(s: Settings): void
}

type Handlers = { [G in keyof TuneboxApi]: TuneboxApi[G] }

function handlers(deps: IpcDeps, sender: () => WebContents | undefined): Handlers {
  return {
    catalog: {
      search: (q) => ytm.search(q),
      artist: (id) => ytm.artist(id),
      album: (id) => ytm.album(id),
      remotePlaylist: (id) => ytm.playlist(id, { max: 300 }),
      match: async (t) => (await resolveMatch(t))?.track ?? null,
      locate: (t) => ytm.locate(t),
      charts: (genreId) => deezer.chart(genreId ?? 0),
      genres: () => deezer.genres(),
      tags: async () => (lastfm.lastfmAvailable() ? lastfm.topTags(24).catch(() => FALLBACK_TAGS) : FALLBACK_TAGS)
    },
    library: {
      playlists: async () => playlists.listPlaylists(db()),
      playlist: async (id) => playlists.getPlaylist(db(), id),
      createPlaylist: async (name, tracks) => playlists.createPlaylist(db(), name, tracks),
      renamePlaylist: async (id, name) => playlists.renamePlaylist(db(), id, name),
      deletePlaylist: async (id) => playlists.deletePlaylist(db(), id),
      addTracks: async (id, tracks) => playlists.addTracks(db(), id, tracks),
      removeTrack: async (id, pos) => playlists.removeTrack(db(), id, pos),
      moveTrack: async (id, from, to) => playlists.moveTrack(db(), id, from, to),
      liked: async () => feedback.likedTracks(db()),
      likedIds: async () => feedback.likedIds(db()),
      setLiked: async (track, liked) => {
        upsertTrack(db(), track)
        await ensureTags(track)
        feedback.setLiked(db(), track, liked)
      },
      recordPlay: async (e) => {
        upsertTrack(db(), e.track)
        await ensureTags(e.track)
        feedback.recordPlay(db(), e)
      },
      history: async (limit) => feedback.history(db(), limit)
    },
    radio: {
      stations: async () => stations.listStations(db()),
      create: async (seed) => stations.createStation(db(), seed),
      remove: async (id) => {
        stations.deleteStation(db(), id)
        forgetStation(id)
      },
      next: (id, count) => nextTracks(id, count),
      feedback: (stationId, track, value) => stationFeedback(stationId, track, value)
    },
    importer: {
      playlist: (url) => importPlaylist(url, (p) => sender()?.send(EVENT.importProgress, p))
    },
    settings: {
      get: async () => getSettings(db()),
      set: async (patch) => {
        const s = setSettings(db(), patch)
        deps.onSettingsChanged(s)
        return s
      }
    },
    system: {
      prefetch: async (id) => {
        await resolveStream(id, { quality: getSettings(db()).audioQuality }).catch(() => undefined)
      },
      health: async () => deps.getHealth(),
      updateYtdlp: async () => {
        const msg = await ytdlpUpdate()
        void deps.runHealthCheck()
        return msg
      },
      nowPlaying: async (s) => updateTray(s)
    }
  }
}

export function registerIpc(deps: IpcDeps, sender: () => WebContents | undefined): void {
  const all = handlers(deps, sender) as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>
  for (const [group, methods] of Object.entries(API_METHODS)) {
    for (const method of methods) {
      const fn = all[group][method]
      ipcMain.handle(`${group}:${method}`, async (_e, ...args: unknown[]) => {
        try {
          return await fn(...args)
        } catch (err) {
          console.error(`[ipc] ${group}:${method}`, (err as Error).message)
          throw err
        }
      })
    }
  }
}
