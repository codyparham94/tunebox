import type { AlbumSummary } from '@shared/types'
import type { Db } from './index'

interface AlbumRow {
  id: string
  title: string
  artist: string
  year: string | null
  art_url: string | null
}

/** Liked albums, newest first. */
export function likedAlbums(db: Db): AlbumSummary[] {
  const rows = db.prepare('SELECT id, title, artist, year, art_url FROM liked_albums ORDER BY liked_at DESC, rowid DESC').all() as unknown as AlbumRow[]
  return rows.map((r) => ({ id: r.id, title: r.title, artist: r.artist, year: r.year ?? undefined, artUrl: r.art_url ?? undefined }))
}

export function setAlbumLiked(db: Db, album: AlbumSummary, liked: boolean): void {
  if (!album.id) throw new Error('This album can’t be liked: it has no id.')
  if (!liked) {
    db.prepare('DELETE FROM liked_albums WHERE id = ?').run(album.id)
    return
  }
  // Re-liking keeps the original date so the album doesn't jump to the top.
  db.prepare(
    `INSERT INTO liked_albums (id, title, artist, year, art_url, liked_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, artist = excluded.artist, year = excluded.year, art_url = excluded.art_url`
  ).run(album.id, album.title, album.artist, album.year ?? null, album.artUrl ?? null, Date.now())
}
