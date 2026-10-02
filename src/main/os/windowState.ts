import { screen, type BrowserWindow, type Rectangle } from 'electron'
import { db } from '../context'
import { getState, setState } from '../db/settings'

interface WindowState {
  bounds: Rectangle
  maximized: boolean
}

const DEFAULT: WindowState = { bounds: { x: 0, y: 0, width: 1280, height: 820 }, maximized: false }

/** Saved bounds, or defaults if the saved window would be off-screen. */
export function loadWindowState(): WindowState & { centered: boolean } {
  const saved = getState<WindowState>(db(), 'window')
  if (!saved) return { ...DEFAULT, centered: true }
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    const b = saved.bounds
    return b.x < a.x + a.width - 50 && b.x + b.width > a.x + 50 && b.y >= a.y - 10 && b.y < a.y + a.height - 50
  })
  return visible ? { ...saved, centered: false } : { ...DEFAULT, centered: true }
}

export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined
  const save = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized()) return
      const maximized = win.isMaximized()
      const prev = getState<WindowState>(db(), 'window')
      setState(db(), 'window', { bounds: maximized && prev ? prev.bounds : win.getNormalBounds(), maximized })
    }, 400)
  }
  win.on('resize', save)
  win.on('move', save)
  win.on('maximize', save)
  win.on('unmaximize', save)
}
