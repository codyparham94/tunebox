import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import type { ArtistSummary } from '@shared/types'
import { api } from '../lib/queries'
import { Art } from './Art'

const norm = (s: string) => s.trim().toLowerCase()

/**
 * A text box that drops down matching YT Music artists as you type. Picking one calls `onPick`;
 * pressing Enter without a highlighted match leaves the typed text to the surrounding form.
 */
export function ArtistInput({
  id,
  value,
  onChange,
  onPick,
  exclude = [],
  placeholder,
  disabled
}: {
  id: string
  value: string
  onChange: (v: string) => void
  onPick: (artist: ArtistSummary) => void
  /** names already chosen, left out of the list */
  exclude?: string[]
  placeholder?: string
  disabled?: boolean
}) {
  const listId = useId()
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)

  // Wait for a pause in typing, as Search does, so each keystroke isn't a request.
  useEffect(() => {
    const t = setTimeout(() => setQ(value.trim()), 250)
    return () => clearTimeout(t)
  }, [value])

  const results = useQuery({
    queryKey: ['artistSuggest', q],
    queryFn: () => api.catalog.searchArtists(q),
    enabled: q.length >= 2,
    staleTime: 30 * 60 * 1000
  })
  const skip = new Set(exclude.map(norm))
  const options = value.trim().length >= 2 ? (results.data ?? []).filter((a) => !skip.has(norm(a.name))) : []
  const open = focused && !disabled && options.length > 0

  useEffect(() => setActive(-1), [q])

  const pick = (a: ArtistSummary) => {
    setActive(-1)
    onPick(a)
  }

  return (
    <div className="combo">
      <input
        id={id}
        className="input"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          setFocused(true)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const n = options.length
            setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i <= 0 ? n : i) - 1))
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault()
            pick(options[active])
          } else if (e.key === 'Escape') {
            // close the list, not the dialog it may sit in
            e.preventDefault()
            setFocused(false)
          }
        }}
      />
      {open && (
        <ul id={listId} className="combo-list" role="listbox" aria-label="Matching artists">
          {options.map((a, i) => (
            <li
              key={a.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="menu-item"
              // keep focus in the input so the list doesn't close before the click lands
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(a)}
              onMouseEnter={() => setActive(i)}
            >
              <Art src={a.artUrl} size={32} round />
              <span className="min-w-0">
                <span className="block truncate" style={{ fontWeight: 600 }}>
                  {a.name}
                </span>
                {a.subtitle && <span className="block truncate muted" style={{ fontSize: 'var(--text-xs)' }}>{a.subtitle}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
