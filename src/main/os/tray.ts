import { Menu, Tray, app, nativeImage, type BrowserWindow } from 'electron'
import type { NowPlaying, OsCommand } from '@shared/types'
import tray16 from '../../../resources/tray-16.png?asset'
import tray20 from '../../../resources/tray-20.png?asset'
import tray24 from '../../../resources/tray-24.png?asset'
import tray32 from '../../../resources/tray-32.png?asset'
import trayMac from '../../../resources/trayTemplate.png?asset'
import trayMac2x from '../../../resources/trayTemplate@2x.png?asset'

let tray: Tray | null = null
let state: NowPlaying = { playing: false, inStation: false }
let getWindow: () => BrowserWindow | null = () => null
let send: (cmd: OsCommand) => void = () => {}

/**
 * The tray icon is a fixed image: the app's peach tile, drawn at each size Windows asks for
 * (100–200% display scaling) so it stays sharp and never depends on the app theme.
 */
function trayImage(): Electron.NativeImage {
  const img = nativeImage.createEmpty()
  const mac = process.platform === 'darwin'
  // macOS menu bar: monochrome template, recoloured by the system for light/dark menu bars.
  const reps = mac ? ([[1, trayMac], [2, trayMac2x]] as const) : ([[1, tray16], [1.25, tray20], [1.5, tray24], [2, tray32]] as const)
  for (const [scaleFactor, file] of reps) {
    const rep = nativeImage.createFromPath(file)
    // A missing file would leave a blank slot in the tray, so skip it and say so.
    if (rep.isEmpty()) console.warn(`[tray] missing icon ${file}`)
    else img.addRepresentation({ scaleFactor, buffer: rep.toPNG() })
  }
  if (mac) img.setTemplateImage(true)
  return img
}

export function createTray(win: () => BrowserWindow | null, sendCommand: (cmd: OsCommand) => void): void {
  getWindow = win
  send = sendCommand
  tray = new Tray(trayImage())
  // On macOS a click opens the menu (the menu-bar convention); on Windows it shows the window.
  if (process.platform !== 'darwin') tray.on('click', () => showWindow(getWindow()))
  render()
}

export function updateTray(next: NowPlaying): void {
  state = next
  render()
}

export function showWindow(w: BrowserWindow | null): void {
  if (!w) return
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

let shown = ''

function render(): void {
  if (!tray) return
  const label = state.title ? `${state.title} — ${state.artist ?? ''}` : 'Nothing playing'
  // Rebuilding the native menu is the expensive part; skip it when nothing in it changed.
  const key = `${label}|${state.playing}`
  if (key === shown) return
  shown = key
  tray.setToolTip(state.title ? `Tunebox: ${label}`.slice(0, 127) : 'Tunebox')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: label.length > 60 ? `${label.slice(0, 57)}…` : label, enabled: false },
      { type: 'separator' },
      { label: state.playing ? 'Pause' : 'Play', click: () => send('playPause') },
      { label: 'Next', click: () => send('next') },
      { label: 'Previous', click: () => send('prev') },
      { type: 'separator' },
      { label: '👍  Thumbs up', enabled: !!state.title, click: () => send('thumbUp') },
      { label: '👎  Thumbs down', enabled: !!state.title, click: () => send('thumbDown') },
      { type: 'separator' },
      { label: 'Show Tunebox', click: () => showWindow(getWindow()) },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
}
