import { Link } from 'react-router'
import { Art } from '../components/Art'
import { HeartIcon, NextIcon, PauseIcon, PlayIcon, PlusIcon, PrevIcon, ThumbDownIcon, ThumbUpIcon } from '../components/Icons'
import { Empty, ErrorState, Loading } from '../components/States'
import { TrackList } from '../components/TrackList'
import { plural, timeAgo } from '../lib/format'
import { useSwapIn } from '../lib/motion'
import { useTrackNav } from '../lib/nav'
import { useHistory, useLikedAlbums, usePlaylists } from '../lib/queries'
import { currentTrack, player, usePlayer } from '../store/player'

export function Home() {
  return (
    <div className="page">
      <h1 className="page-title">{greeting()}</h1>
      {/* Your collection down the left; what's playing and what you just played on the right. */}
      <div className="home-layout">
        <div className="stack home-side">
          <LikedAlbumsTile />
          <PlaylistsTile />
        </div>
        <div className="stack home-main">
          <NowPlayingTile />
          <RecentTile />
        </div>
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
  const shownKey = t ? `q${t.qid}` : resume ? `r${resume.track.id}` : 'none'
  const swap = useSwapIn(shownKey) ? ' swap-in' : ''
  const swapIcon = useSwapIn(s.playing) ? ' icon-swap' : ''

  return (
    <section className="tile tile-primary now-playing" aria-labelledby="np-title" style={{ padding: 'var(--space-4)' }}>
      <div className="flex h-full items-center gap-5">
        <Art key={`art-${shownKey}`} src={shown?.artUrl} size={180} className={`shadow-lg${swap}`} />
        <div className="min-w-0 flex-1 grid grid-cols-1 gap-1">
          <span className="eyebrow truncate">
            {t ? (s.station ? s.station.name : 'Now playing') : resume ? 'Pick up where you left off' : 'Welcome'}
          </span>
          <h2 key={`title-${shownKey}`} id="np-title" className={`now-title${swap}`} data-long={(shown?.title.length ?? 0) > 40 || undefined}>
            {shown ? (
              <button className="now-link" title={`${shown.title}: go to album`} onClick={() => void nav.album(shown)}>
                {shown.title}
              </button>
            ) : (
              'Your music, your radio'
            )}
          </h2>
          <p key={`artist-${shownKey}`} className={`tile-sub${shown ? ' truncate' : ''}${swap}`}>
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
                  <span key={String(s.playing)} className={`icon-slot${swapIcon}`}>
                    {s.playing ? <PauseIcon /> : <PlayIcon />}
                  </span>
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
  const upcoming = queue.slice(index + 1, index + 6)
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

/** Recently played as a track list, the same rows as Discover's mix. */
function RecentTile() {
  const history = useHistory(20)
  return (
    <section className="tile" aria-labelledby="rp-title">
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
        <TrackList label="Recently played" tracks={history.data.map((h) => h.track)} />
      )}
    </section>
  )
}

function LikedAlbumsTile() {
  const albums = useLikedAlbums()
  const list = albums.data ?? []
  return (
    <section className="tile" aria-labelledby="la-title">
      <div className="section-head">
        <h2 id="la-title" className="tile-title" style={{ margin: 0 }}>
          Liked albums
        </h2>
        {list.length > 0 && (
          <Link to="/liked" className="btn btn-sm">
            All
          </Link>
        )}
      </div>
      {albums.isPending ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="tile-sub">
          <HeartIcon size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Like an album from its page and it shows up here.
        </p>
      ) : (
        <ul className="list-none m-0 p-0 grid gap-1 side-list">
          {list.slice(0, 6).map((a) => (
            <li key={a.id}>
              <Link to={`/album/${a.id}`} className="recent-item" style={{ textDecoration: 'none' }}>
                <Art src={a.artUrl} size={44} />
                <span className="min-w-0 grid">
                  <span className="truncate recent-title" title={a.title}>
                    {a.title}
                  </span>
                  <span className="truncate card-sub">{[a.artist, a.year].filter(Boolean).join(' · ')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PlaylistsTile() {
  const playlists = usePlaylists()
  const list = playlists.data ?? []
  return (
    <section className="tile" aria-labelledby="pl-title">
      <div className="section-head">
        <h2 id="pl-title" className="tile-title" style={{ margin: 0 }}>
          Playlists
        </h2>
        <Link to="/playlists" className="btn btn-sm">
          {list.length ? 'All' : <><PlusIcon size={14} /> New</>}
        </Link>
      </div>
      {playlists.isPending ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="tile-sub">Make one, or import one from YouTube, Spotify, Apple Music or Deezer.</p>
      ) : (
        <ul className="list-none m-0 p-0 grid gap-1 side-list">
          {list.slice(0, 8).map((pl) => (
            <li key={pl.id}>
              <Link to={`/playlist/${pl.id}`} className="recent-item" style={{ textDecoration: 'none' }}>
                <Art src={pl.artUrl} size={44} />
                <span className="min-w-0 grid">
                  <span className="truncate recent-title" title={pl.name}>
                    {pl.name}
                  </span>
                  <span className="truncate card-sub">{plural(pl.trackCount, 'song')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
