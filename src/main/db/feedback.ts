import type { HistoryEntry, PlayEvent, Track } from '@shared/types'
import { combineAffinity, decay, playWeight, WEIGHTS } from '../radio/affinity'
import { artistKey } from '../util/text'
import { tx, type Db } from './index'
import { TRACK_COLUMNS, getArtistTags, getTrack, rowToTrack, upsertTrack, type TrackRow } from './tracks'

type AffinityTable = 'artist_affinity' | 'tag_affinity'

/** Adds `weight` to a decayed affinity score. Exact, since every contribution decays at the same rate. */
export function bumpAffinity(
  db: Db,
  table: AffinityTable,
  key: string,
  stationId: number,
  weight: number,
  now = Date.now()
): void {
  if (!key || weight === 0) return
  const row = db.prepare(`SELECT score, updated_at FROM ${table} WHERE key = ? AND station_id = ?`).get(key, stationId) as
    | { score: number; updated_at: number }
    | undefined
  const score = (row ? row.score * decay(now - row.updated_at) : 0) + weight
  db.prepare(
    `INSERT INTO ${table} (key, station_id, score, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key, station_id) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at`
  ).run(key, stationId, score, now)
}

/** Decayed scores for global (station 0) and the given station, combined into [-1, 1]. */
export function readAffinity(db: Db, table: AffinityTable, stationId: number | null, now = Date.now()): Map<string, number> {
  const rows = db
    .prepare(`SELECT key, station_id, score, updated_at FROM ${table} WHERE station_id IN (0, ?)`)
    .all(stationId ?? 0) as { key: string; station_id: number; score: number; updated_at: number }[]
  const raw = new Map<string, { g: number; s: number }>()
  for (const r of rows) {
    const entry = raw.get(r.key) ?? { g: 0, s: 0 }
    const v = r.score * decay(now - r.updated_at)
    if (r.station_id === 0) entry.g += v
    else entry.s += v
    raw.set(r.key, entry)
  }
  const out = new Map<string, number>()
  for (const [k, { g, s }] of raw) out.set(k, combineAffinity(g, stationId ? s : 0))
  return out
}

function tagsFor(db: Db, track: Track): string[] {
  return getTrack(db, track.id)?.tags ?? getArtistTags(db, track.artist) ?? []
}

/** Applies one signal to the artist and (if known) tag affinities, globally and for the station. */
function applySignal(db: Db, track: Track, stationId: number | null, weight: number, now: number): void {
  const artist = artistKey(track.artist)
  const tags = tagsFor(db, track).slice(0, 5)
  for (const sid of stationId ? [0, stationId] : [0]) {
    bumpAffinity(db, 'artist_affinity', artist, sid, weight, now)
    for (const tag of tags) bumpAffinity(db, 'tag_affinity', tag, sid, weight * 0.5, now)
  }
}

export function recordPlay(db: Db, e: PlayEvent, now = Date.now()): void {
  if (!e.track.id) return
  tx(db, () => {
    upsertTrack(db, e.track)
    db.prepare(
      `INSERT INTO history (track_id, played_at, listened_ms, completed, skipped, station_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(e.track.id, now, Math.round(e.listenedMs), e.completed ? 1 : 0, e.skipped ? 1 : 0, e.stationId)
    applySignal(db, e.track, e.stationId, playWeight(e), now)
  })
}

export function recordFeedback(db: Db, track: Track, stationId: number | null, value: 1 | -1, now = Date.now()): void {
  tx(db, () => {
    upsertTrack(db, track)
    db.prepare('INSERT INTO feedback (track_id, station_id, value, at) VALUES (?, ?, ?, ?)').run(
      track.id,
      stationId,
      value,
      now
    )
    applySignal(db, track, stationId, value > 0 ? WEIGHTS.thumbUp : WEIGHTS.thumbDown, now)
  })
}

/** Latest global feedback per track. */
function latestGlobal(db: Db, trackId: string): number | undefined {
  const r = db
    .prepare('SELECT value FROM feedback WHERE track_id = ? AND station_id IS NULL ORDER BY at DESC, id DESC LIMIT 1')
    .get(trackId) as { value: number } | undefined
  return r?.value
}

export function setLiked(db: Db, track: Track, liked: boolean, now = Date.now()): void {
  const current = latestGlobal(db, track.id)
  if (liked && current !== 1) return recordFeedback(db, track, null, 1, now)
  if (!liked && current === 1) {
    tx(db, () => {
      db.prepare('DELETE FROM feedback WHERE track_id = ? AND station_id IS NULL AND value = 1').run(track.id)
      applySignal(db, track, null, -WEIGHTS.thumbUp, now)
    })
  }
}

const LIKED_SQL = `
  SELECT ${TRACK_COLUMNS}, f.at FROM feedback f JOIN tracks t ON t.id = f.track_id
  WHERE f.station_id IS NULL AND f.id = (
    SELECT f2.id FROM feedback f2 WHERE f2.track_id = f.track_id AND f2.station_id IS NULL
    ORDER BY f2.at DESC, f2.id DESC LIMIT 1)
  AND f.value = 1
  ORDER BY f.at DESC`

export function likedTracks(db: Db): Track[] {
  return (db.prepare(LIKED_SQL).all() as unknown as TrackRow[]).map(rowToTrack)
}

export function likedIds(db: Db): string[] {
  return likedTracks(db).map((t) => t.id)
}

/** Tracks whose latest feedback in this station is a thumbs down. */
export function bannedTracks(db: Db, stationId: number): Set<string> {
  const rows = db
    .prepare(
      `SELECT f.track_id FROM feedback f WHERE f.station_id = ? AND f.id = (
         SELECT f2.id FROM feedback f2 WHERE f2.track_id = f.track_id AND f2.station_id = ?
         ORDER BY f2.at DESC, f2.id DESC LIMIT 1) AND f.value < 0`
    )
    .all(stationId, stationId) as { track_id: string }[]
  return new Set(rows.map((r) => r.track_id))
}

/** Artists with net-negative explicit feedback in this station are dropped from it. */
export function bannedArtists(db: Db, stationId: number): Set<string> {
  const rows = db
    .prepare(
      `SELECT t.artist, SUM(f.value) AS net FROM feedback f JOIN tracks t ON t.id = f.track_id
       WHERE f.station_id = ? GROUP BY t.artist`
    )
    .all(stationId) as { artist: string; net: number }[]
  const out = new Set<string>()
  for (const r of rows) if (r.net <= -1) out.add(artistKey(r.artist))
  return out
}

/** Tracks liked in this station, newest first. */
export function stationLikes(db: Db, stationId: number, limit = 5): Track[] {
  return (
    db
      .prepare(
        `SELECT ${TRACK_COLUMNS} FROM feedback f JOIN tracks t ON t.id = f.track_id
         WHERE f.station_id = ? AND f.value > 0 ORDER BY f.at DESC LIMIT ?`
      )
      .all(stationId, limit) as unknown as TrackRow[]
  ).map(rowToTrack)
}

/** The most recent plays (track + artist), newest first. */
export function recentPlays(db: Db, limit = 50): Track[] {
  return (
    db
      .prepare(`SELECT ${TRACK_COLUMNS} FROM history h JOIN tracks t ON t.id = h.track_id ORDER BY h.played_at DESC, h.id DESC LIMIT ?`)
      .all(limit) as unknown as TrackRow[]
  ).map(rowToTrack)
}

/** Recently played, de-duplicated by track, newest first. */
export function history(db: Db, limit = 30): HistoryEntry[] {
  const rows = db
    .prepare(
      `SELECT ${TRACK_COLUMNS}, MAX(h.played_at) AS played_at FROM history h JOIN tracks t ON t.id = h.track_id
       GROUP BY h.track_id ORDER BY played_at DESC LIMIT ?`
    )
    .all(limit) as unknown as (TrackRow & { played_at: number })[]
  return rows.map((r) => ({ track: rowToTrack(r), playedAt: r.played_at }))
}
