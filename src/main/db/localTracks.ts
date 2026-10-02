import { AUDIO_SCHEME, LOCAL_PREFIX } from '@shared/api'
import type { Track } from '@shared/types'
import { tx, type Db } from './index'

export interface LocalTrackRow {
  id: number
  path: string
  mtime: number
  size: number
  title: string
  artist: string
  album: string | null
  track_no: number | null
  disc_no: number | null
  year: number | null
  duration: number
}

export type LocalTrackInput = Omit<LocalTrackRow, 'id'>

export const localTrackId = (rowId: number): string => `${LOCAL_PREFIX}${rowId}`
export const localArtUrl = (rowId: number): string => `${AUDIO_SCHEME}://localart/${rowId}`

export function toTrack(r: LocalTrackRow): Track {
  return {
    id: localTrackId(r.id),
    title: r.title,
    artist: r.artist,
    album: r.album ?? undefined,
    duration: Math.round(r.duration),
    artUrl: localArtUrl(r.id)
  }
}

export function listLocal(db: Db): Track[] {
  return (
    db
      .prepare(
        `SELECT * FROM local_tracks
         ORDER BY artist COLLATE NOCASE, album COLLATE NOCASE, disc_no, track_no, title COLLATE NOCASE`
      )
      .all() as unknown as LocalTrackRow[]
  ).map(toTrack)
}

export function getLocal(db: Db, rowId: number): LocalTrackRow | undefined {
  return db.prepare('SELECT * FROM local_tracks WHERE id = ?').get(rowId) as LocalTrackRow | undefined
}

/** path → change-detection info, for incremental rescans. */
export function localIndex(db: Db): Map<string, { id: number; mtime: number; size: number }> {
  const rows = db.prepare('SELECT id, path, mtime, size FROM local_tracks').all() as {
    id: number
    path: string
    mtime: number
    size: number
  }[]
  return new Map(rows.map((r) => [r.path, { id: r.id, mtime: r.mtime, size: r.size }]))
}

export function upsertLocal(db: Db, rows: LocalTrackInput[]): void {
  const stmt = db.prepare(
    `INSERT INTO local_tracks (path, mtime, size, title, artist, album, track_no, disc_no, year, duration, scanned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       mtime = excluded.mtime, size = excluded.size, title = excluded.title, artist = excluded.artist,
       album = excluded.album, track_no = excluded.track_no, disc_no = excluded.disc_no,
       year = excluded.year, duration = excluded.duration, scanned_at = excluded.scanned_at`
  )
  const now = Date.now()
  tx(db, () => {
    for (const r of rows) {
      stmt.run(r.path, r.mtime, r.size, r.title, r.artist, r.album, r.track_no, r.disc_no, r.year, r.duration, now)
    }
  })
}

export function removeLocal(db: Db, paths: string[]): void {
  const stmt = db.prepare('DELETE FROM local_tracks WHERE path = ?')
  tx(db, () => {
    for (const p of paths) stmt.run(p)
  })
}

/** Switching folders starts the local library over. */
export function clearLocal(db: Db): void {
  db.exec('DELETE FROM local_tracks')
}
