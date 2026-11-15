import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { AlbumSummary, ArtistSummary, RemotePlaylistSummary } from '@shared/types'
import { api, errorMessage } from '../lib/queries'
import { timeAgo } from '../lib/format'
import { toast } from '../store/toast'
import { Art } from './Art'

export function ArtistCard({ artist }: { artist: ArtistSummary }) {
  return (
    <Link to={`/artist/${artist.id}`} className="card" style={{ alignItems: 'center', textAlign: 'center' }}>
      <Art src={artist.artUrl} round className="w-full" />
      <span className="card-title truncate w-full">{artist.name}</span>
      {artist.subtitle && <span className="card-sub truncate w-full">{artist.subtitle}</span>}
    </Link>
  )
}

export function AlbumCard({ album }: { album: AlbumSummary }) {
  return (
    <Link to={`/album/${album.id}`} className="card">
      <Art src={album.artUrl} className="w-full" />
      <span className="card-title truncate">{album.title}</span>
      <span className="card-sub truncate">{[album.year, album.artist].filter(Boolean).join(' · ')}</span>
    </Link>
  )
}

export function RemotePlaylistCard({ playlist }: { playlist: RemotePlaylistSummary }) {
  return (
    <Link to={`/remote-playlist/${playlist.id}`} className="card">
      <Art src={playlist.artUrl} className="w-full" />
      <span className="card-title truncate">{playlist.title}</span>
      {playlist.author && <span className="card-sub truncate">{playlist.author}</span>}
    </Link>
  )
}

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="card-grid">{children}</div>
}

/** Tracks which card is loading and toasts a failed lookup. */
export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key)
    try {
      await task()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}

/** An album named by a chart or a critic: find it on YouTube Music on click, falling back to the artist. */
export function LookupAlbumCard(props: { title: string; artist: string; artUrl?: string; rank?: number; badge?: string; date?: number; reviewUrl?: string }) {
  const { title, artist, artUrl, rank, badge, date, reviewUrl } = props
  const navigate = useNavigate()
  const { busy, run } = useBusy()
  const key = `${title}|${artist}`
  const open = () =>
    run(key, async () => {
      const { albumId, artistId } = await api.catalog.findAlbum(title, artist)
      if (albumId) navigate(`/album/${albumId}`)
      else if (artistId) {
        navigate(`/artist/${artistId}`)
        toast.info(`Couldn’t find “${title}” on YouTube Music, so here’s ${artist}.`)
      } else toast.error(`Couldn’t find “${title}” on YouTube Music.`)
    })
  const meta = [badge, date ? timeAgo(date) : undefined].filter(Boolean).join(' · ')
  return (
    <div className="relative grid">
      <button className="card" onClick={open} aria-busy={busy === key}>
        <div className="relative">
          <Art src={artUrl} className="w-full" />
          {rank != null && <span className="rank-badge mono">{rank}</span>}
          {busy === key && (
            <span className="absolute inset-0 grid place-items-center" style={{ background: 'var(--overlay)' }}>
              <span className="spinner" />
            </span>
          )}
        </div>
        <span className="card-title truncate">{title}</span>
        <span className="card-sub truncate">{artist}</span>
        {meta && <span className="card-sub truncate">{meta}</span>}
      </button>
      {reviewUrl && (
        <a href={reviewUrl} target="_blank" rel="noreferrer" className="card-sub card-review">
          Read review
        </a>
      )}
    </div>
  )
}
