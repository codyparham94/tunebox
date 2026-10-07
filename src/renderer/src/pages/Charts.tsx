import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { ChartAlbum, ChartArtist } from '@shared/types'
import { Art } from '../components/Art'
import { PlayIcon, RadioIcon, ShuffleIcon } from '../components/Icons'
import { Empty, QueryView } from '../components/States'
import { TrackList } from '../components/TrackList'
import { startArtistRadio } from '../lib/actions'
import { plural } from '../lib/format'
import { api, errorMessage, useGenres } from '../lib/queries'
import { player } from '../store/player'
import { toast } from '../store/toast'

const LONG = { staleTime: 30 * 60 * 1000 }

export function Charts() {
  const [genre, setGenre] = useState(0)
  const genres = useGenres()
  const genreName = genre === 0 ? 'All genres' : (genres.data?.find((g) => g.id === genre)?.name ?? '')

  const top = useQuery({ queryKey: ['charts', genre, 40], queryFn: () => api.catalog.charts(genre, 40), ...LONG })
  const albums = useQuery({ queryKey: ['chartAlbums', genre], queryFn: () => api.catalog.chartAlbums(genre), ...LONG })
  const artists = useQuery({ queryKey: ['chartArtists', genre], queryFn: () => api.catalog.chartArtists(genre), ...LONG })
  const mine = useQuery({ queryKey: ['history', 'top', 30], queryFn: () => api.library.topPlayed(30, 10), staleTime: 0 })

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Charts</h1>
        <label>
          <span className="sr-only">Genre</span>
          <select className="input genre-select" value={genre} onChange={(e) => setGenre(Number(e.target.value))}>
            {[{ id: 0, name: 'All genres' }, ...(genres.data ?? [])].map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="charts-layout">
        <section className="tile" aria-labelledby="top40">
          <div className="section-head">
            <div>
              <h2 id="top40" className="section-title">
                Top 40
              </h2>
              <p className="tile-sub">{genreName} · updated daily from Deezer</p>
            </div>
            <div className="row">
              <button className="btn btn-primary" disabled={!top.data?.length} onClick={() => player.playList(top.data!, 0, { shuffle: false })}>
                <PlayIcon size={14} /> Play all
              </button>
              <button className="btn" disabled={!top.data?.length} onClick={() => player.playList(top.data!, 0, { shuffle: true })}>
                <ShuffleIcon size={14} /> Shuffle
              </button>
            </div>
          </div>
          <QueryView query={top} rows={10} isEmpty={(d) => d.length === 0} empty="No chart for this genre right now.">
            {(tracks) => <TrackList label="Top 40" tracks={tracks} numbered />}
          </QueryView>
        </section>

        <div className="grid gap-4 content-start">
          <section className="tile" aria-labelledby="mine">
            <h2 id="mine" className="section-title">
              Your most played
            </h2>
            <p className="tile-sub" style={{ marginBottom: 'var(--space-3)' }}>
              Last 30 days
            </p>
            <QueryView query={mine} rows={3}>
              {(list) =>
                list.length === 0 ? (
                  <Empty>Listen for a while and your top songs show up here.</Empty>
                ) : (
                  <>
                    <TrackList label="Your most played" tracks={list.map((x) => x.track)} compact />
                    <p className="tile-sub" style={{ marginTop: 'var(--space-2)' }}>
                      #1 played {plural(list[0].plays, 'time')}
                    </p>
                  </>
                )
              }
            </QueryView>
          </section>
        </div>
      </div>

      <section className="section" aria-labelledby="top-artists">
        <h2 id="top-artists" className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
          Top artists
        </h2>
        <QueryView query={artists} rows={2} isEmpty={(d) => d.length === 0} empty="No artists to show.">
          {(list) => (
            <ol className="card-grid shelf-row list-none m-0 p-0">
              {list.slice(0, 12).map((a, i) => (
                <ArtistCardFromChart key={a.name} artist={a} rank={i + 1} />
              ))}
            </ol>
          )}
        </QueryView>
      </section>

      <section className="section" aria-labelledby="top-albums">
        <h2 id="top-albums" className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
          Top albums
        </h2>
        <QueryView query={albums} rows={2} isEmpty={(d) => d.length === 0} empty="No albums to show.">
          {(list) => (
            <div className="card-grid">
              {list.map((a, i) => (
                <AlbumCardFromChart key={`${a.title}-${a.artist}`} album={a} rank={i + 1} />
              ))}
            </div>
          )}
        </QueryView>
      </section>
    </div>
  )
}

/** Chart entries come from Deezer; find the matching YT Music page on click. */
function useOpen() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const open = async (key: string, find: () => Promise<string | null>, route: (id: string) => string, what: string) => {
    setBusy(key)
    try {
      const id = await find()
      if (id) navigate(route(id))
      else toast.error(`Couldn’t find ${what} on YouTube Music.`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }
  return { busy, open }
}

/** Round art with the rank on it; the radio button sits on the art so the name gets the full width. */
function ArtistCardFromChart({ artist, rank }: { artist: ChartArtist; rank: number }) {
  const { busy, open } = useOpen()
  return (
    <li className="chart-artist">
      <button
        className="card"
        onClick={() => open(artist.name, () => api.catalog.findArtist(artist.name), (id) => `/artist/${id}`, artist.name)}
        aria-busy={busy === artist.name}
      >
        <div className="relative">
          <Art src={artist.artUrl} className="w-full" round />
          <span className="rank-badge mono">{rank}</span>
          {busy === artist.name && (
            <span className="absolute inset-0 grid place-items-center rounded-full" style={{ background: 'var(--overlay)' }}>
              <span className="spinner" />
            </span>
          )}
        </div>
        <span className="card-title truncate text-center">{artist.name}</span>
      </button>
      <button
        className="icon-btn chart-artist-radio"
        aria-label={`Start ${artist.name} radio`}
        title="Start artist radio"
        onClick={() => void startArtistRadio(artist.name, artist.artUrl)}
      >
        <RadioIcon size={16} />
      </button>
    </li>
  )
}

function AlbumCardFromChart({ album, rank }: { album: ChartAlbum; rank: number }) {
  const { busy, open } = useOpen()
  const key = `${album.title}|${album.artist}`
  return (
    <button
      className="card"
      onClick={() => open(key, () => api.catalog.findAlbum(album.title, album.artist), (id) => `/album/${id}`, `“${album.title}”`)}
      aria-busy={busy === key}
    >
      <div className="relative">
        <Art src={album.artUrl} className="w-full" />
        <span className="rank-badge mono">{rank}</span>
        {busy === key && (
          <span className="absolute inset-0 grid place-items-center" style={{ background: 'var(--overlay)' }}>
            <span className="spinner" />
          </span>
        )}
      </div>
      <span className="card-title truncate">{album.title}</span>
      <span className="card-sub truncate">{album.artist}</span>
    </button>
  )
}
