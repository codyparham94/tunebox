import { useEffect } from 'react'
import { HashRouter, Route, Routes, useNavigate } from 'react-router'
import type { ThemeSetting } from '@shared/types'
import { AddToPlaylistDialog } from './components/AddToPlaylistDialog'
import { NavRail } from './components/NavRail'
import { PlayerBar } from './components/PlayerBar'
import { QueuePanel } from './components/QueuePanel'
import { Toasts } from './components/Toasts'
import { keys, queryClient, useSettings } from './lib/queries'
import { resolveTheme } from './lib/themes'
import { Artist } from './pages/Artist'
import { Charts } from './pages/Charts'
import { Album, Liked, Playlist, RemotePlaylist } from './pages/Collection'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { Local } from './pages/Local'
import { Radio } from './pages/Radio'
import { Search } from './pages/Search'
import { Settings } from './pages/Settings'
import { initPlayer, player } from './store/player'
import { toast } from './store/toast'
import { useUi } from './store/ui'

export function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}

function Shell() {
  const queueOpen = useUi((s) => s.queueOpen)
  const settings = useSettings().data
  useTheme(settings?.theme ?? 'system')
  useKeyboard()
  useOsEvents()

  useEffect(() => {
    if (settings) initPlayer(settings.volume)
    // only the first load sets volume; later changes come from the player itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings === undefined])

  return (
    <div className="shell">
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <NavRail />
      <main id="main" className="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/charts" element={<Charts />} />
          <Route path="/artist/:id" element={<Artist />} />
          <Route path="/album/:id" element={<Album />} />
          <Route path="/remote-playlist/:id" element={<RemotePlaylist />} />
          <Route path="/playlist/:id" element={<Playlist />} />
          <Route path="/liked" element={<Liked />} />
          <Route path="/radio" element={<Radio />} />
          <Route path="/library" element={<Library />} />
          <Route path="/local" element={<Local />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {queueOpen && <QueuePanel />}
      <PlayerBar />
      <AddToPlaylistDialog />
      <Toasts />
    </div>
  )
}

function useTheme(setting: ThemeSetting) {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(setting, media.matches)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [setting])
}

function useKeyboard() {
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const el = e.target as HTMLElement
      const isRange = el instanceof HTMLInputElement && el.type === 'range'
      const typing = !!el.closest('input, textarea, select, [contenteditable="true"]') && !isRange
      if (typing || document.querySelector('dialog[open]')) return

      if (e.key === '/') {
        e.preventDefault()
        navigate('/search')
        requestAnimationFrame(() => window.dispatchEvent(new Event('tunebox:focus-search')))
      } else if (e.key === ' ' && !el.closest('button, a, [role="menuitem"], [role="tab"]')) {
        e.preventDefault()
        player.toggle()
      } else if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault()
        player.next()
      } else if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        player.prev()
      } else if (!isRange && !e.altKey && !e.ctrlKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault()
        player.seekBy(e.key === 'ArrowRight' ? 5 : -5)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
}

function useOsEvents() {
  useEffect(() => {
    const offCommand = window.api.onCommand((cmd) => {
      if (cmd === 'playPause') player.toggle()
      else if (cmd === 'next') player.next()
      else if (cmd === 'prev') player.prev()
      else if (cmd === 'thumbUp') player.thumb(1)
      else if (cmd === 'thumbDown') player.thumb(-1)
    })
    let warned = false
    const offHealth = window.api.onHealth((h) => {
      queryClient.setQueryData(keys.health, h)
      if (!h.youtubei && !h.ytdlp && !warned) {
        warned = true
        toast.error('Playback engine check failed. Open Settings → Playback engine and update yt-dlp.')
      }
    })
    return () => {
      offCommand()
      offHealth()
    }
  }, [])
}
