import { useState } from 'react'
import { Link } from 'react-router'
import { Art } from '../components/Art'
import { NextIcon, PauseIcon, PlayIcon, PrevIcon, RadioIcon, ThumbDownIcon, ThumbUpIcon } from '../components/Icons'
import { Empty, ErrorState, Loading } from '../components/States'
import { TrackList } from '../components/TrackList'
import { startArtistRadio, startTagRadio } from '../lib/actions'
import { plural, timeAgo } from '../lib/format'
import { errorMessage, useCharts, useHistory, usePlaylists, useStations, useTags } from '../lib/queries'
import { currentTrack, player, usePlayer } from '../store/player'
import { toast } from '../store/toast'

export function Home() {
  return (
    <div className="page">
      <h1 className="page-title">{greeting()}</h1>
      <div className="bento">
        <NowPlayingTile />
        <StationsTile />
        <ChartsTile />
        <QuickRadioTile />
        <RecentTile />
        <PlaylistsTile />
        <MoodsTile />
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

  return (
    <section className="tile tile-primary span-2x1" aria-labelledby="np-title" style={{ padding: 'var(--space-4)' }}>
      <div className="flex h-full items-center gap-5">
        <Art src={shown?.artUrl} size={180} className="shadow-lg" />
        <div className="min-w-0 flex-1 grid grid-cols-1 gap-1">
          <span className="eyebrow truncate">
            {t ? (s.station ? s.station.name : 'Now playing') : resume ? 'Pick up where you left off' : 'Welcome'}
          </span>
          <h2 id="np-title" className="now-title" title={shown?.title}>
            {shown?.title ?? 'Your music, your radio'}
          </h2>
          <p className={`tile-sub${shown ? ' truncate' : ''}`}>
            {shown ? shown.artist : 'Search for a song, or start a station and let Tunebox learn what you like.'}
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
      </div>
    </section>
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

function ChartsTile() {
  const charts = useCharts()
  return (
    <section className="tile span-1x2" aria-labelledby="ch-title">
      <div className="section-head">
        <h2 id="ch-title" className="tile-title" style={{ margin: 0 }}>
          Top charts
        </h2>
        {charts.data && charts.data.length > 0 && (
          <button className="btn btn-sm" onClick={() => player.playList(charts.data!.slice(0, 30))}>
            <PlayIcon size={12} /> Play
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ margin: '0 calc(var(--space-3) * -1)' }}>
        {charts.isPending ? (
          <Loading rows={6} />
        ) : charts.isError ? (
          <ErrorState error={charts.error} retry={() => void charts.refetch()} />
        ) : charts.data.length === 0 ? (
          <Empty>No chart data right now.</Empty>
        ) : (
          <TrackList label="Top charts" tracks={charts.data.slice(0, 12)} compact />
        )}
      </div>
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
  const history = useHistory(12)
  return (
    <section className="tile span-2x1" aria-labelledby="rp-title">
      <h2 id="rp-title" className="tile-title">
        Recently played
      </h2>
      {history.isPending ? (
        <Loading />
      ) : history.isError ? (
        <ErrorState error={history.error} />
      ) : history.data.length === 0 ? (
        <Empty>Songs you listen to will show up here.</Empty>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {history.data.map((h, i) => (
            <button
              key={h.track.id}
              className="card"
              style={{ width: 120, flex: 'none', padding: 'var(--space-2)' }}
              onClick={() => player.playList(history.data.map((x) => x.track), i)}
              aria-label={`Play ${h.track.title} by ${h.track.artist}`}
            >
              <Art src={h.track.artUrl} className="w-full" />
              <span className="card-title truncate">{h.track.title}</span>
              <span className="card-sub truncate">{h.track.artist}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function PlaylistsTile() {
  const playlists = usePlaylists()
  return (
    <section className="tile" aria-labelledby="pl-title">
      <div className="section-head">
        <h2 id="pl-title" className="tile-title" style={{ margin: 0 }}>
          Your playlists
        </h2>
        <Link to="/library" className="btn btn-sm">
          Library
        </Link>
      </div>
      {playlists.isPending ? (
        <Loading />
      ) : playlists.isError ? (
        <ErrorState error={playlists.error} />
      ) : playlists.data.length === 0 ? (
        <Empty>Make one from any song’s ⋯ menu, or import from YouTube in Library.</Empty>
      ) : (
        <ul className="grid gap-1 list-none m-0 p-0">
          {playlists.data.slice(0, 4).map((pl) => (
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

function MoodsTile() {
  const tags = useTags()
  return (
    <section className="tile span-2x1" aria-labelledby="mg-title">
      <h2 id="mg-title" className="tile-title">
        Moods &amp; genres
      </h2>
      <p className="tile-sub" style={{ marginBottom: 'var(--space-3)' }}>
        Pick one to start a station.
      </p>
      {tags.isPending ? (
        <Loading />
      ) : tags.isError ? (
        <ErrorState error={tags.error} />
      ) : (
        <div className="chips">
          {tags.data.slice(0, 18).map((tag) => (
            <button
              key={tag}
              className="chip"
              onClick={() => startTagRadio(tag).catch((err) => toast.error(errorMessage(err)))}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

