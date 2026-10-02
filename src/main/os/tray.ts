import { Menu, Tray, app, nativeImage, type BrowserWindow } from 'electron'
import type { NowPlaying, OsCommand } from '@shared/types'

let tray: Tray | null = null
let state: NowPlaying = { playing: false, inStation: false }
let getWindow: () => BrowserWindow | null = () => null
let send: (cmd: OsCommand) => void = () => {}

export function createTray(iconPath: string, win: () => BrowserWindow | null, sendCommand: (cmd: OsCommand) => void): void {
  getWindow = win
  send = sendCommand
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }))
  tray.on('click', () => showWindow(getWindow()))
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

function render(): void {
  if (!tray) return
  const label = state.title ? `${state.title} — ${state.artist ?? ''}` : 'Nothing playing'
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
