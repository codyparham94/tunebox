import { useState } from 'react'
import type { SeedType, Station } from '@shared/types'
import { Art } from '../components/Art'
import { ArtistInput } from '../components/ArtistInput'
import { Equalizer, PencilIcon, PlayIcon, PlusIcon, TrashIcon } from '../components/Icons'
import { HoldButton } from '../components/HoldButton'
import { StationArtistsDialog } from '../components/StationArtistsDialog'
import { Empty, QueryView } from '../components/States'
import { startArtistRadio, startPlaylistRadio, startTagRadio } from '../lib/actions'
import { timeAgo } from '../lib/format'
import { api, errorMessage, keys, queryClient, usePlaylists, useStations, useTags } from '../lib/queries'
import { player, usePlayer } from '../store/player'
import { toast } from '../store/toast'

const SEED_LABEL: Record<SeedType, string> = { track: 'Song', artist: 'Artist', playlist: 'Playlist', tag: 'Genre' }

export function Radio() {
  const stations = useStations()
  const [editingId, setEditingId] = useState<number | null>(null)
  const editing: Station | null = stations.data?.find((s) => s.id === editingId) ?? null

  return (
    <div className="page">
      <h1 className="page-title">Radio</h1>
      <p className="tile-sub" style={{ marginTop: 'calc(var(--space-4) * -1)', marginBottom: 'var(--space-5)' }}>
        Stations keep playing similar music and learn from 👍, 👎, skips and full listens.
      </p>
      <CreateStation />
      <section className="section" aria-labelledby="stations-title">
        <h2 id="stations-title" className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
          Your stations
        </h2>
        <QueryView query={stations}>
          {(list) =>
            list.length === 0 ? (
              <div className="tile">
                <Empty>No stations yet. Create one, or pick “Start radio” from any song’s ⋯ menu.</Empty>
              </div>
            ) : (
              <div className="station-grid">
                {list.map((st) => (
                  <StationCard key={st.id} station={st} onEditArtists={() => setEditingId(st.id)} />
                ))}
              </div>
            )
          }
        </QueryView>
      </section>
      <StationArtistsDialog station={editing} onClose={() => setEditingId(null)} />
    </div>
  )
}

function StationCard({ station: st, onEditArtists }: { station: Station; onEditArtists: () => void }) {
  const isActive = usePlayer((s) => s.station?.id === st.id)
  const playing = usePlayer((s) => s.playing)
  const [renaming, setRenaming] = useState(false)

  const remove = async () => {
    try {
      if (isActive) player.leaveStation()
      await api.radio.remove(st.id)
      void queryClient.invalidateQueries({ queryKey: keys.stations })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const rename = async (name: string) => {
    setRenaming(false)
    if (!name.trim() || name.trim() === st.name) return
    try {
      const updated = await api.radio.rename(st.id, name)
      void queryClient.invalidateQueries({ queryKey: keys.stations })
      // the player bar and queue show the playing station's name
      if (usePlayer.getState().station?.id === st.id) usePlayer.setState({ station: { id: st.id, name: updated.name } })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <article className={`tile station-card${isActive ? ' tile-primary' : ''}`} aria-label={st.name}>
      <div className="station-head">
        <Art src={st.artUrl} size={64} round={st.seedType === 'artist'} />
        <div className="min-w-0 flex-1">
          <span className="eyebrow muted">{SEED_LABEL[st.seedType]} station</span>
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                e.currentTarget.querySelector('input')?.blur()
              }}
            >
              <label className="sr-only" htmlFor={`rename-${st.id}`}>
                Station name
              </label>
              <input
                id={`rename-${st.id}`}
                className="input station-rename"
                defaultValue={st.name}
                maxLength={80}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => void rename(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    e.currentTarget.value = st.name
                    e.currentTarget.blur()
                  }
                }}
              />
            </form>
          ) : (
            <h3 className="station-name" title={`${st.name} (double-click to rename)`} onDoubleClick={() => setRenaming(true)}>
              {st.name}
            </h3>
          )}
          <p className="tile-sub truncate">
            {isActive ? (
              <>
                <Equalizer paused={!playing} /> Playing
              </>
            ) : st.lastPlayedAt ? (
              `Played ${timeAgo(st.lastPlayedAt)}`
            ) : (
              'New'
            )}
          </p>
          {st.artists.length > 0 && (
            <p className="tile-sub clamp-2" title={st.artists.join(', ')}>
              + {st.artists.join(', ')}
            </p>
          )}
        </div>
      </div>
      <div className="station-actions">
        <button
          className={`btn ${isActive ? 'btn-dark' : 'btn-primary'}`}
          onClick={() => player.playStation(st)}
          aria-label={`${isActive ? 'Restart' : 'Play'} ${st.name}`}
        >
          <PlayIcon size={14} /> {isActive ? 'Restart' : 'Play'}
        </button>
        <button
          className={`btn${isActive ? ' btn-dark' : ''}`}
          onClick={onEditArtists}
          aria-label={`Add artists to ${st.name}`}
          title="Add more artists for a wider mix"
        >
          <PlusIcon size={14} /> Artists{st.artists.length ? ` (${st.artists.length})` : ''}
        </button>
        <span className="station-tools">
          <button className="icon-btn" aria-label={`Rename ${st.name}`} title="Rename" onClick={() => setRenaming(true)}>
            <PencilIcon size={16} />
          </button>
          <HoldButton className="icon-btn" label={`Delete ${st.name} and what it learned`} onConfirm={() => void remove()}>
            <TrashIcon size={18} />
          </HoldButton>
        </span>
      </div>
    </article>
  )
}

function CreateStation() {
  const [mode, setMode] = useState<'artist' | 'tag' | 'playlist'>('artist')
  const [artist, setArtist] = useState('')
  const tags = useTags()
  const playlists = usePlaylists()

  const start = (name: string, artUrl?: string) => {
    if (!name.trim()) return
    void startArtistRadio(name, artUrl)
    setArtist('')
  }

  return (
    <section className="tile tile-secondary create-station" aria-labelledby="create-title">
      <h2 id="create-title" className="tile-title">
        Create a station
      </h2>
      <div className="tabs" role="tablist" aria-label="Station seed">
        {(['artist', 'tag', 'playlist'] as const).map((m) => (
          <button key={m} role="tab" className="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
            {{ artist: 'From an artist', tag: 'From a genre', playlist: 'From a playlist' }[m]}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {mode === 'artist' && (
          <form
            className="row"
            style={{ flexWrap: 'nowrap' }}
            onSubmit={(e) => {
              e.preventDefault()
              start(artist)
            }}
          >
            <label htmlFor="cs-artist" className="sr-only">
              Artist name
            </label>
            <ArtistInput
              id="cs-artist"
              placeholder="Search for an artist, e.g. Khruangbin"
              value={artist}
              onChange={setArtist}
              onPick={(a) => start(a.name, a.artUrl)}
            />
            <button className="btn btn-dark" disabled={!artist.trim()}>
              Start
            </button>
          </form>
        )}
        {mode === 'tag' && (
          <QueryView query={tags}>
            {(list) => (
              <div className="chips">
                {list.map((t) => (
                  <button key={t} className="chip" onClick={() => void startTagRadio(t)}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </QueryView>
        )}
        {mode === 'playlist' && (
          <QueryView query={playlists} isEmpty={(d) => d.length === 0} empty="You don’t have any playlists yet.">
            {(list) => (
              <div className="playlist-strip">
                {list.map((pl) => (
                  <button key={pl.id} className="menu-item" style={{ minHeight: 44 }} onClick={() => void startPlaylistRadio(pl)}>
                    <Art src={pl.artUrl} size={32} />
                    <span className="truncate">{pl.name}</span>
                  </button>
                ))}
              </div>
            )}
          </QueryView>
        )}
      </div>
    </section>
  )
}
