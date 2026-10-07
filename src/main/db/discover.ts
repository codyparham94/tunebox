import type { DiscoverSignals, SearchEntry, Track } from '@shared/types'
import { artistKey, trackKey } from '../util/text'
import type { Db } from './index'
import { TRACK_COLUMNS, rowToTrack, type TrackRow } from './tracks'

/** Searches typed within this window that extend each other ("tay" → "taylor") are one search. */
const MERGE_WINDOW_MS = 60_000

export function recordSearch(db: Db, query: string, top: { artist?: string; track?: Track }, now = Date.now()): void {
  const q = query.trim().replace(/\s+/g, ' ')
  if (q.length < 2) return
  const last = db.prepare('SELECT id, query, at FROM searches ORDER BY at DESC, id DESC LIMIT 1').get() as
    | { id: number; query: string; at: number }
    | undefined
  const a = q.toLowerCase()
  const b = last?.query.toLowerCase() ?? ''
  const merge = last && now - last.at < MERGE_WINDOW_MS && (a.startsWith(b) || b.startsWith(a))
  const trackJson = top.track?.id ? JSON.stringify(top.track) : null
  if (merge) {
    db.prepare('UPDATE searches SET query = ?, top_artist = ?, top_track_json = ?, at = ? WHERE id = ?').run(
      q,
      top.artist ?? null,
      trackJson,
      now,
      last.id
    )
  } else {
    db.prepare('INSERT INTO searches (query, top_artist, top_track_json, at) VALUES (?, ?, ?, ?)').run(
      q,
      top.artist ?? null,
      trackJson,
      now
    )
  }
}

/** Recent searches, newest first, one per distinct query. */
export function recentSearches(db: Db, limit = 20): SearchEntry[] {
  const rows = db
    .prepare(
      `SELECT query, top_artist, top_track_json, MAX(at) AS at FROM searches
       GROUP BY lower(query) ORDER BY at DESC LIMIT ?`
    )
    .all(limit) as { query: string; top_artist: string | null; top_track_json: string | null; at: number }[]
  return rows.map((r) => ({
    query: r.query,
    topArtist: r.top_artist ?? undefined,
    topTrack: r.top_track_json ? (JSON.parse(r.top_track_json) as Track) : undefined,
    at: r.at
  }))
}

export function clearSearches(db: Db): void {
  db.exec('DELETE FROM searches')
}

/** Everything the user already knows: played, saved to a playlist, or rated. */
export function knownTracks(db: Db): { ids: Set<string>; keys: Set<string> } {
  const rows = db
    .prepare(
      `SELECT id, title, artist FROM tracks WHERE id IN (
         SELECT track_id FROM history UNION SELECT track_id FROM playlist_tracks UNION SELECT track_id FROM feedback)`
    )
    .all() as { id: string; title: string; artist: string }[]
  return { ids: new Set(rows.map((r) => r.id)), keys: new Set(rows.map((r) => trackKey(r.artist, r.title))) }
}

/** Tracks whose latest global feedback is a thumbs down. */
export function dislikedIds(db: Db): Set<string> {
  const rows = db
    .prepare(
      `SELECT f.track_id FROM feedback f WHERE f.station_id IS NULL AND f.id = (
         SELECT f2.id FROM feedback f2 WHERE f2.track_id = f.track_id AND f2.station_id IS NULL
         ORDER BY f2.at DESC, f2.id DESC LIMIT 1) AND f.value < 0`
    )
    .all() as { track_id: string }[]
  return new Set(rows.map((r) => r.track_id))
}

/** A random handful of tracks from the user's playlists, with the playlist they came from. */
export function playlistSample(db: Db, limit = 3): { track: Track; playlist: string }[] {
  const rows = db
    .prepare(
      `SELECT ${TRACK_COLUMNS}, p.name AS playlist FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id JOIN playlists p ON p.id = pt.playlist_id
       WHERE t.id NOT LIKE 'local:%' ORDER BY RANDOM() LIMIT ?`
    )
    .all(limit) as unknown as (TrackRow & { playlist: string })[]
  return rows.map((r) => ({ track: rowToTrack(r), playlist: r.playlist }))
}

/** Plays that count as listening: finished, or at least 30 seconds. */
const LISTENED = '(h.completed = 1 OR h.listened_ms >= 30000)'

/**
 * Artists the user has really shown interest in: liked one of their songs, or listened
 * to them at least `minPlays` times. One play alone doesn't make an artist a favourite.
 */
export function establishedArtists(db: Db, minPlays = 3): Set<string> {
  const plays = db
    .prepare(`SELECT t.artist, COUNT(*) AS n FROM history h JOIN tracks t ON t.id = h.track_id WHERE ${LISTENED} GROUP BY t.artist`)
    .all() as { artist: string; n: number }[]
  const counts = new Map<string, number>()
  for (const r of plays) {
    const k = artistKey(r.artist)
    counts.set(k, (counts.get(k) ?? 0) + r.n)
  }
  const out = new Set([...counts].filter(([, n]) => n >= minPlays).map(([k]) => k))
  const liked = db
    .prepare(
      `SELECT DISTINCT t.artist FROM feedback f JOIN tracks t ON t.id = f.track_id
       WHERE f.station_id IS NULL AND f.value > 0`
    )
    .all() as { artist: string }[]
  for (const r of liked) out.add(artistKey(r.artist))
  return out
}

export function signalCounts(db: Db): DiscoverSignals {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n
  return {
    likes: n(
      `SELECT COUNT(*) AS n FROM feedback f WHERE f.station_id IS NULL AND f.value > 0 AND f.id = (
         SELECT f2.id FROM feedback f2 WHERE f2.track_id = f.track_id AND f2.station_id IS NULL
         ORDER BY f2.at DESC, f2.id DESC LIMIT 1)`
    ),
    playlistTracks: n('SELECT COUNT(*) AS n FROM playlist_tracks'),
    searches: n('SELECT COUNT(DISTINCT lower(query)) AS n FROM searches'),
    plays: n('SELECT COUNT(*) AS n FROM history')
  }
}
