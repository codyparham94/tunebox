import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app, nativeTheme, shell } from 'electron'
import { EVENT } from '@shared/api'
import { DARK_THEME_IDS } from '@shared/themes'
import type { OsCommand, ResolverHealth, Settings } from '@shared/types'
import icon from '../../resources/icon.png?asset'
import { db as currentDb, initContext } from './context'
import { openDb } from './db'
import { getSettings } from './db/settings'
import { checkResolvers, runSmoke } from './health'
import { registerIpc } from './ipc'
import { setGlobalMediaKeys } from './os/mediaKeys'
import { createTray, showWindow } from './os/tray'
import { loadWindowState, trackWindowState } from './os/windowState'
import { configureYouTube } from './sources/ytmusic'
import { handleAudioProtocol, registerAudioScheme } from './stream/protocol'

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

function createWindow(): BrowserWindow {
  const saved = loadWindowState()
  const w = new BrowserWindow({
    ...(saved.centered ? { width: saved.bounds.width, height: saved.bounds.height } : saved.bounds),
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Tunebox',
    icon,
    backgroundColor: startupBackground(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (saved.maximized) w.maximize()
  trackWindowState(w)

  w.once('ready-to-show', () => w.show())
  w.on('close', (e) => {
    if (!quitting && getSettings(currentDb()).closeToTray) {
      e.preventDefault()
      w.hide()
    }
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'file://')) e.preventDefault()
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(join(here, '../renderer/index.html'))
  return w
}


if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow(win))

  void app.whenReady().then(async () => {
    const userData = app.getPath('userData')
    const db = openDb(join(userData, 'tunebox.sqlite'))
    initContext(db, {
      userData,
      ytdlpBundled: app.isPackaged
        ? join(process.resourcesPath, 'bin', 'yt-dlp.exe')
        : join(app.getAppPath(), 'resources', 'bin', 'yt-dlp.exe')
    })
    configureYouTube({ cacheDir: join(userData, 'yt-cache') })

    if (smoke) {
      const ok = await runSmoke()
      app.exit(ok ? 0 : 1)
      return
    }

    handleAudioProtocol()
    registerIpc({ getHealth: () => health, runHealthCheck, onSettingsChanged }, () => win?.webContents)
    win = createWindow()
    createTray(icon, () => win, send)
    onSettingsChanged(getSettings(db))
    win.webContents.once('did-finish-load', () => void runHealthCheck())
  })

  app.on('before-quit', () => {
    quitting = true
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
