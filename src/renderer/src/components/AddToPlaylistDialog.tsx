import { useEffect, useRef, useState } from 'react'
import { addToPlaylist, saveAsPlaylist } from '../lib/actions'
import { plural } from '../lib/format'
import { usePlaylists } from '../lib/queries'
import { useUi } from '../store/ui'
import { Art } from './Art'
import { PlusIcon } from './Icons'
import { Loading } from './States'

export function AddToPlaylistDialog() {
  const { addTarget, closeAddToPlaylist } = useUi()
  const ref = useRef<HTMLDialogElement>(null)
  const playlists = usePlaylists()
  const [name, setName] = useState('')

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (addTarget && !d.open) {
      setName('')
      d.showModal()
    } else if (!addTarget && d.open) d.close()
  }, [addTarget])

  const tracks = addTarget ?? []
  const done = () => closeAddToPlaylist()

  return (
    <dialog ref={ref} className="dialog" onClose={done} aria-labelledby="add-title">
      <h2 id="add-title" className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
        Add to playlist
      </h2>
      <p className="tile-sub" style={{ marginBottom: 'var(--space-4)' }}>
        {tracks.length === 1 ? `“${tracks[0].title}”` : plural(tracks.length, 'song')}
      </p>
      <form
        className="row"
        style={{ flexWrap: 'nowrap', marginBottom: 'var(--space-4)' }}
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          await saveAsPlaylist(name, tracks)
          done()
        }}
      >
        <label className="sr-only" htmlFor="new-pl">
          New playlist name
        </label>
        <input id="new-pl" className="input" placeholder="New playlist name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={!name.trim()}>
          <PlusIcon size={16} /> Create
        </button>
      </form>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {playlists.isPending ? (
          <Loading />
        ) : (
          (playlists.data ?? []).map((pl) => (
            <button
              key={pl.id}
              className="menu-item"
              style={{ minHeight: 52 }}
              onClick={async () => {
                done()
                await addToPlaylist(pl, tracks)
              }}
            >
              <Art src={pl.artUrl} size={36} />
              <span className="min-w-0">
                <span className="truncate block">{pl.name}</span>
                <span className="card-sub">{plural(pl.trackCount, 'song')}</span>
              </span>
            </button>
          ))
        )}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
        <button className="btn" onClick={done}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}
