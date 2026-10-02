import { BrowserWindow, app, dialog, ipcMain, webContents, type WebContents } from 'electron'
import { API_METHODS, EVENT, isLocalId, type TuneboxApi } from '@shared/api'
import { DEFAULT_EQ, type EqState } from '@shared/eq'
import type { ResolverHealth, Settings } from '@shared/types'
import { db } from '../context'
import { clearSearches, recentSearches, recordSearch } from '../db/discover'
import * as feedback from '../db/feedback'
import * as playlists from '../db/playlists'
import { getSettings, getState, setSettings, setState } from '../db/settings'
import * as stations from '../db/stations'
import { upsertTrack } from '../db/tracks'
import { clearLocal, listLocal } from '../db/localTracks'
import { discoverFeed, staleDiscover } from '../discover/feed'
import { importPlaylist } from '../import/importer'
import { scanFolder } from '../local/library'
import { updateTray } from '../os/tray'
import { checkForUpdate, installUpdate, updateStatus } from '../os/updater'
import { ensureTags, forgetStation, nextTracks, retuneStation, stationFeedback } from '../radio/station'
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
  openEqWindow(): void
}

let eqSaveTimer: NodeJS.Timeout | undefined

type Handlers = { [G in keyof TuneboxApi]: TuneboxApi[G] }

function handlers(deps: IpcDeps, sender: () => WebContents | undefined): Handlers {
  return {
    catalog: {
      search: async (q) => {
        const results = await ytm.search(q)
        const top = results.songs[0]
        try {
          recordSearch(db(), q, { artist: top?.artist ?? results.artists[0]?.name, track: top })
        } catch (err) {
          console.warn('[discover] could not record search', (err as Error).message)
        }
        return results
      },
      artist: (id) => ytm.artist(id),
      album: (id) => ytm.album(id),
      remotePlaylist: (id) => ytm.playlist(id, { max: 300 }),
      match: async (t) => (await resolveMatch(t))?.track ?? null,
      locate: (t) => ytm.locate(t),
      charts: (genreId, limit) => deezer.chart(genreId ?? 0, limit ?? 30),
      chartAlbums: (genreId) => deezer.chartAlbums(genreId ?? 0),
      chartArtists: (genreId) => deezer.chartArtists(genreId ?? 0),
      findArtist: async (name) => (await ytm.findArtistId(name)) ?? null,
      findAlbum: async (title, artist) => (await ytm.findAlbumId(title, artist)) ?? null,
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
      history: async (limit) => feedback.history(db(), limit),
      topPlayed: async (days, limit) => feedback.topPlayed(db(), days, limit)
    },
    radio: {
      stations: async () => stations.listStations(db()),
      create: async (seed) => stations.createStation(db(), seed),
      remove: async (id) => {
        stations.deleteStation(db(), id)
        forgetStation(id)
      },
      next: (id, count) => nextTracks(id, count),
      feedback: (stationId, track, value) => stationFeedback(stationId, track, value),
      addArtist: async (id, name) => {
        const st = stations.addStationArtist(db(), id, name)
        retuneStation(id)
        return st
      },
      removeArtist: async (id, name) => {
        const st = stations.removeStationArtist(db(), id, name)
        retuneStation(id)
        return st
      }
    },
    importer: {
      playlist: (url) => importPlaylist(url, (p) => sender()?.send(EVENT.importProgress, p))
    },
    discover: {
      feed: (refresh) => discoverFeed(refresh),
      searches: async (limit) => recentSearches(db(), limit),
      clearSearches: async () => {
        clearSearches(db())
        staleDiscover()
      }
    },
    local: {
      chooseFolder: async () => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        const current = getSettings(db()).musicFolder
        const res = await dialog.showOpenDialog(win, {
          title: 'Choose your music folder',
          buttonLabel: 'Use this folder',
          defaultPath: current || undefined,
          properties: ['openDirectory']
        })
        const folder = res.filePaths[0]
        if (res.canceled || !folder) return null
        if (folder !== current) clearLocal(db())
        setSettings(db(), { musicFolder: folder })
        return scanFolder(folder, (p) => sender()?.send(EVENT.localScan, p))
      },
      scan: async () => {
        const folder = getSettings(db()).musicFolder
        if (!folder) throw new Error('Choose a music folder first.')
        return scanFolder(folder, (p) => sender()?.send(EVENT.localScan, p))
      },
      tracks: async () => listLocal(db())
    },
    eq: {
      get: async () => ({ ...DEFAULT_EQ, ...getState<EqState>(db(), 'eq') }),
      set: async (state, clientId) => {
        for (const wc of webContents.getAllWebContents()) {
          if (!wc.isDestroyed() && wc.getType() === 'window') wc.send(EVENT.eq, { state, clientId })
        }
        // Slider drags send many updates; write the last one.
        clearTimeout(eqSaveTimer)
        eqSaveTimer = setTimeout(() => setState(db(), 'eq', state), 300)
      },
      popout: async () => deps.openEqWindow()
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
        if (isLocalId(id)) return
        await resolveStream(id, { quality: getSettings(db()).audioQuality }).catch(() => undefined)
      },
      health: async () => deps.getHealth(),
      updateYtdlp: async () => {
        const msg = await ytdlpUpdate()
        void deps.runHealthCheck()
        return msg
      },
      nowPlaying: async (s) => updateTray(s),
      appVersion: async () => app.getVersion(),
      checkUpdate: () => checkForUpdate(),
      updateStatus: async () => updateStatus(),
      installUpdate: () => installUpdate()
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
