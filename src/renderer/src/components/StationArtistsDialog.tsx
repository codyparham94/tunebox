import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Station } from '@shared/types'
import { api, errorMessage, keys, queryClient } from '../lib/queries'
import { player } from '../store/player'
import { toast } from '../store/toast'
import { ArtistInput } from './ArtistInput'
import { CloseIcon, PlusIcon } from './Icons'

const MAX_ARTISTS = 10
const norm = (s: string) => s.trim().toLowerCase()

/** Add or remove the extra artists that widen a station. */
export function StationArtistsDialog({ station, onClose }: { station: Station | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [artists, setArtists] = useState<string[]>([])
  // Artists the user already plays make good one-click additions.
  const top = useQuery({
    queryKey: ['history', 'top', 90, 40],
    queryFn: () => api.library.topPlayed(90, 40),
    enabled: !!station,
    staleTime: 0
  })

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (station && !d.open) {
      setName('')
      setArtists(station.artists)
      d.showModal()
    } else if (!station && d.open) d.close()
  }, [station])

  const seedArtist = station?.seedType === 'artist' ? norm(station.seedRef) : ''
  const taken = new Set([seedArtist, ...artists.map(norm)])
  const suggestions = [
    ...new Set((top.data ?? []).map((p) => p.track.artist.split(',')[0].trim()).filter((a) => a && !taken.has(norm(a))))
  ].slice(0, 8)
  const full = artists.length >= MAX_ARTISTS

  const apply = async (fn: () => Promise<Station>, done: string) => {
    if (!station) return
    setBusy(true)
    try {
      const updated = await fn()
      setArtists(updated.artists)
      void queryClient.invalidateQueries({ queryKey: keys.stations })
      player.retuneStation(station.id)
      toast.info(done)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const add = (artist: string) => {
    const a = artist.trim()
    if (!station || !a) return
    setName('')
    void apply(() => api.radio.addArtist(station.id, a), `Added ${a}. New songs will mix in next.`)
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="sa-title">
      <h2 id="sa-title" className="section-title" style={{ marginBottom: 'var(--space-1)' }}>
        Artists on {station?.name}
      </h2>
      <p className="tile-sub" style={{ marginBottom: 'var(--space-4)' }}>
        Add artists to widen this station. Their songs, and songs by similar artists, join the mix.
      </p>

      <form
        className="row"
        style={{ flexWrap: 'nowrap', marginBottom: 'var(--space-4)' }}
        onSubmit={(e) => {
          e.preventDefault()
          add(name)
        }}
      >
        <label className="sr-only" htmlFor="sa-name">
          Artist name
        </label>
        <ArtistInput
          id="sa-name"
          placeholder={full ? `Up to ${MAX_ARTISTS} artists` : 'Search for an artist, e.g. Tame Impala'}
          value={name}
          disabled={full || busy}
          onChange={setName}
          onPick={(a) => add(a.name)}
          exclude={[...(seedArtist ? [station!.seedRef] : []), ...artists]}
        />
        <button className="btn btn-primary" disabled={!name.trim() || busy || full}>
          <PlusIcon size={16} /> Add
        </button>
      </form>

      <h3 className="eyebrow muted" style={{ marginBottom: 'var(--space-2)' }}>
        On this station
      </h3>
      <div className="chips" style={{ marginBottom: 'var(--space-4)' }}>
        {seedArtist && <span className="chip chip-active">{station!.seedRef} · seed</span>}
        {artists.length === 0 && !seedArtist && <span className="tile-sub">Just the seed so far.</span>}
        {artists.map((a) => (
          <span key={a} className="chip station-artist">
            {a}
            <button
              className="chip-remove"
              aria-label={`Remove ${a}`}
              disabled={busy}
              onClick={() => void apply(() => api.radio.removeArtist(station!.id, a), `Removed ${a}`)}
            >
              <CloseIcon size={14} />
            </button>
          </span>
        ))}
      </div>

      {suggestions.length > 0 && !full && (
        <>
          <h3 className="eyebrow muted" style={{ marginBottom: 'var(--space-2)' }}>
            Artists you play
          </h3>
          <div className="chips" style={{ marginBottom: 'var(--space-4)' }}>
            {suggestions.map((a) => (
              <button key={a} className="chip" disabled={busy} onClick={() => add(a)}>
                <PlusIcon size={14} /> {a}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  )
}
