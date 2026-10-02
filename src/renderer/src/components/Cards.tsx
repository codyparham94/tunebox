import { Link } from 'react-router'
import type { AlbumSummary, ArtistSummary, RemotePlaylistSummary } from '@shared/types'
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
