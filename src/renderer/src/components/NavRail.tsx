import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router'
import {
  ChartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CompassIcon,
  FolderIcon,
  HeartIcon,
  HomeIcon,
  LibraryIcon,
  RadioIcon,
  SearchIcon,
  SettingsIcon
} from './Icons'

const LINKS = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/search', label: 'Search', icon: SearchIcon },
  { to: '/discover', label: 'Discover', icon: CompassIcon },
  { to: '/charts', label: 'Charts', icon: ChartIcon },
  { to: '/radio', label: 'Radio', icon: RadioIcon },
  { to: '/liked', label: 'Liked', icon: HeartIcon },
  { to: '/playlists', label: 'Playlists', icon: LibraryIcon },
  { to: '/local', label: 'Local Player', icon: FolderIcon }
]

const ROOTS = [...LINKS.map((l) => l.to), '/settings']

/**
 * Each tab remembers where you were in it, like a phone's tab bar: leaving Playlists from inside a
 * playlist and coming back returns to that playlist, scrolled where you left it. Clicking the tab
 * you're already on goes back to its top page. Pages opened from a tab (an album, an artist)
 * belong to that tab.
 */
function useTabMemory() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState(() => (ROOTS.includes(location.pathname) ? location.pathname : '/'))
  const last = useRef(new Map<string, { path: string; scroll: number }>())
  const tabOfEntry = useRef(new Map<string, string>())
  const here = useRef<{ tab: string; path: string }>({ tab, path: '' })
  /** the tab just clicked, for the page it restores (which isn't a tab root itself) */
  const clicked = useRef<string | null>(null)

  useEffect(() => {
    // Back/forward lands on an entry we've seen: it keeps the tab it was opened under.
    const t = ROOTS.includes(location.pathname)
      ? location.pathname
      : (clicked.current ?? tabOfEntry.current.get(location.key) ?? here.current.tab)
    clicked.current = null
    tabOfEntry.current.set(location.key, t)
    here.current = { tab: t, path: location.pathname + location.search }
    setTab(t)
  }, [location])

  const go = (to: string) => (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    const main = document.getElementById('main')
    const { tab: from, path } = here.current
    last.current.set(from, { path, scroll: main?.scrollTop ?? 0 })
    if (to === from) return navigate(to)
    const saved = last.current.get(to)
    clicked.current = to
    navigate(saved?.path ?? to)
    // after the page renders from cache, put the scroll back where it was
    if (saved?.scroll) requestAnimationFrame(() => requestAnimationFrame(() => main?.scrollTo({ top: saved.scroll })))
  }

  return { tab, go }
}

export function NavRail() {
  const { tab, go } = useTabMemory()
  const link = (to: string, label: string, Icon: typeof SettingsIcon) => (
    <Link
      key={to}
      to={to}
      onClick={go(to)}
      className={`nav-link${tab === to ? ' active' : ''}`}
      aria-current={tab === to ? 'page' : undefined}
      title={label}
    >
      <Icon size={22} />
      <span className="nav-label">{label}</span>
    </Link>
  )
  return (
    <nav className="nav" aria-label="Main">
      <HistoryButtons />
      {LINKS.map(({ to, label, icon }) => link(to, label, icon))}
      <div className="nav-spacer" />
      {link('/settings', 'Settings', SettingsIcon)}
    </nav>
  )
}

/**
 * Back / forward through the pages visited this session. The router keeps each entry's position
 * in history.state.idx; visiting a new page (PUSH) drops everything ahead of it, like a browser.
 */
function HistoryButtons() {
  const navigate = useNavigate()
  const location = useLocation()
  const type = useNavigationType()
  const [pos, setPos] = useState({ idx: 0, max: 0 })

  useEffect(() => {
    const idx = Number((window.history.state as { idx?: number } | null)?.idx ?? 0)
    setPos((p) => ({ idx, max: type === 'PUSH' ? idx : Math.max(p.max, idx) }))
  }, [location.key, type])

  return (
    <div className="nav-history" role="group" aria-label="History">
      <button className="icon-btn" aria-label="Back" title="Back" disabled={pos.idx <= 0} onClick={() => navigate(-1)}>
        <ChevronLeftIcon size={18} />
      </button>
      <button className="icon-btn" aria-label="Forward" title="Forward" disabled={pos.idx >= pos.max} onClick={() => navigate(1)}>
        <ChevronRightIcon size={18} />
      </button>
    </div>
  )
}
