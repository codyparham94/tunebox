import type { LocalPlaylist, LocalPlaylistDetail, Track } from '@shared/types'
import { tx, type Db } from './index'
import { TRACK_COLUMNS, rowToTrack, upsertTrack, type TrackRow } from './tracks'

interface PlaylistRow {
  id: number
  name: string
  created_at: number
  track_count: number
  art_url: string | null
}

const SUMMARY_SQL = `
  SELECT p.id, p.name, p.created_at,
    (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count,
    (SELECT t.art_url FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = p.id ORDER BY pt.position LIMIT 1) AS art_url
  FROM playlists p`

const toSummary = (r: PlaylistRow): LocalPlaylist => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at,
  trackCount: r.track_count,
  artUrl: r.art_url ?? undefined
})

export function listPlaylists(db: Db): LocalPlaylist[] {
  return (db.prepare(`${SUMMARY_SQL} ORDER BY p.updated_at DESC`).all() as unknown as PlaylistRow[]).map(
    toSummary
  )
}

export function getPlaylist(db: Db, id: number): LocalPlaylistDetail {
  const row = db.prepare(`${SUMMARY_SQL} WHERE p.id = ?`).get(id) as PlaylistRow | undefined
  if (!row) throw new Error(`Playlist ${id} not found`)
  const tracks = db
    .prepare(
      `SELECT ${TRACK_COLUMNS} FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ? ORDER BY pt.position`
    )
    .all(id) as unknown as TrackRow[]
  return { ...toSummary(row), tracks: tracks.map(rowToTrack) }
}

export function createPlaylist(db: Db, name: string, tracks: Track[] = [], sourceUrl?: string): LocalPlaylist {
  return tx(db, () => {
    const now = Date.now()
    const res = db
      .prepare('INSERT INTO playlists (name, source_url, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(name.trim() || 'Untitled playlist', sourceUrl ?? null, now, now)
    const id = Number(res.lastInsertRowid)
    appendTracks(db, id, tracks)
    return toSummary(db.prepare(`${SUMMARY_SQL} WHERE p.id = ?`).get(id) as unknown as PlaylistRow)
  })
}

export function renamePlaylist(db: Db, id: number, name: string): void {
  db.prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?').run(name.trim(), Date.now(), id)
}

export function deletePlaylist(db: Db, id: number): void {
  tx(db, () => {
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(id)
    db.prepare('DELETE FROM playlists WHERE id = ?').run(id)
  })
}

function appendTracks(db: Db, id: number, tracks: Track[]): void {
  const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM playlist_tracks WHERE playlist_id = ?').get(
    id
  ) as { m: number }
  const insert = db.prepare(
    'INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)'
  )
  let pos = max.m + 1
  const now = Date.now()
  for (const t of tracks) {
    if (!t.id) continue
    upsertTrack(db, t)
    insert.run(id, t.id, pos++, now)
  }
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, id)
}

export function addTracks(db: Db, id: number, tracks: Track[]): void {
  tx(db, () => appendTracks(db, id, tracks))
}

/** Rewrites positions as 0..n-1 in the given entry order. */
function rewritePositions(db: Db, entryIds: number[]): void {
  const update = db.prepare('UPDATE playlist_tracks SET position = ? WHERE entry_id = ?')
  entryIds.forEach((entryId, i) => update.run(i, entryId))
}

function entryIds(db: Db, id: number): number[] {
  return (
    db
      .prepare('SELECT entry_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position')
      .all(id) as { entry_id: number }[]
  ).map((r) => r.entry_id)
}

export function removeTrack(db: Db, id: number, position: number): void {
  tx(db, () => {
    const ids = entryIds(db, id)
    const [removed] = ids.splice(position, 1)
    if (removed === undefined) return
    db.prepare('DELETE FROM playlist_tracks WHERE entry_id = ?').run(removed)
    rewritePositions(db, ids)
    db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), id)
  })
}

export function moveTrack(db: Db, id: number, from: number, to: number): void {
  tx(db, () => {
    const ids = entryIds(db, id)
    if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) return
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    rewritePositions(db, ids)
    db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), id)
  })
}
