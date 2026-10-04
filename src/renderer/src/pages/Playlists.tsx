import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ImportResult } from '@shared/types'
import { Art } from '../components/Art'
import { DownloadIcon, PlusIcon } from '../components/Icons'
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
                  <Link key={pl.id} to={`/playlist/${pl.id}`} className="card">
                    <Art src={pl.artUrl} className="w-full" />
                    <span className="card-title truncate" title={pl.name}>
                      {pl.name}
                    </span>
                    <span className="card-sub">{plural(pl.trackCount, 'song')}</span>
                  </Link>
                ))}
              </div>
            )}
          </QueryView>
        </section>
      </div>
    </div>
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

function ImportTile() {
  const [url, setUrl] = useState('')
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    show({ id: IMPORT_TOAST, kind: 'info', sticky: true, message: 'Reading playlist…' })
    try {
      const r = await api.importer.playlist(url)
      show({ id: IMPORT_TOAST, kind: 'success', message: resultMessage(r) })
      invalidatePlaylists()
      setUrl('')
      navigate(`/playlist/${r.playlistId}`)
    } catch (err) {
      const msg = errorMessage(err)
      setError(msg)
      show({ id: IMPORT_TOAST, kind: 'error', message: msg })
    } finally {
      setBusy(false)
    }
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
