import type { Station, StationSeed } from '@shared/types'
import type { Db } from './index'

interface StationRow {
  id: number
  seed_type: Station['seedType']
  seed_ref: string
  seed_json: string | null
  name: string
  art_url: string | null
  created_at: number
  last_played_at: number | null
}

const toStation = (r: StationRow): Station => ({
  id: r.id,
  seedType: r.seed_type,
  seedRef: r.seed_ref,
  name: r.name,
  artUrl: r.art_url ?? undefined,
  createdAt: r.created_at,
  lastPlayedAt: r.last_played_at ?? undefined
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
