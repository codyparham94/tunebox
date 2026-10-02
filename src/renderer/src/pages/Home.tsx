import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Art } from '../components/Art'
import {
  CompassIcon,
  Equalizer,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  PrevIcon,
  RadioIcon,
  ThumbDownIcon,
  ThumbUpIcon
} from '../components/Icons'
import { Empty, ErrorState, Loading } from '../components/States'
import { startArtistRadio } from '../lib/actions'
import { plural, timeAgo } from '../lib/format'
import { useTrackNav } from '../lib/nav'
import { api, errorMessage, invalidatePlaylists, useHistory, usePlaylists, useStations } from '../lib/queries'
import { currentTrack, player, usePlayer } from '../store/player'
import { toast } from '../store/toast'

export function Home() {
  return (
    <div className="page">
      <h1 className="page-title">{greeting()}</h1>
      {/* Recently played runs down the left; the other tiles fill the three columns beside it. */}
      <div className="bento home-bento">
        <RecentTile />
        <NowPlayingTile />
        <StationsTile />
        <QuickRadioTile />
        <PlaylistsRow />
      </div>
    </div>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function NowPlayingTile() {
  const s = usePlayer()
  const t = currentTrack(s)
  const history = useHistory(1)
  const resume = !t ? history.data?.[0] : undefined
  const shown = t ?? resume?.track
  const thumb = t?.id ? s.thumbs[t.id] : undefined
  const nav = useTrackNav()

  return (
    <section className="tile tile-primary span-3x1" aria-labelledby="np-title" style={{ padding: 'var(--space-4)' }}>
      <div className="flex h-full items-center gap-5">
        <Art src={shown?.artUrl} size={180} className="shadow-lg" />
        <div className="min-w-0 flex-1 grid grid-cols-1 gap-1">
          <span className="eyebrow truncate">
            {t ? (s.station ? s.station.name : 'Now playing') : resume ? 'Pick up where you left off' : 'Welcome'}
          </span>
          <h2 id="np-title" className="now-title">
            {shown ? (
              <button className="now-link" title={`${shown.title}: go to album`} onClick={() => void nav.album(shown)}>
                {shown.title}
              </button>
            ) : (
              'Your music, your radio'
            )}
          </h2>
          <p className={`tile-sub${shown ? ' truncate' : ''}`}>
            {shown ? (
              <button className="now-link" title={`Go to ${shown.artist}`} onClick={() => void nav.artist(shown)}>
                {shown.artist}
              </button>
            ) : (
              'Search for a song, or start a station and let Tunebox learn what you like.'
            )}
            {resume && ` · ${timeAgo(resume.playedAt)}`}
          </p>
          {t?.reason && s.station && <p className="tile-sub truncate">Why this song? {t.reason}</p>}
          <div className="row mt-2" style={{ gap: 'var(--space-1)' }}>
            {t ? (
              <>
                <button className="icon-btn on-primary" aria-label="Previous" onClick={player.prev}>
                  <PrevIcon />
                </button>
                <button className="icon-btn play-btn" aria-label={s.playing ? 'Pause' : 'Play'} onClick={player.toggle}>
                  {s.playing ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button className="icon-btn on-primary" aria-label="Next" onClick={player.next}>
                  <NextIcon />
                </button>
                <button
                  className="icon-btn on-primary"
                  aria-label="Thumbs down (skips)"
                  aria-pressed={thumb === -1}
                  onClick={() => player.thumb(-1)}
                  style={{ marginLeft: 'var(--space-2)' }}
                >
                  <ThumbDownIcon size={18} />
                </button>
                <button className="icon-btn on-primary" aria-label="Thumbs up" aria-pressed={thumb === 1} onClick={() => player.thumb(1)}>
                  <ThumbUpIcon size={18} />
                </button>
              </>
            ) : resume ? (
              <button className="btn btn-dark" onClick={() => player.playList([resume.track])}>
                <PlayIcon size={16} /> Resume
              </button>
            ) : (
              <Link to="/search" className="btn btn-dark">
                Find something to play
              </Link>
            )}
          </div>
        </div>
        {t && <UpNext />}
      </div>
    </section>
  )
}

/** The next few songs in the queue, beside the current one. */
function UpNext() {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const refilling = usePlayer((s) => s.refilling)
  const upcoming = queue.slice(index + 1, index + 4)
  return (
    <div className="up-next" aria-label="Up next">
      <span className="eyebrow">Up next</span>
      {upcoming.length === 0 ? (
        <p className="tile-sub">{refilling ? 'Finding more songs…' : 'Nothing queued'}</p>
      ) : (
        <ol className="list-none m-0 p-0 grid gap-1">
          {upcoming.map((item, i) => (
            <li key={item.qid}>
              <button className="up-next-item" onClick={() => player.jumpTo(index + 1 + i)} aria-label={`Play ${item.title} by ${item.artist}`}>
                <Art src={item.artUrl} size={36} />
                <span className="min-w-0 grid">
                  <span className="truncate" style={{ fontWeight: 600 }}>
                    {item.title}
                  </span>
                  <span className="truncate up-next-artist">{item.artist}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function StationsTile() {
  const stations = useStations()
  const active = usePlayer((s) => s.station?.id)
  return (
    <section className="tile span-2x1" aria-labelledby="st-title">
      <div className="section-head">
        <h2 id="st-title" className="tile-title" style={{ margin: 0 }}>
          Your stations
        </h2>
        <Link to="/radio" className="btn btn-sm">
          All stations
        </Link>
      </div>
      {stations.isPending ? (
        <Loading />
      ) : stations.isError ? (
        <ErrorState error={stations.error} retry={() => void stations.refetch()} />
      ) : stations.data.length === 0 ? (
        <Empty>Start a station from any song, artist or mood and it learns from your 👍 and 👎.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {stations.data.slice(0, 4).map((st) => (
            <button
              key={st.id}
              className="card"
              style={{ flexDirection: 'row', alignItems: 'center', padding: 'var(--space-2)' }}
              onClick={() => player.playStation(st)}
              aria-label={`Play ${st.name}`}
            >
              <Art src={st.artUrl} size={44} />
              <span className="min-w-0">
                <span className="card-title truncate block">{st.name}</span>
                <span className="card-sub">{st.id === active ? 'Playing' : st.seedType}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function QuickRadioTile() {
  const [artist, setArtist] = useState('')
  return (
    <section className="tile tile-secondary" aria-labelledby="qr-title">
      <RadioIcon size={28} />
      <h2 id="qr-title" className="tile-title" style={{ marginTop: 'var(--space-3)' }}>
        Start radio from…
      </h2>
      <form
        className="grid gap-2 mt-auto"
        onSubmit={(e) => {
          e.preventDefault()
          if (artist.trim()) void startArtistRadio(artist)
          setArtist('')
        }}
      >
        <label htmlFor="qr-artist" className="sr-only">
          Artist name
        </label>
        <input id="qr-artist" className="input" placeholder="An artist you love" value={artist} onChange={(e) => setArtist(e.target.value)} />
        <button className="btn btn-dark" disabled={!artist.trim()}>
          Start station
        </button>
      </form>
    </section>
  )
}

function RecentTile() {
  const history = useHistory(25)
  const current = usePlayer((s) => currentTrack(s)?.id)
  const playing = usePlayer((s) => s.playing)
  return (
    <section className="tile span-1x3 recent-tile" aria-labelledby="rp-title">
      <h2 id="rp-title" className="tile-title">
        Recently played
      </h2>
      {history.isPending ? (
        <Loading rows={6} />
      ) : history.isError ? (
        <ErrorState error={history.error} />
      ) : history.data.length === 0 ? (
        <Empty>Songs you listen to will show up here.</Empty>
      ) : (
        <ol className="recent-list" aria-label="Recently played songs">
          {history.data.map((h, i) => {
            const isCurrent = h.track.id === current
            return (
              <li key={h.track.id}>
                <button
                  className={`recent-item${isCurrent ? ' active' : ''}`}
                  onClick={() => player.playList(history.data.map((x) => x.track), i)}
                  aria-label={`Play ${h.track.title} by ${h.track.artist}`}
                  aria-current={isCurrent || undefined}
                >
                  <span className="relative flex-none">
                    <Art src={h.track.artUrl} size={40} />
                    <span className="recent-play" aria-hidden="true">
                      {isCurrent ? <Equalizer paused={!playing} /> : <PlayIcon size={14} />}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 grid">
                    <span className="truncate recent-title">{h.track.title}</span>
                    <span className="truncate card-sub">{h.track.artist}</span>
                  </span>
                  <span className="card-sub flex-none">{timeAgo(h.playedAt)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/** Playlists beside a Discover tile. With no playlists, a small suggestion takes their place. */
function PlaylistsRow() {
  const playlists = usePlaylists()
  if (playlists.isPending) return <section className="tile span-2x1" aria-busy="true" />
  const has = !!playlists.data?.length
  return (
    <>
      {has ? <PlaylistsTile /> : <NewPlaylistTile />}
      <DiscoverTile wide={!has} />
    </>
  )
}

function PlaylistsTile() {
  const playlists = usePlaylists()
  return (
    <section className="tile span-2x1" aria-labelledby="pl-title">
      <div className="section-head">
        <h2 id="pl-title" className="tile-title" style={{ margin: 0 }}>
          Your playlists
        </h2>
        <Link to="/library" className="btn btn-sm">
          Library
        </Link>
      </div>
      {playlists.isError ? (
        <ErrorState error={playlists.error} />
      ) : (
        <ul className="playlist-strip list-none m-0 p-0">
          {(playlists.data ?? []).slice(0, 6).map((pl) => (
            <li key={pl.id}>
              <Link to={`/playlist/${pl.id}`} className="menu-item" style={{ textDecoration: 'none', minHeight: 44 }}>
                <Art src={pl.artUrl} size={32} />
                <span className="min-w-0">
                  <span className="truncate block" style={{ fontWeight: 600 }}>
                    {pl.name}
                  </span>
                  <span className="card-sub">{plural(pl.trackCount, 'song')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NewPlaylistTile() {
  const navigate = useNavigate()
  const create = async () => {
    try {
      const pl = await api.library.createPlaylist('New playlist')
      invalidatePlaylists()
      navigate(`/playlist/${pl.id}`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }
  return (
    <section className="tile" aria-labelledby="np-suggest">
      <PlusIcon size={28} />
      <h2 id="np-suggest" className="tile-title" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
        Make a playlist
      </h2>
      <p className="tile-sub">Collect songs you love, or import one from YouTube in Library.</p>
      <button className="btn btn-primary mt-auto" onClick={() => void create()}>
        <PlusIcon size={14} /> New playlist
      </button>
    </section>
  )
}

function DiscoverTile({ wide }: { wide: boolean }) {
  const feed = useQuery({ queryKey: ['discover', 'feed'], queryFn: () => api.discover.feed(false), staleTime: 60_000 })
  const mix = feed.data?.mix ?? []
  const arts = mix.map((t) => t.artUrl).filter(Boolean).slice(0, wide ? 6 : 3)
  return (
    <Link to="/discover" className={`tile tile-secondary${wide ? ' span-2x1' : ''}`} style={{ textDecoration: 'none' }}>
      <CompassIcon size={28} />
      <h2 className="tile-title" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
        Discover
      </h2>
      <p className="tile-sub discover-tile-sub">
        {mix.length ? `${plural(mix.length, 'new song')} picked for you` : 'New music based on what you like'}
      </p>
      {arts.length > 0 && (
        <div className="discover-stack mt-auto" aria-hidden="true">
          {arts.map((a, i) => (
            <Art key={i} src={a} size={44} />
          ))}
        </div>
      )}
    </Link>
  )
}
