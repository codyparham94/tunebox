import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app, nativeTheme, screen, shell } from 'electron'
import { EVENT } from '@shared/api'
import { DARK_THEME_IDS } from '@shared/themes'
import type { NowPlaying, OsCommand, ResolverHealth, Settings } from '@shared/types'
import icon from '../../resources/icon.png?asset'
import { db as currentDb, initContext } from './context'
import { openDb } from './db'
import { getSettings, getState, setState } from './db/settings'
import { checkResolvers, runSmoke } from './health'
import { registerIpc } from './ipc'
import { setGlobalMediaKeys } from './os/mediaKeys'
import { createThumbar } from './os/thumbar'
import { createTray, showWindow } from './os/tray'
import { startUpdater } from './os/updater'
import { loadWindowState, trackWindowState } from './os/windowState'
import { configureYouTube } from './sources/ytmusic'
import { handleAudioProtocol, registerAudioScheme } from './stream/protocol'
import { YTDLP_BIN } from './stream/ytdlp'

const here = dirname(fileURLToPath(import.meta.url))
const smoke = process.argv.includes('--smoke')

// Lets tests and dev runs use a throwaway profile.
if (process.env.TUNEBOX_USER_DATA) app.setPath('userData', process.env.TUNEBOX_USER_DATA)

registerAudioScheme()
loadDevEnv()

let win: BrowserWindow | null = null
let quitting = false
let health: ResolverHealth | null = null

/** Dev only: read LASTFM_API_KEY etc. from a gitignored .env. Never bundled. */
function loadDevEnv(): void {
  if (app.isPackaged) return
  const file = join(app.getAppPath(), '.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

function send(cmd: OsCommand): void {
  if (cmd === 'show') return showWindow(win)
  win?.webContents.send(EVENT.command, cmd)
}

async function runHealthCheck(): Promise<ResolverHealth> {
  health = await checkResolvers()
  if (!health.youtubei) console.warn('[health] youtubei.js resolver failing:', health.error ?? 'using yt-dlp')
  win?.webContents.send(EVENT.health, health)
  return health
}

function onSettingsChanged(s: Settings): void {
  setGlobalMediaKeys(s.globalMediaKeys, send)
}

/** Paint the window in roughly the theme's surface colour so startup doesn't flash. */
function startupBackground(): string {
  const theme = getSettings(currentDb()).theme
  const dark = theme === 'system' ? nativeTheme.shouldUseDarkColors : DARK_THEME_IDS.has(theme)
  return dark ? '#0B0B0F' : '#FFF5E6'
}

const WEB_PREFERENCES = {
  preload: join(here, '../preload/index.cjs'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false
}

function createWindow(): BrowserWindow {
  const saved = loadWindowState()
  const w = new BrowserWindow({
    ...(saved.centered ? { width: saved.bounds.width, height: saved.bounds.height } : saved.bounds),
    minWidth: 520,
    minHeight: 480,
    show: false,
    title: 'Tunebox',
    icon,
    backgroundColor: startupBackground(),
    autoHideMenuBar: true,
    webPreferences: WEB_PREFERENCES
  })
  if (saved.maximized) w.maximize()
  trackWindowState(w)

  w.once('ready-to-show', () => w.show())
  w.on('close', (e) => {
    // macOS convention: closing the window keeps the app (and the music) running; ⌘Q quits.
    if (!quitting && (process.platform === 'darwin' || getSettings(currentDb()).closeToTray)) {
      e.preventDefault()
      w.hide()
    }
  })
  loadRenderer(w)
  return w
}

/** Loads the renderer (optionally at a hash route) and locks down navigation. */
function loadRenderer(w: BrowserWindow, hash = ''): void {
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'file://')) e.preventDefault()
  })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash ? `#${hash}` : ''}`)
  else void w.loadFile(join(here, '../renderer/index.html'), hash ? { hash } : undefined)
}

let eqWindow: BrowserWindow | null = null

/** The pop-out equalizer. It only edits settings; audio stays in the main window. */
function openEqWindow(): void {
  if (eqWindow && !eqWindow.isDestroyed()) return showWindow(eqWindow)
  eqWindow = new BrowserWindow({
    width: 620,
    height: 560,
    minWidth: 520,
    minHeight: 460,
    show: false,
    title: 'Tunebox Equalizer',
    icon,
    backgroundColor: startupBackground(),
    autoHideMenuBar: true,
    webPreferences: WEB_PREFERENCES
  })
  eqWindow.once('ready-to-show', () => eqWindow?.show())
  eqWindow.on('closed', () => {
    eqWindow = null
  })
  loadRenderer(eqWindow, '/eq-window')
}

let widget: BrowserWindow | null = null
const WIDGET = { width: 400, height: 84 }

/** Where the widget sits: where the user left it, else the bottom-right corner of the main screen. */
function widgetPosition(): { x: number; y: number } {
  const saved = getState<{ x: number; y: number }>(currentDb(), 'widget')
  const onScreen = (p: { x: number; y: number }) =>
    screen.getAllDisplays().some(({ workArea: a }) => p.x >= a.x && p.y >= a.y && p.x + WIDGET.width <= a.x + a.width && p.y + WIDGET.height <= a.y + a.height)
  if (saved && onScreen(saved)) return saved
  const a = screen.getPrimaryDisplay().workArea
  return { x: a.x + a.width - WIDGET.width - 16, y: a.y + a.height - WIDGET.height - 16 }
}

/**
 * The now-playing widget: a small always-on-top window that replaces the main one.
 * Audio keeps playing in the (hidden) main window; the widget only sends commands.
 */
function setWidget(on: boolean): void {
  if (!on) {
    widget?.close()
    return
  }
  if (widget && !widget.isDestroyed()) return showWindow(widget)
  const w = new BrowserWindow({
    ...WIDGET,
    ...widgetPosition(),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: 'Tunebox',
    icon,
    webPreferences: WEB_PREFERENCES
  })
  widget = w
  w.once('ready-to-show', () => {
    w.show()
    win?.hide()
  })
  w.on('moved', () => {
    const [x, y] = w.getPosition()
    setState(currentDb(), 'widget', { x, y })
  })
  w.on('closed', () => {
    widget = null
    if (!quitting) showWindow(win)
  })
  loadRenderer(w, '/widget')
}

function onNowPlaying(s: NowPlaying): void {
  if (widget && !widget.isDestroyed()) widget.webContents.send(EVENT.nowPlaying, s)
}

if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow(win))
  // macOS: clicking the Dock icon brings back a closed (hidden) window.
  app.on('activate', () => showWindow(win))

  void app.whenReady().then(async () => {
    const userData = app.getPath('userData')
    const db = openDb(join(userData, 'tunebox.sqlite'))
    initContext(db, {
      userData,
      ytdlpBundled: app.isPackaged
        ? join(process.resourcesPath, 'bin', YTDLP_BIN)
        : join(app.getAppPath(), 'resources', 'bin', YTDLP_BIN)
    })
    configureYouTube({ cacheDir: join(userData, 'yt-cache') })

    if (smoke) {
      const ok = await runSmoke()
      app.exit(ok ? 0 : 1)
      return
    }

    handleAudioProtocol()
    registerIpc(
      { getHealth: () => health, runHealthCheck, onSettingsChanged, openEqWindow, setWidget, command: send, nowPlaying: onNowPlaying },
      () => win?.webContents
    )
    win = createWindow()
    createTray(() => win, send)
    createThumbar(win, send)
    onSettingsChanged(getSettings(db))
    win.webContents.once('did-finish-load', () => void runHealthCheck())
    startUpdater((status) => win?.webContents.send(EVENT.update, status))
  })

  app.on('before-quit', () => {
    quitting = true
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
