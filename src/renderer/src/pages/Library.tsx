import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Art } from '../components/Art'
import { HeartFilledIcon, PlusIcon } from '../components/Icons'
import { Empty, QueryView } from '../components/States'
import { TrackList } from '../components/TrackList'
import { plural } from '../lib/format'
import { api, errorMessage, invalidatePlaylists, useHistory, useLiked, usePlaylists } from '../lib/queries'
import { toast, useToasts } from '../store/toast'

export function Library() {
  const playlists = usePlaylists()
  const liked = useLiked()
  const history = useHistory(20)
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
      <h1 className="page-title">Library</h1>
      <div className="bento">
        <Link to="/liked" className="tile tile-primary span-2x1" style={{ textDecoration: 'none' }}>
          <HeartFilledIcon size={32} />
          <h2 className="tile-title" style={{ marginTop: 'auto', marginBottom: 'var(--space-1)', fontSize: 'var(--text-xl)' }}>
            Liked songs
          </h2>
          <p className="tile-sub">{liked.data ? plural(liked.data.length, 'song') : '…'}</p>
        </Link>
        <ImportTile />
        <section className="tile" aria-labelledby="new-title">
          <h2 id="new-title" className="tile-title">
            New playlist
          </h2>
          <p className="tile-sub">Start empty and add songs from any ⋯ menu.</p>
          <button className="btn btn-primary mt-auto" onClick={() => void create()}>
            <PlusIcon size={16} /> Create
          </button>
        </section>
      </div>

      <section className="section" aria-labelledby="pls">
        <h2 id="pls" className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
          Playlists
        </h2>
        <QueryView query={playlists} isEmpty={(d) => d.length === 0} empty="No playlists yet.">
          {(list) => (
            <div className="card-grid">
              {list.map((pl) => (
                <Link key={pl.id} to={`/playlist/${pl.id}`} className="card">
                  <Art src={pl.artUrl} className="w-full" />
                  <span className="card-title truncate">{pl.name}</span>
                  <span className="card-sub">{plural(pl.trackCount, 'song')}</span>
                </Link>
              ))}
            </div>
          )}
        </QueryView>
      </section>

      <section className="section" aria-labelledby="hist">
        <h2 id="hist" className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
          Recently played
        </h2>
        <QueryView query={history} rows={5}>
          {(h) =>
            h.length === 0 ? <Empty>Nothing played yet.</Empty> : <TrackList label="Recently played" tracks={h.map((x) => x.track)} />
          }
        </QueryView>
      </section>
    </div>
  )
}

const IMPORT_TOAST = 990001

function ImportTile() {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const show = useToasts((s) => s.show)

  useEffect(
    () =>
      window.api.onImportProgress((p) => {
        if (!p.done) show({ id: IMPORT_TOAST, kind: 'info', sticky: true, message: `Importing “${p.title ?? 'playlist'}”… ${p.fetched} songs` })
      }),
    [show]
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    show({ id: IMPORT_TOAST, kind: 'info', sticky: true, message: 'Importing playlist…' })
    try {
      const r = await api.importer.playlist(url)
      show({ id: IMPORT_TOAST, kind: 'success', message: `Imported “${r.name}” (${plural(r.count, 'song')})` })
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
    <section className="tile span-2x1" aria-labelledby="imp-title">
      <h2 id="imp-title" className="tile-title">
        Import from YouTube
      </h2>
      <p className="tile-sub" style={{ marginBottom: 'var(--space-3)' }}>
        Paste a public youtube.com or music.youtube.com playlist link.
      </p>
      <form className="row mt-auto" style={{ flexWrap: 'nowrap' }} onSubmit={submit}>
        <label htmlFor="imp-url" className="sr-only">
          Playlist URL
        </label>
        <input
          id="imp-url"
          className="input"
          placeholder="https://music.youtube.com/playlist?list=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? 'imp-err' : undefined}
          disabled={busy}
        />
        <button className="btn btn-primary" disabled={busy || !url.trim()}>
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
