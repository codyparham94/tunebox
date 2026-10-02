import { useState } from 'react'
import type { SeedType } from '@shared/types'
import { Art } from '../components/Art'
import { Equalizer, PlayIcon, TrashIcon } from '../components/Icons'
import { Empty, QueryView } from '../components/States'
import { startArtistRadio, startPlaylistRadio, startTagRadio } from '../lib/actions'
import { timeAgo } from '../lib/format'
import { api, errorMessage, keys, queryClient, usePlaylists, useStations, useTags } from '../lib/queries'
import { player, usePlayer } from '../store/player'
import { toast } from '../store/toast'

const SEED_LABEL: Record<SeedType, string> = { track: 'Song', artist: 'Artist', playlist: 'Playlist', tag: 'Genre' }

export function Radio() {
  const stations = useStations()
  const active = usePlayer((s) => s.station?.id)
  const playing = usePlayer((s) => s.playing)

  const remove = async (id: number, name: string) => {
    if (!window.confirm(`Delete “${name}” and what it learned?`)) return
    try {
      if (active === id) player.leaveStation()
      await api.radio.remove(id)
      void queryClient.invalidateQueries({ queryKey: keys.stations })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Radio</h1>
      <p className="tile-sub" style={{ marginTop: 'calc(var(--space-4) * -1)', marginBottom: 'var(--space-5)' }}>
        Stations keep playing similar music and learn from 👍, 👎, skips and full listens.
      </p>
      <div className="bento">
        <CreateStation />
        <QueryView query={stations}>
          {(list) =>
            list.length === 0 ? (
              <div className="tile span-2x1">
                <Empty>No stations yet. Create one, or pick “Start radio” from any song’s ⋯ menu.</Empty>
              </div>
            ) : (
              <>
                {list.map((st) => (
                  <article key={st.id} className={`tile${st.id === active ? ' tile-primary' : ''}`} aria-label={st.name}>
                    <div className="flex gap-3 items-start">
                      <Art src={st.artUrl} size={72} round={st.seedType === 'artist'} />
                      <div className="min-w-0 flex-1">
                        <span className="eyebrow muted">{SEED_LABEL[st.seedType]} station</span>
                        <h2 className="tile-title truncate" style={{ margin: 'var(--space-1) 0' }}>
                          {st.name}
                        </h2>
                        <p className="tile-sub">
                          {st.id === active ? (
                            <>
                              <Equalizer paused={!playing} /> Playing
                            </>
                          ) : st.lastPlayedAt ? (
                            `Played ${timeAgo(st.lastPlayedAt)}`
                          ) : (
                            'New'
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="row mt-auto pt-4">
                      <button
                        className={`btn ${st.id === active ? 'btn-dark' : 'btn-primary'}`}
                        onClick={() => player.playStation(st)}
                        aria-label={`Play ${st.name}`}
                      >
                        <PlayIcon size={14} /> {st.id === active ? 'Restart' : 'Play'}
                      </button>
                      <button className="icon-btn" aria-label={`Delete ${st.name}`} onClick={() => void remove(st.id, st.name)}>
                        <TrashIcon size={18} />
                      </button>
                    </div>
                  </article>
                ))}
              </>
            )
          }
        </QueryView>
      </div>
    </div>
  )
}

function CreateStation() {
  const [mode, setMode] = useState<'artist' | 'tag' | 'playlist'>('artist')
  const [artist, setArtist] = useState('')
  const tags = useTags()
  const playlists = usePlaylists()

  return (
    <section className="tile tile-secondary span-2x2" aria-labelledby="create-title">
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
              if (artist.trim()) void startArtistRadio(artist)
              setArtist('')
            }}
          >
            <label htmlFor="cs-artist" className="sr-only">
              Artist name
            </label>
            <input id="cs-artist" className="input" placeholder="e.g. Khruangbin" value={artist} onChange={(e) => setArtist(e.target.value)} />
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
              <div className="grid gap-1">
                {list.map((pl) => (
                  <button key={pl.id} className="menu-item" style={{ minHeight: 44 }} onClick={() => void startPlaylistRadio(pl)}>
                    <Art src={pl.artUrl} size={32} />
                    {pl.name}
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
