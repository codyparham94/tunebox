/**
 * Dev-only break-ui lab: #/lab?data=demo|worst|empty|one|huge
 * Swaps fixtures in at the data boundary (query cache + player store) and renders the real
 * components against them. Never shipped: App only routes here when import.meta.env.DEV.
 */
import { useEffect, useLayoutEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { AlbumCard, ArtistCard, CardGrid } from '../components/Cards'
import { TrackList } from '../components/TrackList'
import { keys, queryClient } from '../lib/queries'
import { Home } from '../pages/Home'
import { player, usePlayer } from '../store/player'
import { useUi } from '../store/ui'
import { DATASETS, discoverFeed, type DatasetName } from './fixtures'

const SEGMENTS: [DatasetName, string][] = [
  ['demo', 'Demo data'],
  ['worst', 'Worst case'],
  ['empty', 'Empty'],
  ['one', 'One'],
  ['huge', '1,284 rows']
]

const SEEDED_KEYS = [keys.history, keys.stations, keys.playlists, keys.likedIds, ['discover', 'feed']]

export default function DataLab() {
  const [params, setParams] = useSearchParams()
  const name = (params.get('data') as DatasetName) in DATASETS ? (params.get('data') as DatasetName) : 'worst'
  const d = DATASETS[name]
  const [seeded, setSeeded] = useState<DatasetName | null>(null)

  // Hold the real data off while the lab is open, and give it back on the way out.
  useEffect(() => {
    const before = usePlayer.getState()
    const queueWasOpen = useUi.getState().queueOpen
    if (before.playing) player.toggle()
    for (const key of SEEDED_KEYS) queryClient.setQueryDefaults(key, { enabled: false, staleTime: Infinity })
    useUi.setState({ queueOpen: true })
    return () => {
      for (const key of SEEDED_KEYS) {
        queryClient.setQueryDefaults(key, {})
        void queryClient.invalidateQueries({ queryKey: key })
      }
      usePlayer.setState(before)
      useUi.setState({ queueOpen: queueWasOpen })
    }
  }, [])

  useLayoutEffect(() => {
    queryClient.setQueryData([...keys.history, 25], d.history)
    queryClient.setQueryData([...keys.history, 1], d.history.slice(0, 1))
    queryClient.setQueryData(keys.stations, d.stations)
    queryClient.setQueryData(keys.playlists, d.playlists)
    queryClient.setQueryData(keys.likedIds, new Set(d.likedIds))
    queryClient.setQueryData(['discover', 'feed'], discoverFeed(d))
    const current = d.tracks[d.playing]
    usePlayer.setState({
      queue: d.tracks.map((t, i) => ({ ...t, qid: 900_000 + i })),
      index: d.playing,
      playing: false,
      loading: false,
      position: d.position,
      duration: current?.duration ?? 0,
      station: d.station,
      refilling: false,
      thumbs: current?.id ? { [current.id]: 1 } : {}
    })
    setSeeded(name)
  }, [d, name])

  if (seeded !== name) return null

  return (
    <>
      <Home />
      <div className="page" style={{ paddingTop: 0 }}>
        <section className="section">
          <h2 className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
            Track list
          </h2>
          <TrackList label="Lab tracks" tracks={d.tracks} numbered />
        </section>
        <section className="section">
          <h2 className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
            Albums & artists
          </h2>
          <CardGrid>
            {d.albums.map((a) => (
              <AlbumCard key={a.id} album={a} />
            ))}
            {d.artists.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </CardGrid>
        </section>
        <section className="section">
          <h2 className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
            Compact list in a 280px column
          </h2>
          <div style={{ width: 280, border: '1px dashed var(--border-strong)', borderRadius: 8 }}>
            <TrackList label="Lab compact" tracks={d.tracks.slice(0, 50)} compact />
          </div>
        </section>
      </div>
      <DataToggle value={name} onChange={(v) => setParams({ data: v }, { replace: true })} />
    </>
  )
}

/** Plain chrome on purpose: it's not part of the design under test. */
function DataToggle({ value, onChange }: { value: DatasetName; onChange: (v: DatasetName) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Fixture data"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(var(--player-height) + 12px)',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        gap: 2,
        padding: 3,
        borderRadius: 999,
        background: '#e5e5e5',
        boxShadow: '0 2px 10px rgb(0 0 0 / 0.18)',
        font: '600 12px system-ui, sans-serif'
      }}
    >
      {SEGMENTS.map(([id, label]) => (
        <button
          key={id}
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          style={{
            padding: '6px 12px',
            border: 0,
            borderRadius: 999,
            background: value === id ? '#fff' : 'transparent',
            color: '#111',
            boxShadow: value === id ? '0 1px 2px rgb(0 0 0 / 0.2)' : 'none',
            cursor: 'pointer',
            font: 'inherit',
            transition: 'none'
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
