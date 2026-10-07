import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { Track } from '@shared/types'
import { Art } from '../components/Art'
import { DownloadIcon, HeartFilledIcon, HeartIcon, PlayIcon, RadioIcon, ShuffleIcon, TrashIcon } from '../components/Icons'
import { HoldButton } from '../components/HoldButton'
import { Empty, QueryView } from '../components/States'
import { TrackList } from '../components/TrackList'
import { saveAsPlaylist, setAlbumLiked, startPlaylistRadio, startTrackRadio } from '../lib/actions'
import { plural, totalDuration } from '../lib/format'
import { api, errorMessage, invalidatePlaylists, useAlbum, useLikedAlbums, usePlaylist, useRemotePlaylist } from '../lib/queries'
import { player } from '../store/player'
import { toast } from '../store/toast'

function Header({
  kind,
  showKind = true,
  name,
  title,
  sub,
  artUrl,
  tracks,
  actions
}: {
  kind: string
  showKind?: boolean
  /** plain-text title for the pinned bar */
  name: string
  title: ReactNode
  sub?: ReactNode
  artUrl?: string
  tracks: Track[]
  actions?: ReactNode
}) {
  // Once the big header scrolls out of view, a compact copy stays pinned to the top.
  const hero = useRef<HTMLElement>(null)
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    const el = hero.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top < 0), {
      root: document.getElementById('main'),
      // pin a little before the play buttons leave, so there's never a moment without them
      rootMargin: '-120px 0px 0px 0px'
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <>
    <div className="hero-bar-wrap">
      <div className="hero-bar" data-shown={pinned ? '' : undefined} inert={!pinned} aria-hidden={!pinned}>
        <Art src={artUrl} size={40} />
        <span className="hero-bar-title truncate">{name}</span>
        <button className="btn btn-primary btn-sm" onClick={() => player.playList(tracks, 0, { shuffle: false })} disabled={!tracks.length}>
          <PlayIcon size={14} /> Play
        </button>
        <button className="btn btn-sm" onClick={() => player.playList(tracks, 0, { shuffle: true })} disabled={!tracks.length}>
          <ShuffleIcon size={14} /> Shuffle
        </button>
      </div>
    </div>
    <section ref={hero} className="tile hero" aria-label={kind}>
      <Art src={artUrl} size={220} />
      <div className="min-w-0">
        {showKind && <span className="eyebrow muted">{kind}</span>}
        <div className="hero-title">{title}</div>
        <p className="tile-sub">
          {sub}
          {sub ? ' · ' : ''}
          {plural(tracks.length, 'song')}, {totalDuration(tracks)}
        </p>
        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <button className="btn btn-primary" onClick={() => player.playList(tracks, 0, { shuffle: false })} disabled={!tracks.length}>
            <PlayIcon size={16} /> Play
          </button>
          <button className="btn" onClick={() => player.playList(tracks, 0, { shuffle: true })} disabled={!tracks.length}>
            <ShuffleIcon size={16} /> Shuffle
          </button>
          {actions}
        </div>
      </div>
    </section>
    </>
  )
}

export function Album() {
  const { id = '' } = useParams()
  const q = useAlbum(id)
  const likedAlbums = useLikedAlbums()
  const liked = !!likedAlbums.data?.some((a) => a.id === id)
  return (
    <div className="page">
      <QueryView query={q}>
        {(a) => (
          <>
            <Header
              kind={a.subtitle ?? 'Album'}
              name={a.title}
              title={<h1 className="hero-title m-0">{a.title}</h1>}
              sub={a.artistId ? <Link to={`/artist/${a.artistId}`}>{a.artist}</Link> : a.artist}
              artUrl={a.artUrl}
              tracks={a.tracks}
              actions={
                <>
                  <button
                    className="btn"
                    aria-pressed={liked}
                    onClick={() =>
                      void setAlbumLiked(
                        { id, title: a.title, artist: a.artist ?? '', year: a.subtitle?.match(/\b(19|20)\d{2}\b/)?.[0], artUrl: a.artUrl },
                        !liked
                      )
                    }
                  >
                    {liked ? <HeartFilledIcon size={16} /> : <HeartIcon size={16} />} {liked ? 'Liked' : 'Like'}
                  </button>
                  <button className="btn" onClick={() => void saveAsPlaylist(a.title, a.tracks)}>
                    <DownloadIcon size={16} /> Save as playlist
                  </button>
                  {a.tracks[0] && (
                    <button className="btn" onClick={() => void startTrackRadio(a.tracks[0])}>
                      <RadioIcon size={16} /> Radio
                    </button>
                  )}
                </>
              }
            />
            <section className="section">
              <TrackList label={`${a.title} tracks`} tracks={a.tracks} numbered showAlbum={false} linkTitles={false} />
            </section>
          </>
        )}
      </QueryView>
    </div>
  )
}

export function RemotePlaylist() {
  const { id = '' } = useParams()
  const q = useRemotePlaylist(id)
  return (
    <div className="page">
      <QueryView query={q}>
        {(p) => (
          <>
            <Header
              kind="Playlist"
              name={p.title}
              title={<h1 className="hero-title m-0">{p.title}</h1>}
              sub={p.subtitle ?? p.artist}
              artUrl={p.artUrl}
              tracks={p.tracks}
              actions={
                <button className="btn" onClick={() => void saveAsPlaylist(p.title, p.tracks)}>
                  <DownloadIcon size={16} /> Save to Playlists
                </button>
              }
            />
            <section className="section">
              <TrackList label={`${p.title} tracks`} tracks={p.tracks} />
            </section>
          </>
        )}
      </QueryView>
    </div>
  )
}

export function Playlist() {
  const id = Number(useParams().id)
  const q = usePlaylist(id)
  const navigate = useNavigate()
  const [name, setName] = useState<string | null>(null)

  const mutate = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      toast.error(errorMessage(err))
    }
    invalidatePlaylists(id)
  }

  const rename = (current: string) => {
    const next = name?.trim()
    setName(null)
    if (next && next !== current) void mutate(() => api.library.renamePlaylist(id, next))
  }

  return (
    <div className="page">
      <QueryView query={q}>
        {(p) => (
          <>
            <Header
              kind="Playlist"
              showKind={false}
              name={name ?? p.name}
              title={
                <>
                  <label htmlFor="pl-name" className="sr-only">
                    Playlist name
                  </label>
                  <input
                    id="pl-name"
                    className="hero-title"
                    style={{ background: 'transparent', border: 0, padding: 0, width: '100%', color: 'inherit', font: 'inherit' }}
                    value={name ?? p.name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => rename(p.name)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                </>
              }
              artUrl={p.artUrl}
              tracks={p.tracks}
              actions={
                <>
                  <button className="btn" onClick={() => void startPlaylistRadio(p)} disabled={!p.tracks.length}>
                    <RadioIcon size={16} /> Radio
                  </button>
                  <HoldButton
                    className="btn btn-danger"
                    label={`Delete ${p.name}`}
                    onConfirm={async () => {
                      await mutate(() => api.library.deletePlaylist(id))
                      navigate('/playlists')
                    }}
                  >
                    <TrashIcon size={16} /> Hold to delete
                  </HoldButton>
                </>
              }
            />
            <section className="section">
              {p.tracks.length === 0 ? (
                <Empty>This playlist is empty. Add songs from any song’s ⋯ menu.</Empty>
              ) : (
                <>
                  <p className="tile-sub" style={{ marginBottom: 'var(--space-2)' }}>
                    Drag to reorder, or focus a song and press Alt+↑/↓.
                  </p>
                  <TrackList
                    label={`${p.name} tracks`}
                    tracks={p.tracks}
                    onMove={(from, to) => void mutate(() => api.library.moveTrack(id, from, to))}
                    onRemove={(i) => void mutate(() => api.library.removeTrack(id, i))}
                  />
                </>
              )}
            </section>
          </>
        )}
      </QueryView>
    </div>
  )
}
