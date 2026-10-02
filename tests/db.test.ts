import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Track } from '@shared/types'
import { migrate, type Db } from '../src/main/db'
import {
  bannedArtists,
  bannedTracks,
  bumpAffinity,
  history,
  likedIds,
  readAffinity,
  recordFeedback,
  recordPlay,
  setLiked
} from '../src/main/db/feedback'
import * as pl from '../src/main/db/playlists'
import { getSettings, setSettings } from '../src/main/db/settings'
import { createStation, deleteStation, getStation, listStations } from '../src/main/db/stations'
import { getMatch, putMatch, setTrackTags, upsertTrack } from '../src/main/db/tracks'
import { HALF_LIFE_MS } from '../src/main/radio/affinity'
import { MIGRATIONS } from '../src/main/db/schema'
import { clearLocal, listLocal, localIndex, removeLocal, upsertLocal, type LocalTrackInput } from '../src/main/db/localTracks'
import { audioUrl, isLocalId } from '../src/shared/api'

const t = (id: string, artist = 'Artist', title = `Song ${id}`): Track => ({ id, title, artist, duration: 200 })

let db: Db
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
})

describe('migrations', () => {
  it('are idempotent', () => {
    migrate(db)
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length)
  })
})

describe('playlists', () => {
  it('creates, adds, reorders, removes, and deletes', () => {
    const p = pl.createPlaylist(db, 'Road trip', [t('a0000000001'), t('a0000000002')])
    expect(p.trackCount).toBe(2)
    pl.addTracks(db, p.id, [t('a0000000003')])
    pl.moveTrack(db, p.id, 2, 0)
    expect(pl.getPlaylist(db, p.id).tracks.map((x) => x.id)).toEqual(['a0000000003', 'a0000000001', 'a0000000002'])
    pl.moveTrack(db, p.id, 0, 2)
    expect(pl.getPlaylist(db, p.id).tracks.map((x) => x.id)).toEqual(['a0000000001', 'a0000000002', 'a0000000003'])
    pl.removeTrack(db, p.id, 1)
    expect(pl.getPlaylist(db, p.id).tracks.map((x) => x.id)).toEqual(['a0000000001', 'a0000000003'])
    pl.renamePlaylist(db, p.id, 'Night drive')
    expect(pl.listPlaylists(db)[0]).toMatchObject({ name: 'Night drive', trackCount: 2 })
    pl.deletePlaylist(db, p.id)
    expect(pl.listPlaylists(db)).toHaveLength(0)
  })

  it('allows the same track twice', () => {
    const p = pl.createPlaylist(db, 'Repeat', [t('a0000000001'), t('a0000000001')])
    expect(pl.getPlaylist(db, p.id).tracks).toHaveLength(2)
  })
})

describe('likes and feedback', () => {
  it('toggles liked songs', () => {
    setLiked(db, t('b0000000001'), true)
    setLiked(db, t('b0000000002'), true)
    expect(likedIds(db).sort()).toEqual(['b0000000001', 'b0000000002'])
    setLiked(db, t('b0000000001'), false)
    expect(likedIds(db)).toEqual(['b0000000002'])
  })

  it('bans disliked tracks and artists per station only', () => {
    const s = createStation(db, { type: 'artist', ref: 'Seed', name: 'Seed radio' })
    recordFeedback(db, t('c0000000001', 'Noisy Band'), s.id, -1)
    expect(bannedTracks(db, s.id)).toEqual(new Set(['c0000000001']))
    expect(bannedArtists(db, s.id)).toEqual(new Set(['noisy band']))
    expect(bannedTracks(db, 999).size).toBe(0)
    recordFeedback(db, t('c0000000002', 'Noisy Band'), s.id, 1)
    expect(bannedArtists(db, s.id).size).toBe(0)
  })

  it('learns artist and tag affinity, station feedback counts double', () => {
    upsertTrack(db, t('d0000000001', 'Liked Artist'))
    setTrackTags(db, 'd0000000001', ['jazz'])
    recordFeedback(db, t('d0000000001', 'Liked Artist'), null, 1)
    const global = readAffinity(db, 'artist_affinity', null).get('liked artist')!
    recordFeedback(db, t('d0000000002', 'Station Artist'), 7, 1)
    const station = readAffinity(db, 'artist_affinity', 7).get('station artist')!
    expect(global).toBeGreaterThan(0)
    expect(station).toBeGreaterThan(global)
    expect(readAffinity(db, 'tag_affinity', null).get('jazz')).toBeGreaterThan(0)
  })

  it('records plays: full listens help, quick skips hurt', () => {
    recordPlay(db, { track: t('e0000000001', 'Good'), listenedMs: 200_000, completed: true, skipped: false, stationId: null })
    recordPlay(db, { track: t('e0000000002', 'Bad'), listenedMs: 5_000, completed: false, skipped: true, stationId: null })
    const a = readAffinity(db, 'artist_affinity', null)
    expect(a.get('good')).toBeGreaterThan(0)
    expect(a.get('bad')).toBeLessThan(0)
    expect(history(db).map((h) => h.track.id)).toEqual(['e0000000002', 'e0000000001'])
  })

  it('decays with a 30-day half-life', () => {
    const now = Date.now()
    bumpAffinity(db, 'artist_affinity', 'old', 0, 2, now - HALF_LIFE_MS)
    const raw = db.prepare("SELECT score FROM artist_affinity WHERE key = 'old'").get() as { score: number }
    expect(raw.score).toBe(2)
    expect(readAffinity(db, 'artist_affinity', null, now).get('old')).toBeCloseTo(Math.tanh(1 / 2), 5)
  })
})

describe('stations, settings, match cache', () => {
  it('reuses a station for the same seed and cleans up on delete', () => {
    const a = createStation(db, { type: 'tag', ref: 'jazz', name: 'Jazz' })
    const b = createStation(db, { type: 'tag', ref: 'jazz', name: 'Jazz' })
    expect(a.id).toBe(b.id)
    expect(getStation(db, a.id).seed).toMatchObject({ type: 'tag', ref: 'jazz' })
    recordFeedback(db, t('f0000000001'), a.id, -1)
    deleteStation(db, a.id)
    expect(listStations(db)).toHaveLength(0)
    expect(bannedTracks(db, a.id).size).toBe(0)
  })

  it('stores settings with defaults', () => {
    expect(getSettings(db).audioQuality).toBe('high')
    expect(setSettings(db, { audioQuality: 'low', theme: 'dark' })).toMatchObject({ audioQuality: 'low', theme: 'dark' })
  })

  it('caches matches including misses', () => {
    putMatch(db, 'a|b', { videoId: null, confidence: 0 })
    putMatch(db, 'c|d', { videoId: 'g0000000001', confidence: 0.8 })
    expect(getMatch(db, 'a|b')).toEqual({ videoId: null, confidence: 0 })
    expect(getMatch(db, 'c|d')?.videoId).toBe('g0000000001')
  })
})

describe('local tracks', () => {
  const file = (path: string, over: Partial<LocalTrackInput> = {}): LocalTrackInput => ({
    path, mtime: 1, size: 100, title: path, artist: 'Artist', album: 'Album', track_no: null, disc_no: null, year: null, duration: 180.4, ...over
  })

  it('lists in artist / album / track order with local ids and art urls', () => {
    upsertLocal(db, [
      file('C:/m/b2.mp3', { artist: 'Beta', track_no: 2, title: 'Second' }),
      file('C:/m/b1.mp3', { artist: 'Beta', track_no: 1, title: 'First' }),
      file('C:/m/a.mp3', { artist: 'alpha', title: 'Alpha song' })
    ])
    const list = listLocal(db)
    expect(list.map((t) => t.title)).toEqual(['Alpha song', 'First', 'Second'])
    expect(isLocalId(list[0].id)).toBe(true)
    expect(audioUrl(list[0].id)).toMatch(/^tunebox-audio:\/\/local\/\d+$/)
    expect(list[0].artUrl).toMatch(/^tunebox-audio:\/\/localart\/\d+$/)
    expect(list[0].duration).toBe(180)
  })

  it('updates in place on rescan and removes vanished files', () => {
    upsertLocal(db, [file('C:/m/x.mp3'), file('C:/m/y.mp3')])
    const id = localIndex(db).get('C:/m/x.mp3')!.id
    upsertLocal(db, [file('C:/m/x.mp3', { mtime: 2, title: 'Retagged' })])
    expect(localIndex(db).get('C:/m/x.mp3')).toMatchObject({ id, mtime: 2 })
    removeLocal(db, ['C:/m/y.mp3'])
    expect(listLocal(db).map((t) => t.title)).toEqual(['Retagged'])
    clearLocal(db)
    expect(listLocal(db)).toHaveLength(0)
  })

  it('keeps YouTube ids on the track protocol', () => {
    expect(audioUrl('dQw4w9WgXcQ')).toBe('tunebox-audio://track/dQw4w9WgXcQ')
  })
})
