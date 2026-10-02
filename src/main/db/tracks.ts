import type { Track } from '@shared/types'
import type { Db } from './index'

export interface TrackRow {
  id: string
  title: string
  artist: string
  artist_id: string | null
  album: string | null
  album_id: string | null
  duration: number
  art_url: string | null
  tags_json: string | null
}

export const TRACK_COLUMNS = 't.id, t.title, t.artist, t.artist_id, t.album, t.album_id, t.duration, t.art_url'

export function rowToTrack(r: TrackRow): Track {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    artistId: r.artist_id ?? undefined,
    album: r.album ?? undefined,
    albumId: r.album_id ?? undefined,
    duration: r.duration,
    artUrl: r.art_url ?? undefined
  }
}

/** Insert or refresh a track. Keeps existing tags. */
export function upsertTrack(db: Db, t: Track): void {
  if (!t.id) throw new Error('Cannot store a track without a videoId')
  db.prepare(
    `INSERT INTO tracks (id, title, artist, artist_id, album, album_id, duration, art_url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, artist = excluded.artist,
       artist_id = COALESCE(excluded.artist_id, tracks.artist_id),
       album = COALESCE(excluded.album, tracks.album),
       album_id = COALESCE(excluded.album_id, tracks.album_id),
       duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE tracks.duration END,
       art_url = COALESCE(excluded.art_url, tracks.art_url),
       updated_at = excluded.updated_at`
  ).run(
    t.id,
    t.title,
    t.artist,
    t.artistId ?? null,
    t.album ?? null,
    t.albumId ?? null,
    Math.round(t.duration || 0),
    t.artUrl ?? null,
    Date.now()
  )
}

export function getTrack(db: Db, id: string): (Track & { tags?: string[] }) | undefined {
  const r = db.prepare(`SELECT ${TRACK_COLUMNS}, t.tags_json FROM tracks t WHERE t.id = ?`).get(id) as
    | TrackRow
    | undefined
  if (!r) return undefined
  return { ...rowToTrack(r), tags: r.tags_json ? JSON.parse(r.tags_json) : undefined }
}

export function setTrackTags(db: Db, id: string, tags: string[]): void {
  db.prepare('UPDATE tracks SET tags_json = ? WHERE id = ?').run(JSON.stringify(tags), id)
}

export function getArtistTags(db: Db, artist: string): string[] | undefined {
  const r = db.prepare('SELECT tags_json FROM artist_tags WHERE artist = ?').get(artist.toLowerCase()) as
    | { tags_json: string }
    | undefined
  return r ? JSON.parse(r.tags_json) : undefined
}

export function setArtistTags(db: Db, artist: string, tags: string[]): void {
  db.prepare(
    `INSERT INTO artist_tags (artist, tags_json, at) VALUES (?, ?, ?)
     ON CONFLICT(artist) DO UPDATE SET tags_json = excluded.tags_json, at = excluded.at`
  ).run(artist.toLowerCase(), JSON.stringify(tags), Date.now())
}

export interface MatchCacheEntry {
  videoId: string | null
  confidence: number
}

export function getMatch(db: Db, key: string): MatchCacheEntry | undefined {
  const r = db.prepare('SELECT video_id, confidence FROM match_cache WHERE source_key = ?').get(key) as
    | { video_id: string | null; confidence: number }
    | undefined
  return r ? { videoId: r.video_id, confidence: r.confidence } : undefined
}

export function putMatch(db: Db, key: string, entry: MatchCacheEntry): void {
  db.prepare(
    `INSERT INTO match_cache (source_key, video_id, confidence, at) VALUES (?, ?, ?, ?)
     ON CONFLICT(source_key) DO UPDATE SET video_id = excluded.video_id, confidence = excluded.confidence, at = excluded.at`
  ).run(key, entry.videoId, entry.confidence, Date.now())
}
