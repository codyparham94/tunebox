import { NavLink } from 'react-router'
import { ChartIcon, CompassIcon, FolderIcon, HomeIcon, LibraryIcon, RadioIcon, SearchIcon, SettingsIcon } from './Icons'

const LINKS = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/search', label: 'Search', icon: SearchIcon },
  { to: '/discover', label: 'Discover', icon: CompassIcon },
  { to: '/charts', label: 'Charts', icon: ChartIcon },
  { to: '/radio', label: 'Radio', icon: RadioIcon },
  { to: '/library', label: 'Library', icon: LibraryIcon },
  { to: '/local', label: 'Local files', icon: FolderIcon }
]

export function NavRail() {
  const cls = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`
  return (
    <nav className="nav" aria-label="Main">
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
