import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ImportResult, LocalPlaylist, PlaylistSearchSource, RemotePlaylistSummary } from '@shared/types'
import { Art } from '../components/Art'
import { RemotePlaylistCard } from '../components/Cards'
import { HoldButton } from '../components/HoldButton'
import { DownloadIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/Icons'
import { QueryView } from '../components/States'
import { plural } from '../lib/format'
import { api, errorMessage, invalidatePlaylists, usePlaylists } from '../lib/queries'
import { toast, useToasts } from '../store/toast'

export function Playlists() {
  const playlists = usePlaylists()
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
    <div className="page">
      <div className="section-head" style={{ marginBottom: 'var(--space-5)' }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Playlists
        </h1>
        <button className="btn btn-primary" onClick={() => void create()}>
          <PlusIcon size={16} /> New playlist
        </button>
      </div>

      <div className="stack">
        <ImportTile />

        <section className="tile" aria-labelledby="pls">
          <h2 id="pls" className="tile-title">
            Your playlists
          </h2>
          <QueryView query={playlists} isEmpty={(d) => d.length === 0} empty="No playlists yet. Create one, or import one above.">
            {(list) => (
              <div className="card-grid">
                {list.map((pl) => (
                  <PlaylistCard key={pl.id} playlist={pl} />
                ))}
              </div>
            )}
          </QueryView>
        </section>

        <FindPlaylists />
      </div>
    </div>
  )
}

function PlaylistCard({ playlist: pl }: { playlist: LocalPlaylist }) {
  const remove = async () => {
    try {
      await api.library.deletePlaylist(pl.id)
      toast.success(`Deleted “${pl.name}”`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
    invalidatePlaylists()
  }
  return (
    <div className="pl-card">
      <Link to={`/playlist/${pl.id}`} className="card">
        <Art src={pl.artUrl} className="w-full" />
        <span className="card-title truncate" title={pl.name}>
          {pl.name}
        </span>
        <span className="card-sub">{plural(pl.trackCount, 'song')}</span>
      </Link>
      <HoldButton className="icon-btn pl-card-delete" label={`Hold to delete ${pl.name}`} onConfirm={() => void remove()}>
        <TrashIcon size={16} />
      </HoldButton>
    </div>
  )
}

const SOURCES: { id: PlaylistSearchSource; label: string }[] = [
  { id: 'youtube', label: 'YouTube Music' },
  { id: 'deezer', label: 'Deezer' }
]

/** Search public playlists. YouTube ones open in the app; others are imported (matched to YouTube) on click. */
function FindPlaylists() {
  const [source, setSource] = useState<PlaylistSearchSource>('youtube')
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const importer = useImporter()

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 350)
    return () => clearTimeout(t)
  }, [input])

  const results = useQuery({
    queryKey: ['playlistSearch', source, q],
    queryFn: () => api.catalog.searchPlaylists(q, source),
    // Deezer lists its popular playlists before anything is typed
    enabled: q.length >= 2 || source === 'deezer',
    staleTime: 30 * 60 * 1000
  })

  return (
    <section className="tile" aria-labelledby="find-title">
      <div className="section-head">
        <h2 id="find-title" className="tile-title" style={{ margin: 0 }}>
          Find playlists
        </h2>
        <div className="tabs" role="tablist" aria-label="Playlist source" style={{ margin: 0 }}>
          {SOURCES.map((s) => (
            <button key={s.id} role="tab" className="tab" aria-selected={source === s.id} onClick={() => setSource(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <form role="search" className="relative" style={{ marginBottom: 'var(--space-4)' }} onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="find-pl" className="sr-only">
          Search playlists
        </label>
        <span className="absolute muted" style={{ left: 12, top: 10 }}>
          <SearchIcon size={20} />
        </span>
        <input
          id="find-pl"
          type="search"
          className="input"
          style={{ paddingLeft: 40 }}
          placeholder={source === 'deezer' ? 'Search Deezer playlists, or browse popular ones below' : 'Search YouTube Music playlists, e.g. lofi beats'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
        />
      </form>
      {source === 'youtube' && q.length < 2 ? (
        <p className="tile-sub">Type a mood, genre or artist to find playlists.</p>
      ) : (
        <QueryView query={results} rows={2} isEmpty={(d) => d.length === 0} empty={`No playlists found for “${q}”.`}>
          {(list) => (
            <div className="card-grid">
              {list.map((p) =>
                p.url ? (
                  <ImportCard key={p.id} playlist={p} busy={importer.busy} onImport={() => void importer.run(p.url!)} />
                ) : (
                  <RemotePlaylistCard key={p.id} playlist={p} />
                )
              )}
            </div>
          )}
        </QueryView>
      )}
    </section>
  )
}

function ImportCard({ playlist: p, busy, onImport }: { playlist: RemotePlaylistSummary; busy: boolean; onImport: () => void }) {
  return (
    <button className="card" disabled={busy} onClick={onImport} title={`Import “${p.title}” to your playlists`}>
      <div className="relative">
        <Art src={p.artUrl} className="w-full" />
        <span className="rank-badge" style={{ left: 'auto', right: 'var(--space-2)' }}>
          <DownloadIcon size={12} /> Import
        </span>
      </div>
      <span className="card-title truncate">{p.title}</span>
      <span className="card-sub truncate">
        {[p.author, p.trackCount ? plural(p.trackCount, 'song') : ''].filter(Boolean).join(' · ')}
      </span>
    </button>
  )
}

const IMPORT_TOAST = 990001
const SOURCE_NAME = { youtube: 'YouTube', spotify: 'Spotify', apple: 'Apple Music', deezer: 'Deezer' } as const

function resultMessage(r: ImportResult): string {
  const parts = [`Imported “${r.name}” (${plural(r.count, 'song')})`]
  if (r.skipped) parts.push(`${plural(r.skipped, 'song')} couldn’t be found on YouTube`)
  if (r.truncated) parts.push(`${SOURCE_NAME[r.source]} only shares the first 100 songs of a playlist`)
  return parts.join('. ')
}

/** Imports a playlist link with progress toasts, then opens it. */
function useImporter() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const show = useToasts((s) => s.show)

  useEffect(
    () =>
      window.api.onImportProgress((p) => {
        if (p.done) return
        const name = p.title ?? 'playlist'
        const message = p.total ? `Finding “${name}” on YouTube… ${p.fetched} of ${p.total}` : `Importing “${name}”… ${p.fetched} songs`
        show({ id: IMPORT_TOAST, kind: 'info', sticky: true, message })
      }),
    [show]
  )

  const run = async (url: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    show({ id: IMPORT_TOAST, kind: 'info', sticky: true, message: 'Reading playlist…' })
    try {
      const r = await api.importer.playlist(url)
      show({ id: IMPORT_TOAST, kind: 'success', message: resultMessage(r) })
      invalidatePlaylists()
      navigate(`/playlist/${r.playlistId}`)
      return true
    } catch (err) {
      const msg = errorMessage(err)
      setError(msg)
      show({ id: IMPORT_TOAST, kind: 'error', message: msg })
      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, run }
}

function ImportTile() {
  const [url, setUrl] = useState('')
  const { busy, error, run } = useImporter()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await run(url)) setUrl('')
  }

  return (
    <section className="tile tile-secondary" aria-labelledby="imp-title">
      <div className="flex items-center gap-2">
        <DownloadIcon size={20} />
        <h2 id="imp-title" className="tile-title" style={{ margin: 0 }}>
          Import a playlist
        </h2>
      </div>
      <p className="tile-sub" style={{ margin: 'var(--space-1) 0 var(--space-3)' }}>
        Paste a public playlist link from YouTube, YouTube Music, Spotify, Apple Music or Deezer. Songs from other services are matched to
        YouTube, so a long playlist takes a minute.
      </p>
      <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={submit}>
        <label htmlFor="imp-url" className="sr-only">
          Playlist link
        </label>
        <input
          id="imp-url"
          className="input"
          placeholder="https://open.spotify.com/playlist/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? 'imp-err' : undefined}
          disabled={busy}
        />
        <button className="btn btn-dark" disabled={busy || !url.trim()}>
          {busy ? <span className="spinner" /> : 'Import'}
        </button>
      </form>
      {error && (
        <p id="imp-err" className="state error" style={{ minHeight: 0, padding: 'var(--space-2) 0 0', justifyItems: 'start' }}>
          {error}
        </p>
      )}
    </section>
  )
}
