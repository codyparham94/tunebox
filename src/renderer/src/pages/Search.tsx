import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { SearchKind } from '@shared/types'
import { AlbumCard, ArtistCard, CardGrid, RemotePlaylistCard } from '../components/Cards'
import { SearchIcon } from '../components/Icons'
import { Empty, QueryView } from '../components/States'
import { TrackList } from '../components/TrackList'
import { useSearch } from '../lib/queries'

const TABS: { id: SearchKind; label: string }[] = [
  { id: 'songs', label: 'Songs' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
  { id: 'playlists', label: 'Playlists' }
]

export function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const tab = (params.get('tab') as SearchKind) || 'songs'
  const [input, setInput] = useState(q)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useSearch(q)

  useEffect(() => {
    const id = setTimeout(() => {
      if (input.trim() !== q) setParams((p) => (input.trim() ? (p.set('q', input.trim()), p) : (p.delete('q'), p)), { replace: true })
    }, 350)
    return () => clearTimeout(id)
  }, [input, q, setParams])

  useEffect(() => {
    const focus = () => inputRef.current?.focus()
    focus()
    window.addEventListener('tunebox:focus-search', focus)
    return () => window.removeEventListener('tunebox:focus-search', focus)
  }, [])

  const selectTab = (id: SearchKind) => setParams((p) => (p.set('tab', id), p), { replace: true })

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
    selectTab(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }

  return (
    <div className="page">
      <h1 className="page-title">Search</h1>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="relative" style={{ marginBottom: 'var(--space-5)' }}>
        <label htmlFor="search-input" className="sr-only">
          Search songs, artists, albums and playlists
        </label>
        <span className="absolute muted" style={{ left: 16, top: 14 }}>
          <SearchIcon size={20} />
        </span>
        <input
          ref={inputRef}
          id="search-input"
          type="search"
          className="input input-lg"
          style={{ paddingLeft: 48 }}
          placeholder="Songs, artists, albums, playlists"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
        />
      </form>

      {!q ? (
        <Empty>
          Search the YouTube Music catalog. Press <span className="kbd">/</span> anywhere to jump here.
        </Empty>
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Result type">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                className="tab"
                aria-selected={tab === t.id}
                aria-controls="search-panel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => selectTab(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {t.label}
                {results.data ? ` (${results.data[t.id].length})` : ''}
              </button>
            ))}
          </div>
          <div id="search-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            <QueryView query={results} rows={8} isEmpty={(d) => d[tab].length === 0} empty={`No ${tab} found for “${q}”.`}>
              {(d) =>
                tab === 'songs' ? (
                  <TrackList label="Songs" tracks={d.songs} />
                ) : tab === 'artists' ? (
                  <CardGrid>
                    {d.artists.map((a) => (
                      <ArtistCard key={a.id} artist={a} />
                    ))}
                  </CardGrid>
                ) : tab === 'albums' ? (
                  <CardGrid>
                    {d.albums.map((a) => (
                      <AlbumCard key={a.id} album={a} />
                    ))}
                  </CardGrid>
                ) : (
                  <CardGrid>
                    {d.playlists.map((p) => (
                      <RemotePlaylistCard key={p.id} playlist={p} />
                    ))}
                  </CardGrid>
                )
              }
            </QueryView>
          </div>
        </>
      )}
    </div>
  )
}
