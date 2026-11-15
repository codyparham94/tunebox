import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { CriticSource } from '@shared/types'
import { LookupAlbumCard } from '../components/Cards'
import { Empty, QueryView } from '../components/States'
import { api, errorMessage, useCriticList, useCriticLists, useCriticsFeed } from '../lib/queries'
import { toast } from '../store/toast'

const SOURCES: Record<CriticSource, string> = {
  pitchfork: 'Pitchfork',
  needledrop: 'The Needle Drop',
  bandcamp: 'Bandcamp',
  stereogum: 'Stereogum'
}
const VIEW_KEY = 'tunebox:critics-view'
type Mode = 'new' | 'best'
type Chip = 'all' | CriticSource

const MODES: { id: Mode; label: string }[] = [
  { id: 'new', label: 'Newly acclaimed' },
  { id: 'best', label: 'Best of' }
]
const CHIPS: { id: Chip; label: string }[] = [
  { id: 'all', label: 'All' },
  ...(Object.entries(SOURCES) as [CriticSource, string][]).map(([id, label]) => ({ id, label }))
]

function loadView(): { mode: Mode; chip: Chip } {
  try {
    const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? '{}')
    return { mode: v.mode === 'best' ? 'best' : 'new', chip: v.chip in SOURCES ? v.chip : 'all' }
  } catch {
    return { mode: 'new', chip: 'all' }
  }
}

/** Tab row with a roving tabindex and arrow keys, like Search. */
function Tabs<T extends string>(props: {
  label: string
  idBase: string
  panel: string
  items: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  const { label, idBase, panel, items, value, onChange } = props
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]
    onChange(next.id)
    document.getElementById(`${idBase}-${next.id}`)?.focus()
  }
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t, i) => (
        <button
          key={t.id}
          id={`${idBase}-${t.id}`}
          role="tab"
          className="tab"
          aria-selected={value === t.id}
          aria-controls={panel}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Critics() {
  const qc = useQueryClient()
  const [view, setView] = useState(loadView)
  const [listId, setListId] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const { mode, chip } = view
  const change = (next: Partial<typeof view>) => {
    const v = { ...view, ...next }
    setView(v)
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify(v))
    } catch {
      /* storage off: the choice just isn't remembered */
    }
  }

  const feed = useCriticsFeed()
  const lists = useCriticLists()
  // a Refresh can drop the chosen list from the index: fall back to the default
  const id =
    (lists.data?.some((l) => l.id === listId)
      ? listId
      : (lists.data?.find((l) => l.source === 'pitchfork') ?? lists.data?.[0])?.id) ?? ''
  const list = useCriticList(id)

  const refresh = async () => {
    setRefreshing(true)
    try {
      if (mode === 'new') qc.setQueryData(['critics', 'feed'], await api.critics.scan())
      else {
        if (id) qc.setQueryData(['critics', 'list', id], await api.critics.list(id, true))
        qc.setQueryData(['critics', 'lists'], await api.critics.lists(true))
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Critics’ Picks</h1>
        <button className="btn" disabled={refreshing} onClick={() => void refresh()}>
          {refreshing && <span className="spinner" aria-hidden="true" />} Refresh
        </button>
      </div>
      <Tabs label="Critics’ Picks view" idBase="critics-mode" panel="critics-panel" items={MODES} value={mode} onChange={(m) => change({ mode: m })} />
      {mode === 'new' &&
        feed.data?.failed.map((s) => (
          <p key={s} className="tile-sub" style={{ marginBottom: 'var(--space-2)' }}>
            Couldn’t update {SOURCES[s]} just now.
          </p>
        ))}

      <div role="tabpanel" id="critics-panel" aria-labelledby={`critics-mode-${mode}`}>
        {mode === 'new' ? (
          <QueryView query={feed} rows={2} isEmpty={(d) => d.albums.length === 0} empty="No picks yet. Try Refresh.">
            {(f) => {
              const shown = f.albums.filter((a) => chip === 'all' || a.source === chip)
              return (
                <>
                  <Tabs label="Source" idBase="critics-chip" panel="critics-chip-panel" items={CHIPS} value={chip} onChange={(c) => change({ chip: c })} />
                  <div role="tabpanel" id="critics-chip-panel" aria-labelledby={`critics-chip-${chip}`}>
                    {shown.length === 0 ? (
                      <Empty>No picks from {chip === 'all' ? 'any source' : SOURCES[chip]} yet.</Empty>
                    ) : (
                      <div className="card-grid">
                        {shown.map((a) => (
                          <LookupAlbumCard
                            key={`${a.source}|${a.title}|${a.artist}`}
                            title={a.title}
                            artist={a.artist}
                            artUrl={a.artUrl}
                            badge={`${SOURCES[a.source]} · ${a.verdict}`}
                            date={a.date}
                            reviewUrl={a.reviewUrl}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )
            }}
          </QueryView>
        ) : (
          <QueryView query={lists} rows={2} isEmpty={(d) => d.length === 0} empty="No lists available right now.">
            {(all) => (
              <>
                <label>
                  <span className="sr-only">List</span>
                  <select
                    className="input genre-select"
                    value={id}
                    onChange={(e) => setListId(e.target.value)}
                    style={{ marginBottom: 'var(--space-4)' }}
                  >
                    {all.map((l) => (
                      <option key={l.id} value={l.id}>
                        {SOURCES[l.source]} · {l.title}
                      </option>
                    ))}
                  </select>
                </label>
                <QueryView query={list} rows={2} isEmpty={(d) => d.albums.length === 0} empty="This list is empty.">
                  {(l) => (
                    <div className="card-grid">
                      {l.albums.map((a, i) => (
                        <LookupAlbumCard
                          key={`${a.title}|${a.artist}`}
                          title={a.title}
                          artist={a.artist}
                          artUrl={a.artUrl}
                          rank={l.ranked ? (a.rank ?? i + 1) : undefined}
                          reviewUrl={a.reviewUrl}
                        />
                      ))}
                    </div>
                  )}
                </QueryView>
              </>
            )}
          </QueryView>
        )}
      </div>
    </div>
  )
}
