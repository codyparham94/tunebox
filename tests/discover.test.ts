import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Track } from '@shared/types'
import { migrate, type Db } from '../src/main/db'
import {
  clearSearches,
  dislikedIds,
  knownTracks,
  playlistSample,
  recentSearches,
  recordSearch,
  establishedArtists,
  signalCounts
} from '../src/main/db/discover'
import { recordFeedback, recordPlay, setLiked } from '../src/main/db/feedback'
import { createPlaylist } from '../src/main/db/playlists'
import { capPerArtist, isFresh, rankArtists, shelfTracks, topKeys, type Exclusions } from '../src/main/discover/rank'
import type { Candidate } from '../src/main/radio/scorer'
import { artistKey, trackKey } from '../src/main/util/text'

const t = (id: string, artist = 'Artist', title = `Song ${id}`): Track => ({ id, title, artist, duration: 200 })
const c = (id: string, artist: string, title = `Song ${id}`): Candidate => ({
  key: trackKey(artist, title),
  id,
  title,
  artist,
  similarity: 0.5,
  sources: ['ytm'],
  reason: 'test'
})
const none = (): Exclusions => ({ ids: new Set(), keys: new Set(), artists: new Set() })

let db: Db
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
})

describe('established artists', () => {
  const play = (id: string, artist: string, listenedMs = 200_000) =>
    recordPlay(db, { track: t(id, artist), listenedMs, completed: listenedMs >= 200_000, skipped: false, stationId: null })

  it('needs several real listens, or a like, before an artist counts', () => {
    play('a1', 'Once')
    play('b1', 'Often')
    play('b2', 'Often')
    play('b1', 'often') // same artist, different case
    play('c1', 'Skipped', 5_000)
    play('c1', 'Skipped', 5_000)
    play('c1', 'Skipped', 5_000)
    setLiked(db, t('d1', 'Liked Once'), true)
    const got = establishedArtists(db, 3)
    expect(got.has(artistKey('Often'))).toBe(true)
    expect(got.has(artistKey('Liked Once'))).toBe(true)
    expect(got.has(artistKey('Once'))).toBe(false)
    expect(got.has(artistKey('Skipped'))).toBe(false)
  })
})

describe('search history', () => {
  it('merges a query typed out letter by letter into one search', () => {
    const now = 1_000_000
    recordSearch(db, 'tay', {}, now)
    recordSearch(db, 'taylor', {}, now + 400)
    recordSearch(db, 'taylor swift', { artist: 'Taylor Swift', track: t('v1', 'Taylor Swift') }, now + 900)
    const list = recentSearches(db)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ query: 'taylor swift', topArtist: 'Taylor Swift' })
    expect(list[0].topTrack?.id).toBe('v1')
  })

  it('keeps unrelated or later searches separate, newest first, one per query', () => {
    recordSearch(db, 'radiohead', {}, 1000)
    recordSearch(db, 'bjork', {}, 2000)
    recordSearch(db, 'Radiohead', {}, 200_000)
    expect(recentSearches(db).map((s) => s.query.toLowerCase())).toEqual(['radiohead', 'bjork'])
    expect(signalCounts(db).searches).toBe(2)
  })

  it('ignores one-letter searches and can be cleared', () => {
    recordSearch(db, 'a', {})
    expect(recentSearches(db)).toHaveLength(0)
    recordSearch(db, 'abba', {})
    clearSearches(db)
    expect(recentSearches(db)).toHaveLength(0)
  })
})

describe('what the user already knows', () => {
  it('collects played, saved and rated tracks, and dislikes', () => {
    recordPlay(db, { track: t('p1'), listenedMs: 60_000, completed: true, skipped: false, stationId: null })
    createPlaylist(db, 'Mine', [t('pl1')])
    setLiked(db, t('l1'), true)
    recordFeedback(db, t('d1'), null, -1)
    const known = knownTracks(db)
    expect([...known.ids].sort()).toEqual(['d1', 'l1', 'p1', 'pl1'])
    expect(known.keys.has(trackKey('Artist', 'Song p1'))).toBe(true)
    expect([...dislikedIds(db)]).toEqual(['d1'])
    expect(playlistSample(db, 5)).toEqual([{ track: expect.objectContaining({ id: 'pl1' }), playlist: 'Mine' }])
    expect(signalCounts(db)).toEqual({ likes: 1, playlistTracks: 1, searches: 0, plays: 1 })
  })

  it('an unliked track no longer counts as a like', () => {
    setLiked(db, t('l1'), true)
    setLiked(db, t('l1'), false)
    expect(signalCounts(db).likes).toBe(0)
  })
})

describe('discover ranking', () => {
  it('drops known songs, other uploads of them, and disliked artists', () => {
    const ex: Exclusions = { ids: new Set(['a']), keys: new Set([trackKey('Muse', 'Uprising')]), artists: new Set(['nickelback']) }
    expect(isFresh({ id: 'a', title: 'X', artist: 'Y' }, ex)).toBe(false)
    expect(isFresh({ id: 'b', title: 'Uprising (Official Video)', artist: 'Muse' }, ex)).toBe(false)
    expect(isFresh({ id: 'c', title: 'Photograph', artist: 'Nickelback' }, ex)).toBe(false)
    expect(isFresh({ id: 'd', title: 'Hysteria', artist: 'Muse' }, ex)).toBe(true)
  })

  it('caps tracks per artist while keeping order', () => {
    const list = [c('1', 'A'), c('2', 'A'), c('3', 'B'), c('4', 'A'), c('5', 'B')]
    expect(capPerArtist(list, 2).map((x) => x.id)).toEqual(['1', '2', '3', '5'])
  })

  it('shelves prefer songs the mix did not use and need a playable id', () => {
    const cands = [c('1', 'A'), c('2', 'B'), { ...c('3', 'C'), id: undefined }, c('4', 'D')]
    const used = new Set([cands[0].key])
    expect(shelfTracks(cands, none(), used, 3).map((x) => x.id)).toEqual(['2', '4', '1'])
  })

  it('ranks related artists by how many favourites they connect to, skipping known ones', () => {
    const a = (name: string) => ({ id: name.toLowerCase(), name })
    const ranked = rankArtists(
      [
        { because: 'Muse', related: [a('Placebo'), a('Radiohead'), a('Muse')] },
        { because: 'Radiohead', related: [a('Placebo'), a('Portishead')] }
      ],
      new Set(['radiohead'])
    )
    expect(ranked.map((x) => x.name)).toEqual(['Placebo', 'Portishead'])
    expect(ranked[0].subtitle).toBe('Similar to Muse & Radiohead')
  })

  it('topKeys keeps the strongest positive scores', () => {
    const m = new Map([['rock', 0.8], ['jazz', -0.4], ['pop', 0.3], ['folk', 0.01]])
    expect(topKeys(m, 5)).toEqual(['rock', 'pop'])
  })
})

describe('station artists', () => {
  it('adds artists, skips duplicates and the seed artist, and removes them', async () => {
    const { createStation, addStationArtist, removeStationArtist, MAX_STATION_ARTISTS } = await import('../src/main/db/stations')
    const st = createStation(db, { type: 'artist', ref: 'Muse', name: 'Muse Radio' })
    expect(st.artists).toEqual([])
    addStationArtist(db, st.id, '  Placebo ')
    addStationArtist(db, st.id, 'placebo')
    addStationArtist(db, st.id, 'Muse')
    expect(addStationArtist(db, st.id, 'The Killers').artists).toEqual(['Placebo', 'The Killers'])
    expect(removeStationArtist(db, st.id, 'placebo').artists).toEqual(['The Killers'])
    expect(() => addStationArtist(db, st.id, '   ')).toThrow()
    for (let i = 0; i < MAX_STATION_ARTISTS - 1; i++) addStationArtist(db, st.id, `Band ${i}`)
    expect(() => addStationArtist(db, st.id, 'One Too Many')).toThrow(/up to/)
  })
})
