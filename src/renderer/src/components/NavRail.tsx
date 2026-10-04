import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate, useNavigationType } from 'react-router'
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
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/search', label: 'Search', icon: SearchIcon },
  { to: '/discover', label: 'Discover', icon: CompassIcon },
  { to: '/charts', label: 'Charts', icon: ChartIcon },
  { to: '/radio', label: 'Radio', icon: RadioIcon },
  { to: '/liked', label: 'Liked', icon: HeartIcon },
  { to: '/playlists', label: 'Playlists', icon: LibraryIcon },
  { to: '/local', label: 'Local Player', icon: FolderIcon }
]

export function NavRail() {
  const cls = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`
  return (
    <nav className="nav" aria-label="Main">
      <HistoryButtons />
      {LINKS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={cls}>
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
      <div className="nav-spacer" />
      <NavLink to="/settings" className={cls}>
        <SettingsIcon size={22} />
        Settings
      </NavLink>
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
