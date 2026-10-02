import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

const { autoUpdater } = electronUpdater

const FIRST_CHECK_MS = 15_000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

let status: UpdateStatus = { state: 'idle' }
let emit: (s: UpdateStatus) => void = () => {}
let started = false

function set(next: UpdateStatus): void {
  status = next
  emit(status)
}

/** Release notes arrive as HTML from GitHub; the prompt shows plain text. */
function plainNotes(notes: unknown): string | undefined {
  const text = Array.isArray(notes) ? notes.map((n) => n?.note ?? '').join('\n') : typeof notes === 'string' ? notes : ''
  const plain = text
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return plain || undefined
}

/**
 * Checks GitHub Releases for a newer version. Nothing downloads until the user agrees;
 * then it downloads, installs over the current version and restarts.
 * Only runs in the installed app (a dev build has no release feed).
 */
export function startUpdater(onStatus: (s: UpdateStatus) => void): void {
  emit = onStatus
  if (!app.isPackaged || started) return
  started = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null
  // For testing a build against a local copy of the release files instead of GitHub.
  const feed = process.env.TUNEBOX_UPDATE_FEED
  if (feed) autoUpdater.setFeedURL({ provider: 'generic', url: feed })

  autoUpdater.on('update-available', (info) =>
    set({ state: 'available', version: info.version, notes: plainNotes(info.releaseNotes) })
  )
  autoUpdater.on('update-not-available', () => {
    if (status.state === 'checking') set({ state: 'idle' })
  })
  autoUpdater.on('download-progress', (p) =>
    set({ state: 'downloading', version: status.version, percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'ready', version: info.version })
    // Silent install over the current version, then reopen Tunebox.
    if (process.env.TUNEBOX_UPDATE_DRYRUN) console.log(`[updater] dry run: would install ${info.version} now`)
    else setTimeout(() => autoUpdater.quitAndInstall(true, true), 1200)
  })
  autoUpdater.on('error', (err) => {
    console.warn('[updater]', err.message)
    // A failed background check is not worth interrupting anyone; a failed install is.
    if (status.state === 'downloading' || status.state === 'ready') set({ state: 'error', version: status.version, error: err.message })
    else if (status.state === 'checking') set({ state: 'idle' })
  })

  setTimeout(() => void checkForUpdate(), FIRST_CHECK_MS)
  setInterval(() => void checkForUpdate(), CHECK_EVERY_MS)
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  if (!app.isPackaged) return { state: 'unsupported' }
  if (status.state === 'downloading' || status.state === 'ready') return status
  set({ state: 'checking' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    set({ state: 'idle' })
    throw new Error(`Couldn’t check for updates: ${(err as Error).message}`)
  }
  return status
}

export async function installUpdate(): Promise<void> {
  if (status.state !== 'available' && status.state !== 'error') throw new Error('No update is ready to install.')
  set({ state: 'downloading', version: status.version, percent: 0 })
  await autoUpdater.downloadUpdate()
}

export const updateStatus = (): UpdateStatus => status
