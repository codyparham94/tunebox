import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { LocalScanProgress, LocalScanResult, Track } from '@shared/types'
import { Art } from '../components/Art'
import { CloseIcon, FolderIcon, PlayIcon, SearchIcon, ShuffleIcon } from '../components/Icons'
import { Empty, ErrorState, Loading } from '../components/States'
import { TrackList } from '../components/TrackList'
import { plural, totalDuration } from '../lib/format'
import { api, errorMessage, keys, queryClient, useSettings } from '../lib/queries'
import { player } from '../store/player'
import { toast } from '../store/toast'

type View = 'songs' | 'albums' | 'artists'
type Filter = { kind: 'album' | 'artist'; value: string } | null

const PAGE = 300
/** The folder picker opens by itself only once per session. */
let autoPrompted = false

const primary = (artist: string) => artist.split(',')[0].trim()

export function Local() {
  const settings = useSettings()
  const folder = settings.data?.musicFolder ?? ''
  const tracks = useQuery({ queryKey: ['local'], queryFn: () => api.local.tracks(), enabled: !!folder, staleTime: 0 })
  const [progress, setProgress] = useState<LocalScanProgress | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => window.api.onLocalScan((p) => setProgress(p.done ? null : p)), [])

  const finish = (r: LocalScanResult) => {
    void queryClient.invalidateQueries({ queryKey: keys.settings })
    void queryClient.invalidateQueries({ queryKey: ['local'] })
    const changes = [r.added && `${r.added} added`, r.updated && `${r.updated} updated`, r.removed && `${r.removed} removed`].filter(Boolean)
    toast.success(`${plural(r.total, 'song')} in your music folder${changes.length ? ` (${changes.join(', ')})` : ''}`)
  }

  const run = async (fn: () => Promise<LocalScanResult | null>) => {
    setBusy(true)
    try {
      const r = await fn()
      if (r) finish(r)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }
  const choose = () => run(() => api.local.chooseFolder())
  const rescan = () => run(() => api.local.scan())

  // First visit with no folder: ask right away.
  useEffect(() => {
    if (settings.data && !settings.data.musicFolder && !autoPrompted) {
      autoPrompted = true
      void choose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data])

  if (settings.isPending) return <div className="page"><Loading /></div>

  if (!folder) {
    return (
      <div className="page">
        <h1 className="page-title">Local files</h1>
        <section className="tile tile-primary" style={{ maxWidth: 640 }} aria-labelledby="pick-title">
          <FolderIcon size={36} />
          <h2 id="pick-title" className="section-title" style={{ margin: 'var(--space-3) 0 var(--space-1)' }}>
            Where’s your music?
          </h2>
          <p className="tile-sub" style={{ marginBottom: 'var(--space-4)' }}>
            Pick the folder that holds your music files (MP3, M4A, FLAC, WAV, OGG, Opus). Tunebox scans it and its
            subfolders, and reads titles, artists, albums and cover art from the files. Nothing is uploaded.
          </p>
          <div className="row">
            <button className="btn btn-dark" onClick={() => void choose()} disabled={busy}>
              {busy ? <span className="spinner" /> : <FolderIcon size={16} />} Choose folder
            </button>
          </div>
          {progress && <ScanBar p={progress} />}
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <h1 className="page-title">Local files</h1>
      <section className="tile" aria-label="Music folder" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="section-head" style={{ marginBottom: 0, flexWrap: 'wrap' }}>
          <div className="min-w-0">
            <p className="eyebrow muted" style={{ margin: 0 }}>
              Music folder
            </p>
            <p className="truncate mono" style={{ margin: '2px 0', fontSize: 'var(--text-sm)' }} title={folder}>
              {folder}
            </p>
            <p className="tile-sub">
              {tracks.data ? `${plural(tracks.data.length, 'song')}, ${totalDuration(tracks.data)}` : 'Loading…'}
            </p>
          </div>
          <div className="row">
            <button className="btn btn-primary" disabled={!tracks.data?.length} onClick={() => player.playList(tracks.data!, 0, { shuffle: false })}>
              <PlayIcon size={14} /> Play all
            </button>
            <button className="btn" disabled={!tracks.data?.length} onClick={() => player.playList(tracks.data!, 0, { shuffle: true })}>
              <ShuffleIcon size={14} /> Shuffle
            </button>
            <button className="btn" disabled={busy} onClick={() => void rescan()}>
              {busy ? <span className="spinner" /> : null} Rescan
            </button>
            <button className="btn" disabled={busy} onClick={() => void choose()}>
              <FolderIcon size={14} /> Change folder
            </button>
          </div>
        </div>
        {progress && <ScanBar p={progress} />}
      </section>

      {tracks.isPending ? (
        <Loading rows={8} />
      ) : tracks.isError ? (
        <ErrorState error={tracks.error} retry={() => void tracks.refetch()} />
      ) : tracks.data.length === 0 ? (
        <Empty
          action={
            <button className="btn" onClick={() => void choose()}>
              Choose a different folder
            </button>
          }
        >
          No playable audio files found in this folder.
        </Empty>
      ) : (
        <LocalBrowser tracks={tracks.data} />
      )}
    </div>
  )
}

function ScanBar({ p }: { p: LocalScanProgress }) {
  const pct = p.total ? Math.round((p.scanned / p.total) * 100) : 0
  return (
    <div style={{ marginTop: 'var(--space-3)' }} role="status">
      <p className="tile-sub" style={{ marginBottom: 'var(--space-1)' }}>
        Reading tags… {p.scanned} of {p.total}
      </p>
      <div className="progress">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function LocalBrowser({ tracks }: { tracks: Track[] }) {
  const [view, setView] = useState<View>('songs')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>(null)
  const [limit, setLimit] = useState(PAGE)

  const songs = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tracks.filter((t) => {
      if (filter?.kind === 'album' && t.album !== filter.value) return false
      if (filter?.kind === 'artist' && primary(t.artist) !== filter.value) return false
      return !needle || `${t.title} ${t.artist} ${t.album ?? ''}`.toLowerCase().includes(needle)
    })
  }, [tracks, q, filter])

  const albums = useMemo(() => group(songs, (t) => t.album ?? 'Unknown album'), [songs])
  const artists = useMemo(() => group(songs, (t) => primary(t.artist)), [songs])

  const pick = (f: Filter) => {
    setFilter(f)
    setView('songs')
    setLimit(PAGE)
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 'var(--space-4)', justifyContent: 'space-between' }}>
        <div className="tabs" role="tablist" aria-label="Browse by" style={{ marginBottom: 0 }}>
          {(['songs', 'albums', 'artists'] as const).map((v) => (
            <button key={v} role="tab" className="tab" aria-selected={view === v} onClick={() => setView(v)}>
              {{ songs: `Songs (${songs.length})`, albums: `Albums (${albums.length})`, artists: `Artists (${artists.length})` }[v]}
            </button>
          ))}
        </div>
        <div className="relative" style={{ width: 280 }}>
          <label htmlFor="local-q" className="sr-only">
            Filter local files
          </label>
          <span className="absolute muted" style={{ left: 12, top: 10 }}>
            <SearchIcon size={18} />
          </span>
          <input
            id="local-q"
            className="input"
            style={{ paddingLeft: 38 }}
            placeholder="Filter by title, artist, album"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setLimit(PAGE)
            }}
          />
        </div>
      </div>

      {filter && (
        <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
          <span className="chip chip-active" style={{ cursor: 'default' }}>
            {filter.kind === 'album' ? 'Album' : 'Artist'}: {filter.value}
            <button className="icon-btn" style={{ width: 22, height: 22, color: 'inherit', marginLeft: 4 }} aria-label="Clear filter" onClick={() => setFilter(null)}>
              <CloseIcon size={12} />
            </button>
          </span>
          <button className="btn btn-sm" onClick={() => player.playList(songs)}>
            <PlayIcon size={12} /> Play these
          </button>
        </div>
      )}

      {view === 'songs' &&
        (songs.length === 0 ? (
          <Empty>No songs match.</Empty>
        ) : (
          <>
            <TrackList
              label="Local songs"
              tracks={songs.slice(0, limit)}
              onPlay={(i) => player.playList(songs, i)}
              linkTitles={false}
              numbered
            />
            {songs.length > limit && (
              <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
                <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({songs.length - limit} left)
                </button>
              </div>
            )}
          </>
        ))}

      {view === 'albums' && (
        <div className="card-grid">
          {albums.map((g) => (
            <button key={g.key} className="card" onClick={() => pick({ kind: 'album', value: g.key })}>
              <Art src={g.items[0].artUrl} className="w-full" />
              <span className="card-title truncate">{g.key}</span>
              <span className="card-sub truncate">
                {primary(g.items[0].artist)} · {plural(g.items.length, 'song')}
              </span>
            </button>
          ))}
        </div>
      )}

      {view === 'artists' && (
        <ul className="list-none m-0 p-0 local-artists">
          {artists.map((g) => (
            <li key={g.key}>
              <button className="menu-item" style={{ minHeight: 56 }} onClick={() => pick({ kind: 'artist', value: g.key })}>
                <Art src={g.items[0].artUrl} size={40} round />
                <span className="min-w-0">
                  <span className="truncate block" style={{ fontWeight: 600 }}>
                    {g.key}
                  </span>
                  <span className="card-sub">{plural(g.items.length, 'song')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function group(tracks: Track[], keyOf: (t: Track) => string): { key: string; items: Track[] }[] {
  const map = new Map<string, Track[]>()
  for (const t of tracks) {
    const k = keyOf(t)
    const list = map.get(k)
    if (list) list.push(t)
    else map.set(k, [t])
  }
  return [...map.entries()]
    .map(([key, items]) => ({ key, items }))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { sensitivity: 'base' }))
}
