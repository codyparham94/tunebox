import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ArtistSummary, DiscoverFeed, DiscoverShelf, DiscoverSignals } from '@shared/types'
import { Art } from '../components/Art'
import { Equalizer, PlayIcon, PlusIcon, RadioIcon, SearchIcon, ShuffleIcon, TrashIcon } from '../components/Icons'
import { Empty, ErrorState, Loading } from '../components/States'
import { TrackList } from '../components/TrackList'
import { saveAsPlaylist, startArtistRadio, startTagRadio, startTrackRadio } from '../lib/actions'
import { plural, timeAgo } from '../lib/format'
import { api, errorMessage, queryClient } from '../lib/queries'
import { currentTrack, player, usePlayer } from '../store/player'
import { toast } from '../store/toast'

const FEED_KEY = ['discover', 'feed'] as const
const SEARCHES_KEY = ['discover', 'searches'] as const

export function Discover() {
  const feed = useQuery({ queryKey: FEED_KEY, queryFn: () => api.discover.feed(false), staleTime: 60_000 })
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    try {
      queryClient.setQueryData(FEED_KEY, await api.discover.feed(true))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="page">
      <div className="section-head" style={{ marginBottom: 'var(--space-5)' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            Discover
          </h1>
          {feed.data && <p className="tile-sub">{summary(feed.data)}</p>}
        </div>
        {feed.data && hasSignals(feed.data.signals) && (
          <button className="btn" onClick={() => void refresh()} disabled={refreshing} aria-busy={refreshing}>
            {refreshing ? <span className="spinner" aria-hidden="true" /> : <ShuffleIcon size={14} />}
            {refreshing ? 'Finding new music…' : 'Refresh'}
          </button>
        )}
      </div>

      {feed.isPending ? (
        <div className="tile">
          <Loading label="Finding music you might like…" />
          <Loading rows={6} />
        </div>
      ) : feed.isError ? (
        <ErrorState error={feed.error} retry={() => void feed.refetch()} />
      ) : !hasSignals(feed.data.signals) ? (
        <ColdStart />
      ) : (
        <FeedView feed={feed.data} />
      )}
    </div>
  )
}

const hasSignals = (s: DiscoverSignals) => s.likes + s.playlistTracks + s.searches + s.plays > 0

function summary(feed: DiscoverFeed): string {
  const s = feed.signals
  const parts = [
    s.likes && plural(s.likes, 'like'),
    s.playlistTracks && `${plural(s.playlistTracks, 'playlist song')}`,
    s.searches && plural(s.searches, 'search'),
    s.plays && plural(s.plays, 'play')
  ].filter(Boolean)
  if (parts.length === 0) return 'Picks get better the more you listen.'
  return `Based on your ${parts.join(', ')} · updated ${timeAgo(feed.builtAt)}`
}

function ColdStart() {
  return (
    <section className="tile tile-primary" aria-labelledby="cold-title" style={{ padding: 'var(--space-6)' }}>
      <span className="eyebrow">Nothing to go on yet</span>
      <h2 id="cold-title" className="now-title" style={{ marginTop: 'var(--space-2)' }}>
        Discover learns from you
      </h2>
      <p className="tile-sub" style={{ maxWidth: 560, marginTop: 'var(--space-2)' }}>
        Search for artists you love, like songs with the heart, or build a playlist. Tunebox uses all of it to find music
        you haven’t heard yet.
      </p>
      <div className="row mt-4">
        <Link to="/search" className="btn btn-dark">
          <SearchIcon size={16} /> Search
        </Link>
        <Link to="/charts" className="btn btn-dark">
          Browse the charts
        </Link>
      </div>
    </section>
  )
}

function FeedView({ feed }: { feed: DiscoverFeed }) {
  const nothing = feed.mix.length === 0 && feed.shelves.length === 0 && feed.artists.length === 0
  return (
    <>
      {nothing ? (
        <Empty>
          Couldn’t find recommendations right now. Check your connection and press Refresh. A Last.fm API key in Settings
          also widens the picks.
        </Empty>
      ) : (
        <div className="charts-layout">
          <MixTile mix={feed.mix} />
          <div className="grid gap-4 content-start">
            {feed.artists.length > 0 && <ArtistsTile artists={feed.artists} />}
            {feed.tags.length > 0 && <TagsTile tags={feed.tags} />}
            <SearchesTile />
          </div>
        </div>
      )}
      {feed.shelves.map((s) => (
        <Shelf key={s.id} shelf={s} />
      ))}
    </>
  )
}

function MixTile({ mix }: { mix: DiscoverFeed['mix'] }) {
  return (
    <section className="tile" aria-labelledby="mix-title">
      <div className="section-head">
        <div className="flex items-center gap-3 min-w-0">
          <Collage arts={mix.slice(0, 4).map((t) => t.artUrl)} />
          <div className="min-w-0">
            <h2 id="mix-title" className="section-title">
              Your Discover Mix
            </h2>
            <p className="tile-sub">{plural(mix.length, 'song')} you haven’t played yet</p>
          </div>
        </div>
        <div className="row">
          <button className="btn btn-primary" disabled={!mix.length} onClick={() => player.playList(mix, 0, { shuffle: false })}>
            <PlayIcon size={14} /> Play
          </button>
          <button className="btn" disabled={!mix.length} onClick={() => player.playList(mix, 0, { shuffle: true })}>
            <ShuffleIcon size={14} /> Shuffle
          </button>
          <button
            className="btn"
            disabled={!mix.length}
            onClick={() => void saveAsPlaylist(`Discover Mix · ${new Date().toLocaleDateString()}`, mix)}
            title="Save this mix as a playlist"
          >
            <PlusIcon size={14} /> Save
          </button>
        </div>
      </div>
      {mix.length === 0 ? (
        <Empty>No new songs found this time. Try Refresh.</Empty>
      ) : (
        <TrackList label="Your Discover Mix" tracks={mix} />
      )}
    </section>
  )
}

function Collage({ arts }: { arts: (string | undefined)[] }) {
  if (arts.length < 4) return <Art src={arts[0]} size={64} />
  return (
    <div className="collage" aria-hidden="true">
      {arts.map((a, i) => (
        <Art key={i} src={a} size={32} />
      ))}
    </div>
  )
}

function ArtistsTile({ artists }: { artists: ArtistSummary[] }) {
  return (
    <section className="tile" aria-labelledby="try-artists">
      <h2 id="try-artists" className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
        Artists to try
      </h2>
      <ul className="list-none m-0 p-0 grid gap-1">
        {artists.slice(0, 8).map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            <Link to={`/artist/${a.id}`} className="menu-item flex-1 min-w-0" style={{ minHeight: 52 }}>
              <Art src={a.artUrl} size={40} round />
              <span className="min-w-0 grid">
                <span className="truncate" style={{ fontWeight: 600 }}>
                  {a.name}
                </span>
                {a.subtitle && <span className="card-sub truncate">{a.subtitle}</span>}
              </span>
            </Link>
            <button
              className="icon-btn"
              aria-label={`Start ${a.name} radio`}
              title="Start artist radio"
              onClick={() => void startArtistRadio(a.name, a.artUrl)}
            >
              <RadioIcon size={18} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TagsTile({ tags }: { tags: string[] }) {
  return (
    <section className="tile" aria-labelledby="your-sound">
      <h2 id="your-sound" className="section-title">
        Your sound
      </h2>
      <p className="tile-sub" style={{ marginBottom: 'var(--space-3)' }}>
        Genres and moods you lean towards. Pick one for a station.
      </p>
      <div className="chips">
        {tags.map((t) => (
          <button key={t} className="chip" onClick={() => void startTagRadio(t)}>
            <RadioIcon size={14} /> {t}
          </button>
        ))}
      </div>
    </section>
  )
}

function SearchesTile() {
  const navigate = useNavigate()
  const searches = useQuery({ queryKey: SEARCHES_KEY, queryFn: () => api.discover.searches(8), staleTime: 0 })
  if (!searches.data?.length) return null

  const clear = async () => {
    try {
      await api.discover.clearSearches()
      void queryClient.invalidateQueries({ queryKey: ['discover'] })
      toast.info('Search history cleared')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <section className="tile" aria-labelledby="recent-searches">
      <div className="section-head">
        <h2 id="recent-searches" className="section-title">
          Recent searches
        </h2>
        <button className="btn btn-sm" onClick={() => void clear()} title="Forget your search history">
          <TrashIcon size={14} /> Clear
        </button>
      </div>
      <p className="tile-sub" style={{ marginBottom: 'var(--space-3)' }}>
        Discover uses these too. They stay on this computer.
      </p>
      <div className="chips">
        {searches.data.map((s) => (
          <button key={s.query} className="chip" onClick={() => navigate(`/search?q=${encodeURIComponent(s.query)}`)}>
            <SearchIcon size={14} /> {s.query}
          </button>
        ))}
      </div>
    </section>
  )
}

function Shelf({ shelf }: { shelf: DiscoverShelf }) {
  const id = `shelf-${shelf.id}`
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section-head">
        <div className="min-w-0">
          <h2 id={id} className="section-title truncate">
            {shelf.title}
          </h2>
          {shelf.subtitle && <p className="tile-sub truncate">{shelf.subtitle}</p>}
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => player.playList(shelf.tracks, 0, { shuffle: false })}>
            <PlayIcon size={14} /> Play all
          </button>
          {shelf.seed && (
            <button className="btn btn-sm" onClick={() => void startTrackRadio(shelf.seed!)} title="Start a station from this song">
              <RadioIcon size={14} /> Radio
            </button>
          )}
        </div>
      </div>
      <div className="card-grid">
        {shelf.tracks.map((t, i) => (
          <TrackCard key={t.id} shelf={shelf} index={i} />
        ))}
      </div>
    </section>
  )
}

function TrackCard({ shelf, index }: { shelf: DiscoverShelf; index: number }) {
  const t = shelf.tracks[index]
  const current = usePlayer((s) => currentTrack(s)?.id === t.id)
  const playing = usePlayer((s) => s.playing)
  return (
    <button
      className="card discover-card"
      onClick={() => player.playList(shelf.tracks, index)}
      aria-label={`Play ${t.title} by ${t.artist}`}
      aria-current={current || undefined}
    >
      <div className="relative">
        <Art src={t.artUrl} className="w-full" />
        <span className="discover-card-play" aria-hidden="true">
          {current ? <Equalizer paused={!playing} /> : <PlayIcon size={18} />}
        </span>
      </div>
      <span className="card-title truncate">{t.title}</span>
      <span className="card-sub truncate">{t.artist}</span>
    </button>
  )
}
