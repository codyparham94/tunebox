import type { Station, StationSeed } from '@shared/types'
import { artistKey } from '../util/text'
import type { Db } from './index'

/** Enough to widen a station without drowning out its seed. */
export const MAX_STATION_ARTISTS = 10

interface StationRow {
  id: number
  seed_type: Station['seedType']
  seed_ref: string
  seed_json: string | null
  name: string
  art_url: string | null
  created_at: number
  last_played_at: number | null
  artists_json: string | null
}

const toStation = (r: StationRow): Station => ({
  id: r.id,
  seedType: r.seed_type,
  seedRef: r.seed_ref,
  name: r.name,
  artUrl: r.art_url ?? undefined,
  createdAt: r.created_at,
  lastPlayedAt: r.last_played_at ?? undefined,
  artists: r.artists_json ? (JSON.parse(r.artists_json) as string[]) : []
})

export function listStations(db: Db): Station[] {
  return (
    db.prepare('SELECT * FROM stations ORDER BY COALESCE(last_played_at, created_at) DESC').all() as unknown as StationRow[]
  ).map(toStation)
}

export function getStation(db: Db, id: number): { station: Station; seed: StationSeed } {
  const r = db.prepare('SELECT * FROM stations WHERE id = ?').get(id) as StationRow | undefined
  if (!r) throw new Error(`Station ${id} not found`)
  const seed: StationSeed = r.seed_json
    ? JSON.parse(r.seed_json)
    : { type: r.seed_type, ref: r.seed_ref, name: r.name, artUrl: r.art_url ?? undefined }
  return { station: toStation(r), seed }
}

/** Reuses an existing station with the same seed instead of making a duplicate. */
export function createStation(db: Db, seed: StationSeed): Station {
  const existing = db
    .prepare('SELECT * FROM stations WHERE seed_type = ? AND seed_ref = ?')
    .get(seed.type, seed.ref) as StationRow | undefined
  if (existing) return toStation(existing)
  const res = db
    .prepare(
      'INSERT INTO stations (seed_type, seed_ref, seed_json, name, art_url, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(seed.type, seed.ref, JSON.stringify(seed), seed.name, seed.artUrl ?? null, Date.now())
  return getStation(db, Number(res.lastInsertRowid)).station
}

export function touchStation(db: Db, id: number): void {
  db.prepare('UPDATE stations SET last_played_at = ? WHERE id = ?').run(Date.now(), id)
}

export function deleteStation(db: Db, id: number): void {
  db.prepare('DELETE FROM feedback WHERE station_id = ?').run(id)
  db.prepare('DELETE FROM artist_affinity WHERE station_id = ?').run(id)
  db.prepare('DELETE FROM tag_affinity WHERE station_id = ?').run(id)
  db.prepare('DELETE FROM stations WHERE id = ?').run(id)
}

/** Adds an artist to a station. Duplicates (and the seed artist itself) are ignored. */
export function addStationArtist(db: Db, id: number, name: string): Station {
  const { station, seed } = getStation(db, id)
  const clean = name.trim().replace(/\s+/g, ' ')
  const key = artistKey(clean)
  if (!key) throw new Error('Enter an artist name.')
  const taken = new Set(station.artists.map(artistKey))
  if (seed.type === 'artist') taken.add(artistKey(seed.ref))
  if (taken.has(key)) return station
  if (station.artists.length >= MAX_STATION_ARTISTS) {
    throw new Error(`A station can have up to ${MAX_STATION_ARTISTS} extra artists.`)
  }
  return setStationArtists(db, id, [...station.artists, clean])
}

export function renameStation(db: Db, id: number, name: string): Station {
  const clean = name.trim().replace(/s+/g, ' ').slice(0, 80)
  if (!clean) throw new Error('Enter a station name.')
  db.prepare('UPDATE stations SET name = ? WHERE id = ?').run(clean, id)
  return getStation(db, id).station
}

export function removeStationArtist(db: Db, id: number, name: string): Station {
  const key = artistKey(name)
  const { station } = getStation(db, id)
  return setStationArtists(db, id, station.artists.filter((a) => artistKey(a) !== key))
}

function setStationArtists(db: Db, id: number, artists: string[]): Station {
  db.prepare('UPDATE stations SET artists_json = ? WHERE id = ?').run(artists.length ? JSON.stringify(artists) : null, id)
  return getStation(db, id).station
}
